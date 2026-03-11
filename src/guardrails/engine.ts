/**
 * Klira SDK v2 — Guardrails engine.
 *
 * Orchestrates the guardrails lifecycle state machine:
 *   IDLE → EVALUATING → DECIDED → AUDIT_SCHEDULED → DONE
 *
 * Wires together: FastRulesEngine, PolicyAugmentation, DecisionRouter,
 * ComplianceAudit, LLMFallbackService. Creates OTel spans per naming convention.
 */

import { context, trace, SpanStatusCode, type Span } from '@opentelemetry/api';
import {
  GuardrailLifecycle,
  GuardrailState,
} from '../contracts/guardrails-lifecycle.js';
import type {
  GuardrailResult,
  GuardrailOptions,
  PolicyDefinition,
} from '../types/index.js';
import { getTracer } from '../observability/pipeline.js';
import { FastRulesEngine } from './fast-rules.js';
import { PolicyAugmentation } from './policy-augmentation.js';
import { routeDecision, type GuardrailDecision } from './decision-router.js';
import { scheduleAudit } from './compliance-audit.js';
import { LLMFallbackService, type LLMService } from './llm-fallback.js';
import { loadDefaultPolicies, loadPoliciesFromYAML, loadPoliciesFromAPI } from './policy-loader.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GuardrailsEngineConfig {
  readonly fastRulesEnabled?: boolean;
  readonly augmentationEnabled?: boolean;
  readonly llmFallbackEnabled?: boolean;
  readonly llmService?: LLMService;
  readonly failureMode?: 'open' | 'closed';
  readonly policyPath?: string;
  readonly policyApiEndpoint?: string;
  readonly apiKey?: string;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class GuardrailsEngine {
  private fastRules: FastRulesEngine;
  private augmentation: PolicyAugmentation;
  private llmFallback: LLMFallbackService;
  private config: GuardrailsEngineConfig;
  private initialized = false;

  constructor(config: GuardrailsEngineConfig = {}) {
    this.config = {
      fastRulesEnabled: true,
      augmentationEnabled: true,
      llmFallbackEnabled: false,
      failureMode: 'open',
      ...config,
    };

    this.fastRules = new FastRulesEngine();
    this.augmentation = new PolicyAugmentation();
    this.llmFallback = new LLMFallbackService();

    if (config.llmService) {
      this.llmFallback.configure(config.llmService);
    }
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    let policies: PolicyDefinition[] = [];

    if (this.config.policyApiEndpoint) {
      policies = await loadPoliciesFromAPI(
        this.config.policyApiEndpoint,
        this.config.apiKey,
      );
    }

    // Fall back to YAML / default if API returned nothing
    if (policies.length === 0) {
      policies = this.config.policyPath
        ? loadPoliciesFromYAML(this.config.policyPath)
        : loadDefaultPolicies();
    }

    this.fastRules.initialize(policies);
    this.augmentation.initialize(policies);
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // -------------------------------------------------------------------------
  // Public evaluate methods
  // -------------------------------------------------------------------------

  async evaluateInput(
    content: string,
    options: GuardrailOptions = {},
  ): Promise<GuardrailResult> {
    return this.evaluate(content, 'inbound', options);
  }

  async evaluateOutput(
    content: string,
    options: GuardrailOptions = {},
  ): Promise<GuardrailResult> {
    return this.evaluate(content, 'outbound', options);
  }

  // -------------------------------------------------------------------------
  // Core evaluate — state machine lifecycle
  // -------------------------------------------------------------------------

  private async evaluate(
    content: string,
    direction: 'inbound' | 'outbound',
    _options: GuardrailOptions,
  ): Promise<GuardrailResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const tracer = getTracer();
    const spanName =
      direction === 'inbound'
        ? 'klira.guardrails.input'
        : 'klira.guardrails.output';

    return tracer.startActiveSpan(spanName, (span: Span) => {
      try {
        return this.runLifecycle(content, direction, span);
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        span.end();
        return this.handleFailure(error, direction);
      }
    });
  }

  private async runLifecycle(
    content: string,
    direction: 'inbound' | 'outbound',
    parentSpan: Span,
  ): Promise<GuardrailResult> {
    const lifecycle = new GuardrailLifecycle();
    const startTime = Date.now();
    const parentCtx = context.active();

    // 1. IDLE → EVALUATING
    lifecycle.transitionTo(GuardrailState.EVALUATING);
    parentSpan.setAttribute('klira.entity_type', 'guardrails');
    parentSpan.setAttribute('klira.guardrails.direction', direction);

    // Run fast rules inside a child span
    const tracer = getTracer();
    const fastRulesResult = tracer.startActiveSpan(
      'klira.guardrails.fast_rules',
      {
        attributes: {
          'klira.entity_type': 'guardrails',
          'klira.guardrails.policy_count': this.fastRules.getPolicyCount(),
        },
      },
      (fastSpan: Span) => {
        const result = this.config.fastRulesEnabled
          ? this.fastRules.evaluate(content, direction)
          : { matches: [], blocked: false, allowed: true };
        fastSpan.setAttribute('klira.guardrails.match_count', result.matches.length);
        fastSpan.setStatus({ code: SpanStatusCode.OK });
        fastSpan.end();
        return result;
      },
    );

    // LLM fallback when fast rules produce zero matches
    let llmFallbackUsed = false;
    if (
      this.config.llmFallbackEnabled &&
      this.llmFallback.isEnabled() &&
      fastRulesResult.matches.length === 0
    ) {
      const llmResult = await this.llmFallback.evaluate(content, direction);
      if (llmResult.matches.length > 0) {
        llmFallbackUsed = true;
        fastRulesResult.matches.push(...llmResult.matches);
        if (llmResult.blocked) {
          (fastRulesResult as any).blocked = true;
          (fastRulesResult as any).allowed = false;
        }
      }
    }

    // Generate augmentation guidelines
    const guidelines = this.config.augmentationEnabled && !fastRulesResult.blocked
      ? this.augmentation.generateGuidelines(
          fastRulesResult.matches,
          fastRulesResult.matches.map((m) => m.ruleId),
        )
      : [];

    // 2. EVALUATING → DECIDED
    lifecycle.transitionTo(GuardrailState.DECIDED);
    const duration = Date.now() - startTime;

    // Route decision inside child span
    const { result, decision } = tracer.startActiveSpan(
      'klira.guardrails.route_decision',
      {
        attributes: {
          'klira.entity_type': 'guardrails',
        },
      },
      (routeSpan: Span) => {
        const effectiveDecision = llmFallbackUsed ? 'llm_fallback' as GuardrailDecision : undefined;
        const routed = routeDecision(fastRulesResult, guidelines, direction, duration);
        const finalDecision = effectiveDecision ?? routed.decision;
        routeSpan.setAttribute('klira.guardrails.decision', finalDecision);
        routeSpan.setAttribute('klira.guardrails.allowed', routed.result.allowed);
        routeSpan.setStatus({ code: SpanStatusCode.OK });
        routeSpan.end();
        return { result: routed.result, decision: finalDecision };
      },
    );

    // Record decision on parent span
    parentSpan.setAttribute('klira.guardrails.decision', decision);
    parentSpan.setAttribute('klira.guardrails.allowed', result.allowed);
    parentSpan.setAttribute('klira.guardrails.match_count', result.matches.length);
    parentSpan.setAttribute('klira.guardrails.augmentation_applied', decision === 'augmented');
    parentSpan.setAttribute('klira.guardrails.evaluation_duration_ms', duration);

    // 3. DECIDED → AUDIT_SCHEDULED (async, never blocks)
    lifecycle.transitionTo(GuardrailState.AUDIT_SCHEDULED);
    scheduleAudit(decision, result, direction, parentCtx);

    // 4. AUDIT_SCHEDULED → DONE
    lifecycle.transitionTo(GuardrailState.DONE);

    parentSpan.setStatus({ code: SpanStatusCode.OK });
    parentSpan.end();

    return result;
  }

  // -------------------------------------------------------------------------
  // Failure handling
  // -------------------------------------------------------------------------

  private handleFailure(
    _error: unknown,
    direction: 'inbound' | 'outbound',
  ): GuardrailResult {
    const failOpen = this.config.failureMode !== 'closed';
    return {
      allowed: failOpen,
      blocked: !failOpen,
      matches: failOpen
        ? []
        : [
            {
              ruleId: 'system-error',
              message: 'Guardrails evaluation failed',
              blocked: true,
            },
          ],
      direction: direction === 'inbound' ? 'input' : 'output',
    };
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  getPolicyCount(): number {
    return this.fastRules.getPolicyCount();
  }

  augmentPrompt(prompt: string, guidelines: readonly string[]): string {
    return this.augmentation.augmentPrompt(prompt, guidelines);
  }
}
