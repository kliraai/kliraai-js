/**
 * Klira SDK — `withGuardrails` HOF.
 *
 * Mirrors Python's `@guardrails` decorator. Wraps a function so that:
 *  1. Inputs are evaluated against the inbound guardrails before the
 *     function runs — a `blocked` decision throws `KliraPolicyViolation`.
 *  2. If the input flow produces guidelines, they are deposited into
 *     the AsyncLocalStorage cell (`guideline-context`) so the next LLM
 *     adapter call in this scope can read-and-clear them.
 *  3. The wrapped function runs.
 *  4. Its return value is evaluated against the outbound guardrails;
 *     a `blocked` decision throws `KliraPolicyViolation`.
 */

import { GuardrailsEngine } from '../guardrails/engine.js';
import { KliraPolicyViolation } from '../types/index.js';
import {
  runWithGuidelines,
  setGuidelines,
} from '../guardrails/guideline-context.js';

export interface WithGuardrailsOptions {
  /** Reserved for future policy-set scoping. */
  readonly policySet?: string;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function withGuardrails<TArgs extends unknown[], TReturn>(
  _name: string,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  _opts: WithGuardrailsOptions = {},
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const engine = GuardrailsEngine.getInstance();
    if (!engine.isInitialized()) {
      await engine.initialize();
    }

    const inputContent = args.map(stringify).filter(Boolean).join('\n');

    return runWithGuidelines(null, async () => {
      const inResult = await engine.evaluateInput(inputContent);
      if (inResult.blocked) {
        throw new KliraPolicyViolation(
          'Input blocked by guardrails',
          [...inResult.matches],
        );
      }
      if (inResult.guidelines && inResult.guidelines.length > 0) {
        setGuidelines(inResult.guidelines);
      }

      const value = await fn(...args);

      const outContent = stringify(value);
      const outResult = await engine.evaluateOutput(outContent);
      if (outResult.blocked) {
        throw new KliraPolicyViolation(
          'Output blocked by guardrails',
          [...outResult.matches],
        );
      }

      return value;
    });
  };
}
