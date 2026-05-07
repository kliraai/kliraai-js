/**
 * Klira SDK v2 — Async compliance audit.
 *
 * Fire-and-forget: creates klira.compliance.{decision} span asynchronously.
 * Never blocks the hot path (Learning #20).
 */

import { context, SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from '../observability/pipeline.js';
import type { GuardrailResult } from '../types/index.js';
import type { GuardrailDecision } from './decision-router.js';

/**
 * Synchronous compliance audit (PROD-764 parity narrowing of Learning #20).
 *
 * **Why synchronous now?** Learning #20 ("never block hot path") still
 * applies for non-trivial work, but a zero-body audit span — one
 * `setAttributes` + `end` — costs microseconds and removes the flush-race
 * risk where a deferred microtask loses its span when the process exits
 * before the audit fires. Python emits this synchronously; we match.
 */
export function scheduleAudit(
  decision: GuardrailDecision,
  result: GuardrailResult,
  direction: 'inbound' | 'outbound',
  parentContext?: ReturnType<typeof context.active>,
): void {
  try {
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
  } catch {
    // Audit failures must never escape — caller continues.
  }
}
