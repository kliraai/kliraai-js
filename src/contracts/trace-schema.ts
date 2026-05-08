// Copyright 2024 Klira AI
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Trace schema contract — the single source of truth for all Klira spans.
 *
 * Every span the SDK produces is defined here. Tests validate captured spans
 * against these definitions. Platform and SDK share this contract for
 * attribute naming and hierarchy rules.
 *
 * Schema version is bumped when span definitions change in a
 * backward-incompatible way (new required attributes, renamed spans, etc.).
 *
 * Ported from Python SDK v2: klira/sdk/contracts/trace_schema.py
 */

export const SCHEMA_VERSION = '0.6.1';

// ---------------------------------------------------------------------------
// Attribute types
// ---------------------------------------------------------------------------

export const AttributeType = {
  STRING: 'string',
  INT: 'int',
  FLOAT: 'float',
  BOOL: 'bool',
  STRING_LIST: 'string_list',
  INT_LIST: 'int_list',
} as const;

export type AttributeType = (typeof AttributeType)[keyof typeof AttributeType];

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface SpanAttribute {
  readonly name: string;
  readonly attrType: AttributeType;
  readonly description: string;
  readonly allowedValues?: readonly string[];
  readonly validationPattern?: string;
}

export interface SpanDefinition {
  readonly name: string;
  readonly description: string;
  readonly parentConstraints: readonly string[];
  readonly requiredAttributes: readonly SpanAttribute[];
  readonly optionalAttributes?: readonly SpanAttribute[];
  readonly isAsync?: boolean;
  readonly nameTemplate?: string;
}

// ---------------------------------------------------------------------------
// Attribute Registry — every attribute the SDK sets on any span
// ---------------------------------------------------------------------------

export const ATTRIBUTE_REGISTRY: Record<string, SpanAttribute> = {};

function attr(
  name: string,
  attrType: AttributeType,
  description: string,
  allowedValues?: readonly string[],
  validationPattern?: string,
): SpanAttribute {
  const a: SpanAttribute = { name, attrType, description, allowedValues, validationPattern };
  ATTRIBUTE_REGISTRY[name] = a;
  return a;
}

// --- Klira core attributes (present on most spans) ---

export const ATTR_ENTITY_TYPE = attr(
  'klira.entity_type',
  AttributeType.STRING,
  'Span entity type',
  [
    'user_message', 'workflow', 'agent', 'task', 'tool', 'llm',
    'guardrails', 'compliance', 'clinical_decision', 'human_escalation',
    'agent_handoff', 'safety_check', 'rag_retrieval', 'eval_test_case',
  ],
);
export const ATTR_ENTITY_NAME = attr('klira.entity_name', AttributeType.STRING, 'Human-readable entity name');
export const ATTR_USER_ID = attr('klira.user_id', AttributeType.STRING, 'User identifier for trace correlation');
export const ATTR_CONVERSATION_ID = attr('klira.conversation_id', AttributeType.STRING, 'Conversation identifier');
export const ATTR_MESSAGE_ID = attr('klira.message_id', AttributeType.STRING, 'Message identifier');
export const ATTR_DURATION_MS = attr('klira.duration_ms', AttributeType.FLOAT, 'Span duration in milliseconds (set by processor)');
export const ATTR_FRAMEWORK = attr('klira.framework', AttributeType.STRING, 'Framework adapter name');
export const ATTR_OUTPUT = attr('klira.output', AttributeType.STRING, 'Wrapper output capture (truncated to 500 chars)');
export const ATTR_INPUT = attr('klira.input', AttributeType.STRING, 'User input text captured from function arguments (truncated to 10000 chars)');

// --- FHIR ---
export const ATTR_FHIR_RESOURCE_TYPE = attr('klira.fhir.resource_type', AttributeType.STRING, 'FHIR resource type on tool spans');

// --- PHI per-span attributes (set by exporter before export) ---
export const ATTR_PHI_DETECTED = attr('klira.phi.detected', AttributeType.BOOL, 'Whether PHI was detected in this span\'s attributes');
export const ATTR_PHI_ENTITY_COUNT = attr('klira.phi.entity_count', AttributeType.INT, 'Number of PHI entities detected');
export const ATTR_PHI_ENTITY_TYPES = attr('klira.phi.entity_types', AttributeType.STRING_LIST, 'Types of PHI entities detected');

// --- GenAI semantic convention attributes (on LLM spans) ---
export const ATTR_GEN_AI_SYSTEM = attr('gen_ai.system', AttributeType.STRING, 'LLM provider (lowercase)');
export const ATTR_GEN_AI_REQUEST_MODEL = attr('gen_ai.request.model', AttributeType.STRING, 'Requested model name (no provider prefix)');
export const ATTR_GEN_AI_RESPONSE_MODEL = attr('gen_ai.response.model', AttributeType.STRING, 'Actual model used in response');
export const ATTR_GEN_AI_INPUT_TOKENS = attr('gen_ai.usage.input_tokens', AttributeType.INT, 'Input token count');
export const ATTR_GEN_AI_OUTPUT_TOKENS = attr('gen_ai.usage.output_tokens', AttributeType.INT, 'Output token count');
export const ATTR_GEN_AI_FINISH_REASONS = attr('gen_ai.response.finish_reasons', AttributeType.STRING_LIST, 'Finish reasons from LLM');
export const ATTR_GEN_AI_PROMPT = attr('gen_ai.prompt', AttributeType.STRING, 'LLM prompt content (truncated)');
export const ATTR_GEN_AI_PROMPT_ORIGINAL = attr('gen_ai.prompt.original', AttributeType.STRING, 'Original prompt before augmentation');

// --- Guardrails attributes ---
export const ATTR_GUARDRAILS_DIRECTION = attr('klira.compliance.direction', AttributeType.STRING, 'Guardrails check direction', ['inbound', 'outbound']);
export const ATTR_GUARDRAILS_DECISION_ALLOWED = attr('klira.compliance.decision.allowed', AttributeType.BOOL, 'Whether the guardrails decision allowed the content');
export const ATTR_GUARDRAILS_DECISION_ACTION = attr('klira.compliance.decision.action', AttributeType.STRING, 'Guardrails decision action', ['block', 'allow']);
export const ATTR_GUARDRAILS_DECISION_LAYER = attr('klira.compliance.decision.layer', AttributeType.STRING, 'Evaluation layer that made the decision');
export const ATTR_GUARDRAILS_AUGMENTATION_APPLIED = attr('klira.guardrails.augmentation_applied', AttributeType.BOOL, 'Whether prompt augmentation was applied');
export const ATTR_GUARDRAILS_GUIDELINES_COUNT = attr('klira.guardrails.guidelines_count', AttributeType.INT, 'Number of guidelines injected');
export const ATTR_GUARDRAILS_POLICY_COUNT = attr('klira.guardrails.policy_count', AttributeType.INT, 'Number of policies evaluated');
export const ATTR_GUARDRAILS_POLICIES_INJECTED = attr('klira.llm.guardrails.policies_injected', AttributeType.INT, 'Number of policies injected');
export const ATTR_GUARDRAILS_AUGMENTED = attr('klira.llm.guardrails.augmented', AttributeType.BOOL, 'Whether LLM call was augmented');

// --- Guardrails evaluate-level attributes ---
// PROD-764 — wire value is the action verb (allow / block / augment / llm_fallback),
// matching Python's `klira.guardrails.decision` and the action semantics of
// `klira.compliance.decision.action`. The compliance child span's *name* still
// carries the past-tense word (klira.compliance.allowed etc.).
export const ATTR_GUARDRAILS_EVALUATE_DECISION = attr('klira.guardrails.decision', AttributeType.STRING, 'Guardrails evaluation decision action', ['allow', 'block', 'augment', 'llm_fallback']);
export const ATTR_GUARDRAILS_EVALUATE_ALLOWED = attr('klira.guardrails.allowed', AttributeType.BOOL, 'Whether guardrails evaluation allowed the content');

// --- Compliance attributes ---
export const ATTR_COMPLIANCE_POLICY_IDS = attr('klira.compliance.policy_ids', AttributeType.STRING, 'Comma-separated matched policy IDs');
export const ATTR_COMPLIANCE_REGULATION = attr('klira.compliance.regulation', AttributeType.STRING, 'Regulation tag from policy metadata');
export const ATTR_COMPLIANCE_AUDIT_REQUIRED = attr('klira.compliance.audit_required', AttributeType.BOOL, 'Whether audit is required');
export const ATTR_COMPLIANCE_HUMAN_REVIEW_REQUIRED = attr('klira.compliance.human_review_required', AttributeType.BOOL, 'Whether human review is required');

// --- Healthcare context attributes ---
export const ATTR_HEALTHCARE_PATIENT_ID = attr('klira.healthcare.patient_id', AttributeType.STRING, 'Patient identifier');
export const ATTR_HEALTHCARE_ENCOUNTER_ID = attr('klira.healthcare.encounter_id', AttributeType.STRING, 'Encounter identifier');
export const ATTR_HEALTHCARE_DEPARTMENT = attr('klira.healthcare.department', AttributeType.STRING, 'Hospital department');
export const ATTR_HEALTHCARE_SPECIALTY = attr('klira.healthcare.specialty', AttributeType.STRING, 'Medical specialty');
export const ATTR_HEALTHCARE_CLINICAL_DOMAIN = attr('klira.healthcare.clinical_domain', AttributeType.STRING, 'Clinical domain');
export const ATTR_HEALTHCARE_INTERACTION_MODALITY = attr('klira.healthcare.interaction_modality', AttributeType.STRING, 'Interaction modality (chat, voice, etc.)');

// --- Clinical logging attributes ---
export const ATTR_CLINICAL_DECISION = attr('klira.clinical.decision', AttributeType.STRING, 'Clinical decision text');
export const ATTR_CLINICAL_REASONING = attr('klira.clinical.reasoning', AttributeType.STRING, 'Clinical decision reasoning');
export const ATTR_CLINICAL_CONFIDENCE = attr('klira.clinical.confidence', AttributeType.FLOAT, 'Clinical decision confidence');
export const ATTR_CLINICAL_URGENCY = attr('klira.clinical.urgency', AttributeType.STRING, 'Clinical urgency level');
export const ATTR_CLINICAL_ESCALATION_REASON = attr('klira.clinical.escalation_reason', AttributeType.STRING, 'Escalation reason');
export const ATTR_CLINICAL_FROM_AGENT = attr('klira.clinical.from_agent', AttributeType.STRING, 'Source agent in handoff');
export const ATTR_CLINICAL_TO_AGENT = attr('klira.clinical.to_agent', AttributeType.STRING, 'Target agent in handoff');
export const ATTR_CLINICAL_HANDOFF_REASON = attr('klira.clinical.handoff_reason', AttributeType.STRING, 'Handoff reason');
export const ATTR_CLINICAL_CHECK_TYPE = attr('klira.clinical.check_type', AttributeType.STRING, 'Safety check type');
export const ATTR_CLINICAL_CHECK_PASSED = attr('klira.clinical.check_passed', AttributeType.BOOL, 'Whether safety check passed');
export const ATTR_CLINICAL_CHECK_DETAILS = attr('klira.clinical.check_details', AttributeType.STRING, 'Safety check details');
export const ATTR_CLINICAL_RAG_SOURCE = attr('klira.clinical.rag_source', AttributeType.STRING, 'RAG retrieval source');
export const ATTR_CLINICAL_RAG_QUERY = attr('klira.clinical.rag_query', AttributeType.STRING, 'RAG retrieval query');
export const ATTR_CLINICAL_RAG_RESULT_COUNT = attr('klira.clinical.rag_result_count', AttributeType.INT, 'RAG retrieval result count');

// --- Evals attributes ---
export const ATTR_EVALS_RUN_ID = attr('klira.evals.evals_run', AttributeType.STRING, 'Eval run identifier');
export const ATTR_EVALS_DATASET_ID = attr('klira.evals.dataset_id', AttributeType.STRING, 'Eval dataset identifier');
export const ATTR_EVALS_TEST_CASE_ID = attr('klira.evals.test_case_id', AttributeType.STRING, 'Eval test case identifier');
export const ATTR_EVALS_TEST_CASE_INPUT = attr('klira.evals.test_case_input', AttributeType.STRING, 'Eval test case input');
export const ATTR_EVALS_EXPECTED_OUTPUT = attr('klira.evals.expected_output', AttributeType.STRING, 'Expected output for the test case');

// ---------------------------------------------------------------------------
// Span Definitions — every span the SDK can produce
// ---------------------------------------------------------------------------

// Helper constants for parent constraints
const ROOT_OR_USER_MESSAGE = ['root', 'klira.user.message'] as const;
const CHILD_OF_ANY_KLIRA = [
  'klira.user.message', 'klira.workflow.*', 'klira.agent.*',
  'klira.task.*', 'klira.tool.*',
] as const;
const CHILD_OF_GUARDRAILS = ['klira.guardrails.input', 'klira.guardrails.output'] as const;

export const SPAN_USER_MESSAGE: SpanDefinition = {
  name: 'klira.user.message',
  description: 'Root span for a user interaction. One per user message.',
  parentConstraints: ['root'],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_USER_ID, ATTR_CONVERSATION_ID, ATTR_MESSAGE_ID],
  optionalAttributes: [ATTR_EVALS_RUN_ID, ATTR_ENTITY_NAME, ATTR_DURATION_MS, ATTR_INPUT],
};

export const SPAN_WORKFLOW: SpanDefinition = {
  name: 'klira.workflow.{name}',
  nameTemplate: 'klira.workflow.{name}',
  description: 'Workflow execution span.',
  parentConstraints: [...ROOT_OR_USER_MESSAGE],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_OUTPUT, ATTR_DURATION_MS, ATTR_FRAMEWORK, ATTR_INPUT, ATTR_USER_ID, ATTR_CONVERSATION_ID],
};

export const SPAN_AGENT: SpanDefinition = {
  name: 'klira.agent.{name}',
  nameTemplate: 'klira.agent.{name}',
  description: 'Agent execution span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_OUTPUT, ATTR_DURATION_MS, ATTR_FRAMEWORK, ATTR_USER_ID, ATTR_CONVERSATION_ID],
};

export const SPAN_TASK: SpanDefinition = {
  name: 'klira.task.{name}',
  nameTemplate: 'klira.task.{name}',
  description: 'Task execution span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_OUTPUT, ATTR_DURATION_MS, ATTR_FRAMEWORK, ATTR_USER_ID, ATTR_CONVERSATION_ID],
};

export const SPAN_TOOL: SpanDefinition = {
  name: 'klira.tool.{name}',
  nameTemplate: 'klira.tool.{name}',
  description: 'Tool execution span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_OUTPUT, ATTR_DURATION_MS, ATTR_FRAMEWORK, ATTR_FHIR_RESOURCE_TYPE, ATTR_USER_ID, ATTR_CONVERSATION_ID],
};

export const SPAN_LLM: SpanDefinition = {
  name: 'klira.llm.{provider}',
  nameTemplate: 'klira.llm.{provider}',
  description: 'LLM API call wrapper span.',
  // Note: ATTR_FRAMEWORK is intentionally absent here. klira.framework is set
  // at the wrapper level (workflow/agent/task/tool spans), not on LLM spans.
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_GEN_AI_SYSTEM, ATTR_GEN_AI_REQUEST_MODEL],
  optionalAttributes: [
    ATTR_GEN_AI_RESPONSE_MODEL, ATTR_GEN_AI_INPUT_TOKENS, ATTR_GEN_AI_OUTPUT_TOKENS,
    ATTR_GEN_AI_FINISH_REASONS, ATTR_GEN_AI_PROMPT, ATTR_GEN_AI_PROMPT_ORIGINAL,
    ATTR_GUARDRAILS_AUGMENTED, ATTR_GUARDRAILS_POLICIES_INJECTED,
    ATTR_DURATION_MS, ATTR_ENTITY_NAME,
  ],
};

export const SPAN_GUARDRAILS_INPUT: SpanDefinition = {
  name: 'klira.guardrails.input',
  description: 'Inbound guardrails check.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_GUARDRAILS_DIRECTION],
  optionalAttributes: [
    ATTR_ENTITY_NAME, ATTR_GUARDRAILS_POLICY_COUNT,
    ATTR_GUARDRAILS_EVALUATE_DECISION, ATTR_GUARDRAILS_EVALUATE_ALLOWED,
  ],
};

export const SPAN_GUARDRAILS_OUTPUT: SpanDefinition = {
  name: 'klira.guardrails.output',
  description: 'Outbound guardrails check.',
  parentConstraints: [...CHILD_OF_GUARDRAILS, ...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_GUARDRAILS_DIRECTION],
  optionalAttributes: [
    ATTR_ENTITY_NAME, ATTR_GUARDRAILS_POLICY_COUNT,
    ATTR_GUARDRAILS_EVALUATE_DECISION, ATTR_GUARDRAILS_EVALUATE_ALLOWED,
  ],
};

const COMPLIANCE_REQUIRED_ATTRS = [
  ATTR_ENTITY_TYPE, ATTR_GUARDRAILS_DIRECTION, ATTR_GUARDRAILS_DECISION_ALLOWED,
  ATTR_GUARDRAILS_DECISION_ACTION, ATTR_GUARDRAILS_DECISION_LAYER,
  ATTR_GUARDRAILS_AUGMENTATION_APPLIED, ATTR_GUARDRAILS_GUIDELINES_COUNT,
  ATTR_COMPLIANCE_AUDIT_REQUIRED, ATTR_COMPLIANCE_HUMAN_REVIEW_REQUIRED,
] as const;

const COMPLIANCE_OPTIONAL_ATTRS = [
  ATTR_COMPLIANCE_POLICY_IDS, ATTR_COMPLIANCE_REGULATION, ATTR_DURATION_MS,
] as const;

const COMPLIANCE_PARENT_CONSTRAINTS = [...CHILD_OF_GUARDRAILS, ...CHILD_OF_ANY_KLIRA];

export const SPAN_COMPLIANCE_ALLOWED: SpanDefinition = {
  name: 'klira.compliance.allowed',
  description: 'Compliance decision — content allowed.',
  parentConstraints: COMPLIANCE_PARENT_CONSTRAINTS,
  requiredAttributes: [...COMPLIANCE_REQUIRED_ATTRS],
  optionalAttributes: [...COMPLIANCE_OPTIONAL_ATTRS],
  isAsync: true,
};

export const SPAN_COMPLIANCE_BLOCKED: SpanDefinition = {
  name: 'klira.compliance.blocked',
  description: 'Compliance decision — content blocked.',
  parentConstraints: COMPLIANCE_PARENT_CONSTRAINTS,
  requiredAttributes: [...COMPLIANCE_REQUIRED_ATTRS],
  optionalAttributes: [...COMPLIANCE_OPTIONAL_ATTRS],
  isAsync: true,
};

export const SPAN_COMPLIANCE_AUGMENTED: SpanDefinition = {
  name: 'klira.compliance.augmented',
  description: 'Compliance decision — content augmented with guidelines.',
  parentConstraints: COMPLIANCE_PARENT_CONSTRAINTS,
  requiredAttributes: [...COMPLIANCE_REQUIRED_ATTRS],
  optionalAttributes: [...COMPLIANCE_OPTIONAL_ATTRS],
  isAsync: true,
};

export const SPAN_COMPLIANCE_LLM_FALLBACK: SpanDefinition = {
  name: 'klira.compliance.llm_fallback',
  description: 'Compliance decision — LLM fallback evaluation.',
  parentConstraints: COMPLIANCE_PARENT_CONSTRAINTS,
  requiredAttributes: [...COMPLIANCE_REQUIRED_ATTRS],
  optionalAttributes: [...COMPLIANCE_OPTIONAL_ATTRS],
  isAsync: true,
};

// --- Clinical / Healthcare spans ---

export const SPAN_CLINICAL_DECISION: SpanDefinition = {
  name: 'klira.clinical.decision',
  description: 'Clinical decision logging span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_CLINICAL_DECISION, ATTR_CLINICAL_REASONING, ATTR_CLINICAL_CONFIDENCE, ATTR_HEALTHCARE_SPECIALTY, ATTR_CLINICAL_URGENCY, ATTR_DURATION_MS],
};

export const SPAN_CLINICAL_ESCALATION: SpanDefinition = {
  name: 'klira.clinical.escalation',
  description: 'Human escalation logging span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_CLINICAL_ESCALATION_REASON, ATTR_CLINICAL_URGENCY, ATTR_DURATION_MS],
};

export const SPAN_CLINICAL_HANDOFF: SpanDefinition = {
  name: 'klira.clinical.handoff',
  description: 'Agent handoff logging span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_CLINICAL_FROM_AGENT, ATTR_CLINICAL_TO_AGENT, ATTR_CLINICAL_HANDOFF_REASON, ATTR_DURATION_MS],
};

export const SPAN_CLINICAL_SAFETY_CHECK: SpanDefinition = {
  name: 'klira.clinical.safety_check',
  description: 'Safety check logging span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_CLINICAL_CHECK_TYPE, ATTR_CLINICAL_CHECK_PASSED, ATTR_CLINICAL_CHECK_DETAILS, ATTR_DURATION_MS],
};

export const SPAN_CLINICAL_RAG_RETRIEVAL: SpanDefinition = {
  name: 'klira.clinical.rag_retrieval',
  description: 'RAG retrieval logging span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_CLINICAL_RAG_SOURCE, ATTR_CLINICAL_RAG_QUERY, ATTR_CLINICAL_RAG_RESULT_COUNT, ATTR_DURATION_MS],
};

export const SPAN_AGENT_HANDOFF: SpanDefinition = {
  name: 'klira.agent.handoff',
  description: 'Agent handoff logging span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_DURATION_MS],
};

export const SPAN_RAG_RETRIEVAL: SpanDefinition = {
  name: 'klira.rag.retrieval',
  description: 'RAG retrieval logging span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_DURATION_MS],
};

export const SPAN_AUDIT_REGULATORY: SpanDefinition = {
  name: 'klira.audit.regulatory',
  description: 'Regulatory audit logging span.',
  parentConstraints: [...CHILD_OF_ANY_KLIRA],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_ENTITY_NAME],
  optionalAttributes: [ATTR_COMPLIANCE_REGULATION, ATTR_DURATION_MS],
};

export const SPAN_EVALS_TEST_CASE: SpanDefinition = {
  name: 'klira.evals.test_case',
  description: 'Eval test case execution span.',
  parentConstraints: ['root', 'klira.user.message'],
  requiredAttributes: [ATTR_ENTITY_TYPE, ATTR_EVALS_RUN_ID, ATTR_EVALS_TEST_CASE_ID],
  optionalAttributes: [ATTR_EVALS_DATASET_ID, ATTR_EVALS_TEST_CASE_INPUT, ATTR_EVALS_EXPECTED_OUTPUT, ATTR_DURATION_MS],
};

// ---------------------------------------------------------------------------
// Span definition registry — for programmatic lookup
// ---------------------------------------------------------------------------

export const SPAN_DEFINITIONS: Record<string, SpanDefinition> = {};
for (const sd of [
  SPAN_USER_MESSAGE, SPAN_WORKFLOW, SPAN_AGENT, SPAN_TASK, SPAN_TOOL, SPAN_LLM,
  SPAN_GUARDRAILS_INPUT, SPAN_GUARDRAILS_OUTPUT,
  SPAN_COMPLIANCE_ALLOWED, SPAN_COMPLIANCE_BLOCKED, SPAN_COMPLIANCE_AUGMENTED, SPAN_COMPLIANCE_LLM_FALLBACK,
  SPAN_CLINICAL_DECISION, SPAN_CLINICAL_ESCALATION, SPAN_CLINICAL_HANDOFF,
  SPAN_CLINICAL_SAFETY_CHECK, SPAN_CLINICAL_RAG_RETRIEVAL,
  SPAN_AGENT_HANDOFF, SPAN_RAG_RETRIEVAL, SPAN_AUDIT_REGULATORY, SPAN_EVALS_TEST_CASE,
]) {
  SPAN_DEFINITIONS[sd.name] = sd;
}

// ---------------------------------------------------------------------------
// Validation helpers — used by contract tests
// ---------------------------------------------------------------------------

export interface SpanValidationError {
  spanName: string;
  error: string;
}

function matchSpanDefinition(spanName: string): SpanDefinition | null {
  if (SPAN_DEFINITIONS[spanName]) {
    return SPAN_DEFINITIONS[spanName];
  }

  for (const defn of Object.values(SPAN_DEFINITIONS)) {
    if (!defn.nameTemplate) continue;
    const prefix = defn.nameTemplate.split('{')[0];
    if (prefix && spanName.startsWith(prefix)) {
      return defn;
    }
  }

  return null;
}

/**
 * Validate a span against the trace schema contract.
 *
 * @param spanName - The concrete span name (e.g., 'klira.workflow.my_flow').
 * @param attributes - The span's attributes as a record.
 * @param parentSpanName - The parent span's name, or null/undefined for root spans.
 * @returns List of validation errors. Empty array means the span is valid.
 */
export function validateSpan(
  spanName: string,
  attributes: Record<string, unknown>,
  parentSpanName?: string | null,
): SpanValidationError[] {
  const errors: SpanValidationError[] = [];

  const defn = matchSpanDefinition(spanName);
  if (!defn) {
    errors.push({ spanName, error: `Unknown span name: ${spanName}` });
    return errors;
  }

  // Check required attributes
  for (const attr of defn.requiredAttributes) {
    if (!(attr.name in attributes)) {
      errors.push({ spanName, error: `Missing required attribute: ${attr.name}` });
      continue;
    }

    const value = attributes[attr.name];

    // Type check
    if (attr.attrType === AttributeType.STRING && typeof value !== 'string') {
      errors.push({ spanName, error: `Attribute ${attr.name} must be string, got ${typeof value}` });
    } else if (attr.attrType === AttributeType.INT && typeof value !== 'number') {
      errors.push({ spanName, error: `Attribute ${attr.name} must be number, got ${typeof value}` });
    } else if (attr.attrType === AttributeType.FLOAT && typeof value !== 'number') {
      errors.push({ spanName, error: `Attribute ${attr.name} must be number, got ${typeof value}` });
    } else if (attr.attrType === AttributeType.BOOL && typeof value !== 'boolean') {
      errors.push({ spanName, error: `Attribute ${attr.name} must be boolean, got ${typeof value}` });
    } else if (attr.attrType === AttributeType.STRING_LIST && !Array.isArray(value)) {
      errors.push({ spanName, error: `Attribute ${attr.name} must be array, got ${typeof value}` });
    }

    // Allowed values check
    if (attr.allowedValues && typeof value === 'string') {
      if (!attr.allowedValues.includes(value)) {
        errors.push({ spanName, error: `Attribute ${attr.name} value '${value}' not in allowed values: [${attr.allowedValues.join(', ')}]` });
      }
    }
  }

  // Check parent constraints
  const nonRootConstraints = defn.parentConstraints.filter(c => c !== 'root');
  const allowsRoot = defn.parentConstraints.includes('root');

  if (parentSpanName != null) {
    if (nonRootConstraints.length === 0) {
      errors.push({ spanName, error: `Invalid parent '${parentSpanName}'. Allowed: [${defn.parentConstraints.join(', ')}]` });
    } else {
      let parentMatches = false;
      for (const constraint of nonRootConstraints) {
        if (constraint.endsWith('.*')) {
          const prefix = constraint.slice(0, -2);
          if (parentSpanName.startsWith(prefix + '.')) {
            parentMatches = true;
            break;
          }
        } else if (parentSpanName === constraint || parentSpanName.startsWith(constraint.split('{')[0] ?? '')) {
          parentMatches = true;
          break;
        }
      }

      if (!parentMatches) {
        errors.push({ spanName, error: `Invalid parent '${parentSpanName}'. Allowed: [${defn.parentConstraints.join(', ')}]` });
      }
    }
  } else if (!allowsRoot) {
    errors.push({ spanName, error: `Span requires a parent. Allowed: [${defn.parentConstraints.join(', ')}]` });
  }

  return errors;
}
