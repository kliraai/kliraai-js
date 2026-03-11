/**
 * Klira SDK v2 — Anthropic adapter.
 *
 * Wraps an Anthropic client instance. Intercepts messages.create()
 * and creates klira.llm.anthropic spans with gen_ai.* attributes.
 */

import {
  withLLMSpan,
  augmentMessages,
} from '../base-llm.js';
import type { LLMCallResult } from '../../types/index.js';

const PROVIDER = 'anthropic';

/**
 * Create an Anthropic adapter that instruments all message creation calls.
 *
 * @example
 * ```ts
 * import Anthropic from '@anthropic-ai/sdk';
 * import { createAnthropicAdapter } from 'klira/adapters/anthropic';
 *
 * const anthropic = createAnthropicAdapter(new Anthropic({ apiKey: '...' }));
 * const result = await anthropic.messages.create({
 *   model: 'claude-sonnet-4-20250514',
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * ```
 */
export function createAnthropicAdapter<T extends { messages: { create: (...args: any[]) => any } }>(
  client: T,
  options?: { guidelines?: readonly string[] },
): T {
  const originalCreate = client.messages.create.bind(client.messages);

  const instrumentedCreate = async (params: any, ...rest: any[]) => {
    const model = params.model ?? 'unknown';
    let messages = params.messages ?? [];

    if (options?.guidelines && options.guidelines.length > 0) {
      messages = augmentMessages(messages, options.guidelines);
    }

    const finalParams = { ...params, messages };

    // Streaming
    if (params.stream) {
      return withLLMSpan(
        PROVIDER,
        { model, messages },
        async () => originalCreate(finalParams, ...rest),
      );
    }

    // Non-streaming
    return withLLMSpan(
      PROVIDER,
      { model, messages },
      async () => originalCreate(finalParams, ...rest),
      (response: any): LLMCallResult => ({
        model: response.model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        finishReasons: response.stop_reason ? [response.stop_reason] : [],
        output: response.content
          ?.filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join(''),
      }),
    );
  };

  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'messages') {
        return new Proxy(target.messages, {
          get(msgTarget, msgProp) {
            if (msgProp === 'create') {
              return instrumentedCreate;
            }
            return (msgTarget as any)[msgProp];
          },
        });
      }
      return (target as any)[prop];
    },
  });
}
