/**
 * Klira SDK v2 — tool() HOF
 *
 * Creates a klira.tool.{name} span wrapping the given function.
 * Supports optional FHIR resource type tracking.
 */

import { withSpan } from './context.js';
import { captureOutput } from './output.js';
import type { ToolOptions } from '../types/index.js';

export function tool<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  options?: ToolOptions,
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs): Promise<TReturn> => {
    const attrs: Record<string, string> = {
      'klira.entity_type': 'tool',
      'klira.entity_name': name,
    };

    if (options?.fhirResourceType) {
      attrs['klira.fhir.resource_type'] = options.fhirResourceType;
    }

    const result = withSpan(
      `klira.tool.${name}`,
      attrs,
      async (span) => {
        const value = await fn(...args);
        captureOutput(span, value);
        return value;
      },
    );
    return result as Promise<TReturn>;
  };
}
