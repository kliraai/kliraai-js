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
 * Klira SDK v2 contracts — TypeScript equivalents of Python SDK v2 contracts.
 *
 * These contracts are the single source of truth for:
 *   - Trace schema (span names, attributes, parent constraints)
 *   - Guardrails lifecycle (state machine, transitions)
 *   - PHI pipeline (scannable attributes, result types)
 *   - Adapter interfaces (LLM and framework adapter ABCs)
 */

// Trace Schema
export {
  SCHEMA_VERSION,
  AttributeType,
  ATTRIBUTE_REGISTRY,
  SPAN_DEFINITIONS,
  validateSpan,
  type SpanAttribute,
  type SpanDefinition,
  type SpanValidationError,
} from './trace-schema.js';

// Guardrails Lifecycle
export {
  GuardrailState,
  GuardrailLifecycle,
  VALID_TRANSITIONS,
  type GuardrailTransition,
} from './guardrails-lifecycle.js';

// PHI Pipeline
export {
  PhiMethod,
  PHI_SCANNABLE_ATTRIBUTES,
  PHI_SCANNABLE_PATTERNS,
  type PhiEntityResult,
  type PhiScanResult,
  type PhiSpanAttributes,
} from './phi-pipeline.js';

// Adapter Interfaces
export {
  PROMPT_TRUNCATION_LIMIT,
  OUTPUT_TRUNCATION_LIMIT,
  type BaseLLMAdapter,
  type BaseFrameworkAdapter,
} from './adapter-interfaces.js';
