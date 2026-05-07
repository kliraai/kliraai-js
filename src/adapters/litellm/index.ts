/**
 * Klira SDK v2 — LiteLLM adapter.
 *
 * Wraps a LiteLLM JS client. Intercepts completion/chat calls and
 * creates klira.llm.litellm spans with gen_ai.* attributes.
 */

import {
  withLLMSpan,
} from '../base-llm.js';
import type { LLMCallResult } from '../../types/index.js';
import { isPatched, markPatched } from '../sentinel.js';
import { getAndClearGuidelines } from '../../guardrails/guideline-context.js';
import { buildAugmentedMessages } from '../../guardrails/augmentation.js';

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
  if (isPatched(client as object)) return client;
  const originalCompletion = client.completion.bind(client);

  const instrumentedCompletion = async (params: any, ...rest: any[]) => {
    const model = params.model ?? 'unknown';
    let messages = params.messages ?? [];

    const dynamic = getAndClearGuidelines();
    const guidelines = dynamic ?? options?.guidelines ?? [];
    if (guidelines.length > 0) {
      messages = buildAugmentedMessages(messages, guidelines);
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

  const wrapped = new Proxy(client, {
    get(target, prop) {
      if (prop === 'completion') {
        return instrumentedCompletion;
      }
      return (target as any)[prop];
    },
  });

  markPatched(wrapped as object);
  return wrapped;
}
