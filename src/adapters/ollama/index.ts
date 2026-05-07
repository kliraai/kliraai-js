/**
 * Klira SDK v2 — Ollama adapter.
 *
 * Wraps an Ollama client. Intercepts chat() and creates
 * klira.llm.ollama spans with gen_ai.* attributes.
 */

import {
  withLLMSpan,
} from '../base-llm.js';
import type { LLMCallResult } from '../../types/index.js';
import { isPatched, markPatched } from '../sentinel.js';
import { getAndClearGuidelines } from '../../guardrails/guideline-context.js';
import { buildAugmentedMessages } from '../../guardrails/augmentation.js';

const PROVIDER = 'ollama';

/**
 * Create an Ollama adapter that instruments chat calls.
 *
 * @example
 * ```ts
 * import { Ollama } from 'ollama';
 * import { createOllamaAdapter } from 'klira/adapters/ollama';
 *
 * const ollama = createOllamaAdapter(new Ollama());
 * const result = await ollama.chat({
 *   model: 'llama3',
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * ```
 */
export function createOllamaAdapter<T extends { chat: (...args: any[]) => any }>(
  client: T,
  options?: { guidelines?: readonly string[] },
): T {
  if (isPatched(client as object)) return client;
  const originalChat = client.chat.bind(client);

  const instrumentedChat = async (params: any, ...rest: any[]) => {
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
      async () => originalChat(finalParams, ...rest),
      (response: any): LLMCallResult => ({
        model: response.model ?? model,
        inputTokens: response.prompt_eval_count,
        outputTokens: response.eval_count,
        finishReasons: response.done ? ['stop'] : [],
        output: response.message?.content,
      }),
    );
  };

  const wrapped = new Proxy(client, {
    get(target, prop) {
      if (prop === 'chat') {
        return instrumentedChat;
      }
      return (target as any)[prop];
    },
  });

  markPatched(wrapped as object);
  return wrapped;
}
