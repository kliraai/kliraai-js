/**
 * Klira SDK v2 — Healthcare logging utilities.
 *
 * Creates clinical spans for decisions, escalations, handoffs, etc.
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from '../observability/pipeline.js';

/**
 * Log a clinical decision.
 */
export function logClinicalDecision(options: {
  decisionType: string;
  rationale: string;
  confidence?: number;
  metadata?: Record<string, string | number | boolean>;
}): void {
  const tracer = getTracer();
  const span = tracer.startSpan('klira.clinical.decision', {
    attributes: {
      'klira.entity_type': 'clinical',
      'klira.clinical.decision_type': options.decisionType,
      'klira.clinical.rationale': options.rationale,
      ...(options.confidence !== undefined && {
        'klira.clinical.confidence': options.confidence,
      }),
      ...options.metadata,
    },
  });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Log an escalation event.
 */
export function logEscalation(options: {
  reason: string;
  targetTeam?: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, string | number | boolean>;
}): void {
  const tracer = getTracer();
  const span = tracer.startSpan('klira.clinical.escalation', {
    attributes: {
      'klira.entity_type': 'clinical',
      'klira.clinical.escalation_reason': options.reason,
      ...(options.targetTeam && {
        'klira.clinical.target_team': options.targetTeam,
      }),
      ...(options.urgency && {
        'klira.clinical.urgency': options.urgency,
      }),
      ...options.metadata,
    },
  });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Log an agent handoff.
 */
export function logHandoff(options: {
  fromAgent: string;
  toAgent: string;
  reason: string;
  metadata?: Record<string, string | number | boolean>;
}): void {
  const tracer = getTracer();
  const span = tracer.startSpan('klira.agent.handoff', {
    attributes: {
      'klira.entity_type': 'agent',
      'klira.agent.handoff_from': options.fromAgent,
      'klira.agent.handoff_to': options.toAgent,
      'klira.agent.handoff_reason': options.reason,
      ...options.metadata,
    },
  });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Log a safety check.
 */
export function logSafetyCheck(options: {
  checkType: string;
  passed: boolean;
  details?: string;
  metadata?: Record<string, string | number | boolean>;
}): void {
  const tracer = getTracer();
  const span = tracer.startSpan('klira.clinical.safety_check', {
    attributes: {
      'klira.entity_type': 'clinical',
      'klira.clinical.safety_check_type': options.checkType,
      'klira.clinical.safety_check_passed': options.passed,
      ...(options.details && {
        'klira.clinical.safety_check_details': options.details,
      }),
      ...options.metadata,
    },
  });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Log a RAG retrieval event.
 */
export function logRAGRetrieval(options: {
  source: string;
  query: string;
  resultCount: number;
  metadata?: Record<string, string | number | boolean>;
}): void {
  const tracer = getTracer();
  const span = tracer.startSpan('klira.rag.retrieval', {
    attributes: {
      'klira.entity_type': 'rag',
      'klira.rag.source': options.source,
      'klira.rag.query': options.query,
      'klira.rag.result_count': options.resultCount,
      ...options.metadata,
    },
  });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}
