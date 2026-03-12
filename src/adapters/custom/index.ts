/**
 * Klira SDK v2 — Custom adapter.
 *
 * For users with custom LLM integrations. Provides a simple function
 * to instrument any async LLM call with Klira spans.
 */

import { withLLMSpan, augmentMessages } from '../base-llm.js';
import type { LLMCallOptions, LLMCallResult } from '../../types/index.js';

/**
 * Instrument a custom LLM call with a klira.llm.{provider} span.
 *
 * @example
 * ```ts
 * import { instrumentLLMCall } from 'klira/adapters/custom';
 *
 * const result = await instrumentLLMCall(
 *   'my-llm',
 *   { model: 'my-model', messages: [...] },
 *   async () => {
 *     const response = await myCustomLLM.call(prompt);
 *     return response;
 *   },
 *   (response) => ({
 *     model: 'my-model',
 *     inputTokens: response.usage.input,
 *     outputTokens: response.usage.output,
 *     output: response.text,
 *   }),
 * );
 * ```
 */
export async function instrumentLLMCall<T>(
  provider: string,
  options: LLMCallOptions,
  fn: () => Promise<T>,
  extractResult?: (response: T) => LLMCallResult,
): Promise<T> {
  return withLLMSpan(provider, options, async () => fn(), extractResult);
}

/**
 * Create a reusable custom adapter for a specific provider.
 *
 * @example
 * ```ts
 * const myAdapter = createCustomAdapter('my-llm', {
 *   extractResult: (resp) => ({
 *     model: resp.model,
 *     outputTokens: resp.tokens,
 *     output: resp.text,
 *   }),
 * });
 *
 * const result = await myAdapter.call(
 *   { model: 'v1', messages: [...] },
 *   () => myLLM.generate(prompt),
 * );
 * ```
 */
export function createCustomAdapter<TResponse = unknown>(
  provider: string,
  adapterOptions?: {
    extractResult?: (response: TResponse) => LLMCallResult;
    guidelines?: readonly string[];
  },
) {
  return {
    frameworkName: 'custom',

    async call(
      options: LLMCallOptions,
      fn: () => Promise<TResponse>,
    ): Promise<TResponse> {
      // Augment messages if guidelines provided
      let callOptions = options;
      if (adapterOptions?.guidelines && options.messages) {
        callOptions = {
          ...options,
          messages: augmentMessages(options.messages, adapterOptions.guidelines),
        };
      }

      return withLLMSpan(
        provider,
        callOptions,
        async () => fn(),
        adapterOptions?.extractResult,
      );
    },
  };
}
