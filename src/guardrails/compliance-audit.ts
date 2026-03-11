/**
 * Klira SDK v2 — Async compliance audit.
 *
 * Fire-and-forget: creates klira.compliance.{decision} span asynchronously.
 * Never blocks the hot path (Learning #20).
 */

import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from '../observability/pipeline.js';
import type { GuardrailResult } from '../types/index.js';
import type { GuardrailDecision } from './decision-router.js';

export function scheduleAudit(
  decision: GuardrailDecision,
  result: GuardrailResult,
  direction: 'inbound' | 'outbound',
  parentContext?: ReturnType<typeof context.active>,
): void {
  // Fire-and-forget — never blocks the hot path
  Promise.resolve().then(() => {
    const tracer = getTracer();
    const ctx = parentContext ?? context.active();

    const spanName = `klira.compliance.${decision}`;

    const span = tracer.startSpan(
      spanName,
      {
        attributes: {
          'klira.entity_type': 'compliance',
          'klira.compliance.direction': direction,
          'klira.compliance.decision.allowed': result.allowed,
          'klira.compliance.decision.action': result.blocked ? 'block' : 'allow',
          'klira.compliance.decision.layer': decision === 'llm_fallback' ? 'llm_fallback' : 'fast_rules',
          'klira.guardrails.augmentation_applied': decision === 'augmented',
          'klira.guardrails.guidelines_count': result.guidelines?.length ?? 0,
          'klira.compliance.audit_required': false,
          'klira.compliance.human_review_required': false,
        },
      },
      ctx,
    );

    if (result.triggeredPolicies && result.triggeredPolicies.length > 0) {
      span.setAttribute('klira.compliance.policy_ids', result.triggeredPolicies.join(','));
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }).catch(() => {
    // Swallow audit errors — they must never affect the hot path
  });
}
