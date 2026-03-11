/**
 * Klira SDK v2 — LiteLLM adapter.
 *
 * Wraps a LiteLLM JS client. Intercepts completion/chat calls and
 * creates klira.llm.litellm spans with gen_ai.* attributes.
 */

import {
  withLLMSpan,
  augmentMessages,
} from '../base-llm.js';
import type { LLMCallResult } from '../../types/index.js';

const PROVIDER = 'litellm';

/**
 * Create a LiteLLM adapter that instruments completion calls.
 *
 * @example
 * ```ts
 * import { createLiteLLMAdapter } from 'klira/adapters/litellm';
 *
 * const litellm = createLiteLLMAdapter(litellmClient);
 * const result = await litellm.completion({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * ```
 */
export function createLiteLLMAdapter<T extends { completion: (...args: any[]) => any }>(
  client: T,
  options?: { guidelines?: readonly string[] },
): T {
  const originalCompletion = client.completion.bind(client);

  const instrumentedCompletion = async (params: any, ...rest: any[]) => {
    const model = params.model ?? 'unknown';
    let messages = params.messages ?? [];

    if (options?.guidelines && options.guidelines.length > 0) {
      messages = augmentMessages(messages, options.guidelines);
    }

    const finalParams = { ...params, messages };

    return withLLMSpan(
      PROVIDER,
      { model, messages },
      async () => originalCompletion(finalParams, ...rest),
      (response: any): LLMCallResult => ({
        model: response.model ?? model,
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        finishReasons: response.choices
          ?.map((c: any) => c.finish_reason)
          .filter(Boolean),
        output: response.choices?.[0]?.message?.content,
      }),
    );
  };

  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'completion') {
        return instrumentedCompletion;
      }
      return (target as any)[prop];
    },
  });
}
