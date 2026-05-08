/**
 * Klira SDK v2 — Guardrails engine.
 *
 * Orchestrates the guardrails lifecycle state machine:
 *   IDLE → EVALUATING → DECIDED → AUDIT_SCHEDULED → DONE
 *
 * Wires together: FastRulesEngine, PolicyAugmentation, DecisionRouter,
 * ComplianceAudit, LLMFallbackService. Creates OTel spans per naming convention.
 */

import { context, SpanStatusCode, type Span } from '@opentelemetry/api';
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

/** Map the past-tense internal decision to Python's action-verb wire value. */
function decisionToAction(decision: GuardrailDecision): string {
  switch (decision) {
    case 'allowed': return 'allow';
    case 'blocked': return 'block';
    case 'augmented': return 'augment';
    case 'llm_fallback': return 'llm_fallback';
  }
}

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
  private static _instance: GuardrailsEngine | null = null;

  /**
   * Return a process-wide singleton, creating it on first call. Mirrors
   * Python `GuardrailsEngine._instance`. `withGuardrails` and
   * `Klira.init()` consume the singleton so a second call doesn't
   * re-initialize policy state.
   */
  static getInstance(config?: GuardrailsEngineConfig): GuardrailsEngine {
    if (!GuardrailsEngine._instance) {
      GuardrailsEngine._instance = new GuardrailsEngine(config);
    }
    return GuardrailsEngine._instance;
  }

  static setInstance(engine: GuardrailsEngine): void {
    GuardrailsEngine._instance = engine;
  }

  static reset(): void {
    GuardrailsEngine._instance = null;
  }

  private fastRules: FastRulesEngine;
  private augmentation: PolicyAugmentation;
  private llmFallback: LLMFallbackService;
  private config: GuardrailsEngineConfig;
  private initialized = false;
  // Promise-chain serializes concurrent evaluate() calls so two callers
  // don't race the lifecycle (Python parity, PROD-482). Replacing this
  // chain on each call yields one waiter per call; the chain head is the
  // active evaluation.
  private chain: Promise<unknown> = Promise.resolve();

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

  // PROD-764 — keep a single in-flight initialization promise so two
  // concurrent callers don't both load policies. The first caller pins
  // `_initializing`; everyone else awaits the same promise.
  private _initializing: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this._initializing) return this._initializing;

    this._initializing = (async () => {
      try {
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
      } finally {
        this._initializing = null;
      }
    })();

    return this._initializing;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Flip the `llmFallbackEnabled` config flag at runtime. `getInstance(config)`
   * ignores the config argument when a singleton already exists, so this is
   * the only path to enable LLM fallback after the engine has been constructed
   * (used by `Klira.init` to wire the fallback after the singleton exists).
   */
  setLlmFallbackEnabled(enabled: boolean): void {
    this.config = { ...this.config, llmFallbackEnabled: enabled };
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

    // Serialize through the per-engine chain so two callers can't tear
    // lifecycle state. Each new call attaches behind the current head.
    const next = this.chain.then(async () => {
      const tracer = getTracer();
      const spanName =
        direction === 'inbound'
          ? 'klira.guardrails.input'
          : 'klira.guardrails.output';

      return tracer.startActiveSpan(spanName, async (span: Span) => {
        try {
          return await this.runLifecycle(content, direction, span);
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
          span.end();
          return this.handleFailure(error, direction);
        }
      });
    });
    // Swallow this run's error on the chain so it doesn't poison waiters.
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async runLifecycle(
    content: string,
    direction: 'inbound' | 'outbound',
    parentSpan: Span,
  ): Promise<GuardrailResult> {
    const lifecycle = new GuardrailLifecycle();
    const startTime = Date.now();
    const parentCtx = context.active();

    // PROD-764 — Python parity:
    //   - entity_name is direction-shaped ("input" / "output"), not "guardrails"
    //   - klira.guardrails.policy_count lives on the parent span
    //   - klira.guardrails.decision uses action verbs ("allow" / "block" / "augment" / "llm_fallback")
    //   - no klira.guardrails.fast_rules / klira.guardrails.route_decision
    //     child spans (Python sets the same data as attributes on the parent)
    //   - no klira.guardrails.augmentation_applied / match_count /
    //     evaluation_duration_ms on the parent span
    lifecycle.transitionTo(GuardrailState.EVALUATING);
    parentSpan.setAttribute('klira.entity_type', 'guardrails');
    parentSpan.setAttribute('klira.entity_name', direction === 'inbound' ? 'input' : 'output');
    parentSpan.setAttribute('klira.compliance.direction', direction);
    parentSpan.setAttribute('klira.guardrails.policy_count', this.fastRules.getPolicyCount());

    const fastRulesResult = this.config.fastRulesEnabled
      ? this.fastRules.evaluate(content, direction)
      : { matches: [], blocked: false, allowed: true };

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

    const guidelines = this.config.augmentationEnabled && !fastRulesResult.blocked
      ? this.augmentation.generateGuidelines(
          fastRulesResult.matches,
          fastRulesResult.matches.map((m) => m.ruleId),
        )
      : [];

    lifecycle.transitionTo(GuardrailState.DECIDED);
    const duration = Date.now() - startTime;

    const effectiveDecision = llmFallbackUsed ? 'llm_fallback' as GuardrailDecision : undefined;
    const routed = routeDecision(fastRulesResult, guidelines, direction, duration);
    const decision: GuardrailDecision = effectiveDecision ?? routed.decision;
    const result = routed.result;

    parentSpan.setAttribute('klira.guardrails.decision', decisionToAction(decision));
    parentSpan.setAttribute('klira.guardrails.allowed', result.allowed);

    lifecycle.transitionTo(GuardrailState.AUDIT_SCHEDULED);
    scheduleAudit(decision, result, direction, parentCtx);

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
      direction,
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
