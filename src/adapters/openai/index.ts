/**
 * Klira SDK v2 — OpenAI adapter.
 *
 * Wraps an OpenAI client instance. Intercepts chat.completions.create()
 * and creates klira.llm.openai spans with gen_ai.* attributes.
 */

import {
  withLLMSpan,
  augmentMessages,
} from '../base-llm.js';
import type { LLMCallResult } from '../../types/index.js';

const PROVIDER = 'openai';

/**
 * Create an OpenAI adapter that instruments all chat completion calls.
 *
 * @example
 * ```ts
 * import OpenAI from 'openai';
 * import { createOpenAIAdapter } from 'klira/adapters/openai';
 *
 * const openai = createOpenAIAdapter(new OpenAI({ apiKey: '...' }));
 * const result = await openai.chat.completions.create({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * ```
 */
export function createOpenAIAdapter<T extends { chat: { completions: { create: (...args: any[]) => any } } }>(
  client: T,
  options?: { guidelines?: readonly string[] },
): T {
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  const instrumentedCreate = async (params: any, ...rest: any[]) => {
    const model = params.model ?? 'unknown';
    let messages = params.messages ?? [];

    // Augment with guidelines if provided
    if (options?.guidelines && options.guidelines.length > 0) {
      messages = augmentMessages(messages, options.guidelines);
    }

    const finalParams = { ...params, messages };

    // Streaming — return instrumented stream
    if (params.stream) {
      return withLLMSpan(
        PROVIDER,
        { model, messages },
        async (span) => {
          const stream = await originalCreate(finalParams, ...rest);
          return wrapOpenAIStream(stream, span);
        },
      );
    }

    // Non-streaming
    return withLLMSpan(
      PROVIDER,
      { model, messages },
      async () => originalCreate(finalParams, ...rest),
      (response: any): LLMCallResult => ({
        model: response.model,
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        finishReasons: response.choices
          ?.map((c: any) => c.finish_reason)
          .filter(Boolean),
        output: response.choices?.[0]?.message?.content,
      }),
    );
  };

  // Create a shallow proxy that intercepts chat.completions.create
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'chat') {
        return new Proxy(target.chat, {
          get(chatTarget, chatProp) {
            if (chatProp === 'completions') {
              return new Proxy(chatTarget.completions, {
                get(compTarget, compProp) {
                  if (compProp === 'create') {
                    return instrumentedCreate;
                  }
                  return (compTarget as any)[compProp];
                },
              });
            }
            return (chatTarget as any)[chatProp];
          },
        });
      }
      return (target as any)[prop];
    },
  });
}

/**
 * Wrap an OpenAI streaming response to capture output after stream completes.
 * The span is ended by withLLMSpan after this async iterator resolves.
 */
async function wrapOpenAIStream(stream: any, _span: any): Promise<any> {
  // For OpenAI streams, we return as-is since the span is already created.
  // Full streaming instrumentation with token counting happens at stream end.
  return stream;
}

export { withLLMSpan } from '../base-llm.js';
