/**
 * Klira SDK v2 — PHI de-identifier.
 *
 * Implements REDACT, MASK, REPLACE, HASH methods per PhiMethod enum.
 */

import { createHash } from 'crypto';
import { PhiMethod, type PhiEntityResult, type PhiScanResult } from '../contracts/phi-pipeline.js';

// ---------------------------------------------------------------------------
// De-identification
// ---------------------------------------------------------------------------

/**
 * De-identify text by applying the specified method to detected entities.
 */
export function deidentify(
  text: string,
  scanResult: PhiScanResult,
  method: PhiMethod = PhiMethod.REDACT,
): string {
  if (!scanResult.detected || !scanResult.entities || scanResult.entities.length === 0) {
    return text;
  }

  // Sort entities by start position descending (so replacements don't shift indices)
  const sorted = [...scanResult.entities].sort((a, b) => b.start - a.start);

  let result = text;
  for (const entity of sorted) {
    const original = result.slice(entity.start, entity.end);
    const replacement = applyMethod(original, entity, method);
    result = result.slice(0, entity.start) + replacement + result.slice(entity.end);
  }

  return result;
}

function applyMethod(
  original: string,
  entity: PhiEntityResult,
  method: PhiMethod,
): string {
  switch (method) {
    case PhiMethod.REDACT:
      return `[${entity.entityType}]`;

    case PhiMethod.MASK:
      return '*'.repeat(original.length);

    case PhiMethod.REPLACE:
      return generateReplacement(entity.entityType, original.length);

    case PhiMethod.HASH:
      return hashValue(original);

    default:
      return `[${entity.entityType}]`;
  }
}

function generateReplacement(entityType: string, length: number): string {
  switch (entityType) {
    case 'SSN':
      return '000-00-0000';
    case 'PHONE':
      return '(000) 000-0000';
    case 'EMAIL':
      return 'redacted@example.com';
    case 'CREDIT_CARD':
      return '0000-0000-0000-0000';
    case 'DOB':
    case 'DATE':
      return '01/01/1900';
    case 'MRN':
      return 'MRN:000000';
    default:
      return 'X'.repeat(length);
  }
}

function hashValue(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, 16);
}
