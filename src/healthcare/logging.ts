/**
 * Klira SDK v2 — Healthcare logging utilities.
 *
 * Creates clinical spans for decisions, escalations, handoffs, etc.
 * Entity types and required attributes per trace-schema contract.
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from '../observability/pipeline.js';

/**
 * Log a clinical decision. Wire shape matches Python's `log_clinical_decision`.
 */
export function logClinicalDecision(options: {
  decision: string;
  reasoning: string;
  confidence?: number;
  patientId?: string;
  guidelinesUsed?: number;
  metadata?: Record<string, string | number | boolean>;
}): void {
  const tracer = getTracer();
  const span = tracer.startSpan('klira.clinical.decision', {
    attributes: {
      'klira.entity_type': 'clinical_decision',
      'klira.entity_name': 'clinical_decision',
      'klira.clinical.decision': options.decision,
      'klira.clinical.reasoning': options.reasoning,
      ...(options.confidence !== undefined && {
        'klira.clinical.confidence': options.confidence,
      }),
      ...(options.patientId !== undefined && {
        'klira.clinical.patient_id': options.patientId,
      }),
      ...(options.guidelinesUsed !== undefined && {
        'klira.clinical.guidelines_used': options.guidelinesUsed,
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
      'klira.entity_type': 'human_escalation',
      'klira.entity_name': options.reason,
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
      'klira.entity_type': 'agent_handoff',
      'klira.entity_name': `${options.fromAgent} → ${options.toAgent}`,
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
 * Log a safety check. Wire shape matches Python's `log_safety_check`.
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
      'klira.entity_type': 'safety_check',
      'klira.entity_name': options.checkType,
      'klira.clinical.check_type': options.checkType,
      'klira.clinical.check_passed': options.passed,
      ...(options.details && {
        'klira.clinical.check_details': options.details,
      }),
      ...options.metadata,
    },
  });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Log a RAG retrieval event. Wire shape matches Python's `log_rag_retrieval`.
 */
export function logRAGRetrieval(options: {
  source: string;
  query: string;
  resultCount: number;
  indexName?: string;
  metadata?: Record<string, string | number | boolean>;
}): void {
  const tracer = getTracer();
  const span = tracer.startSpan('klira.clinical.rag_retrieval', {
    attributes: {
      'klira.entity_type': 'rag_retrieval',
      'klira.entity_name': 'rag_retrieval',
      'klira.clinical.rag_source': options.source,
      'klira.clinical.rag_query': options.query,
      'klira.clinical.rag_result_count': options.resultCount,
      ...(options.indexName && {
        'klira.clinical.index_name': options.indexName,
      }),
      ...options.metadata,
    },
  });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}
