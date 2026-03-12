/**
 * Klira SDK v2 — task() HOF
 *
 * Creates a klira.task.{name} span wrapping the given function.
 */

import { withSpan } from './context.js';
import { captureOutput } from './output.js';

export function task<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs): Promise<TReturn> => {
    const result = withSpan(
      `klira.task.${name}`,
      {
        'klira.entity_type': 'task',
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
