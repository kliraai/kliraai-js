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
 * PHI pipeline contract — defines the PII/PHI de-identification interface.
 *
 * Architecture: Custom export with protobuf mutation.
 *
 * Pipeline:
 *   1. Spans created during agent execution (zero latency impact).
 *   2. BatchSpanProcessor buffers spans normally.
 *   3. KliraOTLPSpanExporter.export() serializes to protobuf (mutable).
 *   4. If anonymization enabled, walk protobuf attributes:
 *      a. Analyzer detects PII/PHI entities
 *      b. Anonymizer replaces detected entities
 *      c. Overwrite protobuf StringValue in-place
 *      d. Append klira.phi.* attributes per span
 *   5. Send modified protobuf via HTTP POST.
 *
 * Failure mode: If scanning fails on any span, export UNCHANGED (fail-open).
 *   The span will have klira.phi.detected absent (not false), which the
 *   platform treats as "scan failed — flag for manual review."
 *
 * Ported from Python SDK v2: klira/sdk/contracts/phi_pipeline.py
 */

// ---------------------------------------------------------------------------
// Anonymization methods
// ---------------------------------------------------------------------------

export const PhiMethod = {
  REDACT: 'redact',
  MASK: 'mask',
  REPLACE: 'replace',
  HASH: 'hash',
} as const;

export type PhiMethod = (typeof PhiMethod)[keyof typeof PhiMethod];

// ---------------------------------------------------------------------------
// Scannable attributes
// ---------------------------------------------------------------------------

/**
 * Attributes that will be scanned for PII/PHI content (exact match).
 * Additional attributes are matched via PHI_SCANNABLE_PATTERNS below.
 */
export const PHI_SCANNABLE_ATTRIBUTES: readonly string[] = [
  'gen_ai.prompt',
  'gen_ai.prompt.original',
  'klira.output',
  'klira.input',
];

/**
 * Glob patterns for additional attribute matching (fnmatch syntax).
 * Any attribute key matching one of these patterns is scanned for PHI.
 */
export const PHI_SCANNABLE_PATTERNS: readonly string[] = [
  '*.content',
  '*.text',
  '*.message',
  'klira.clinical.*',
  'klira.healthcare.*',
];

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Result of PHI detection for a single entity. */
export interface PhiEntityResult {
  readonly entityType: string;
  readonly start: number;
  readonly end: number;
  readonly score: number;
}

/** Result of PHI scanning for a single attribute value. */
export interface PhiScanResult {
  readonly detected: boolean;
  readonly entityCount: number;
  readonly entityTypes: readonly string[];
  readonly anonymizedText?: string;
  readonly entities?: readonly PhiEntityResult[];
}

/**
 * PHI-related attributes to append to a span after scanning.
 *
 * These are appended as new attributes during export, not set on the
 * in-memory span (which may be read-only).
 */
export interface PhiSpanAttributes {
  readonly detected: boolean;
  readonly entityCount?: number;
  readonly entityTypes?: readonly string[];
}
