/**
 * Klira SDK v2 — Output capture utility.
 *
 * Serializes wrapper output to a string and sets it on the span,
 * truncated to 500 chars per plan specification.
 */

import type { Span } from '@opentelemetry/api';

const OUTPUT_TRUNCATION_LIMIT = 500;

export function captureOutput(span: Span, result: unknown): void {
  if (result === undefined || result === null) return;

  let output: string;
  if (typeof result === 'string') {
    output = result;
  } else {
    try {
      output = JSON.stringify(result);
    } catch {
      output = String(result);
    }
  }

  if (output.length > OUTPUT_TRUNCATION_LIMIT) {
    output = output.slice(0, OUTPUT_TRUNCATION_LIMIT) + '…';
  }

  span.setAttribute('klira.output', output);
}
