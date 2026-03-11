/**
 * Klira SDK v2 — workflow() HOF
 *
 * Creates a klira.workflow.{name} span wrapping the given function.
 */

import { withSpan } from './context.js';
import { captureOutput } from './output.js';

export function workflow<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs): Promise<TReturn> => {
    const result = withSpan(
      `klira.workflow.${name}`,
      {
        'klira.entity_type': 'workflow',
        'klira.entity_name': name,
      },
      async (span) => {
        const value = await fn(...args);
        captureOutput(span, value);
        return value;
      },
    );
    return result as Promise<TReturn>;
  };
}
