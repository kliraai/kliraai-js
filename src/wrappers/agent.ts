/**
 * Klira SDK v2 — agent() HOF
 *
 * Creates a klira.agent.{name} span wrapping the given function.
 */

import { withSpan } from './context.js';
import { captureOutput } from './output.js';

export function agent<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs): Promise<TReturn> => {
    const result = withSpan(
      `klira.agent.${name}`,
      {
        'klira.entity_type': 'agent',
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
