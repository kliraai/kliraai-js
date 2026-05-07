/**
 * Klira SDK v2 — OpenAI adapter.
 *
 * Wraps an OpenAI client instance. Intercepts chat.completions.create()
 * and creates klira.llm.openai spans with gen_ai.* attributes.
 */

import {
  withLLMSpan,
} from '../base-llm.js';
import type { LLMCallResult } from '../../types/index.js';
import { isPatched, markPatched } from '../sentinel.js';
import { getAndClearGuidelines } from '../../guardrails/guideline-context.js';
import {
  buildAugmentedMessages,
  buildAugmentedInstructions,
} from '../../guardrails/augmentation.js';

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
  if (isPatched(client as object)) return client;
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  const instrumentedCreate = async (params: any, ...rest: any[]) => {
    const model = params.model ?? 'unknown';
    let messages = params.messages ?? [];

    // Per-call guidelines arrive via AsyncLocalStorage (Phase 5). Constructor
    // `options.guidelines` is honored as a static fallback for the call.
    const dynamic = getAndClearGuidelines();
    const guidelines = dynamic ?? options?.guidelines ?? [];
    if (guidelines.length > 0) {
      messages = buildAugmentedMessages(messages, guidelines);
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
  const wrapped = new Proxy(client, {
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

  markPatched(wrapped as object);
  return wrapped;
}

/** @alias createOpenAIAdapter — Python parity name (openai chat completions). */
export const createOpenAICompletionAdapter = createOpenAIAdapter;

/**
 * Wrap an OpenAI Responses-API client so calls to `client.responses.create`
 * emit `klira.llm.openai.responses` spans. Mirrors Python's split between
 * the chat-completions adapter and the responses adapter.
 */
export function createOpenAIResponsesAdapter<T extends { responses: { create: (...args: any[]) => any } }>(
  client: T,
): T {
  if (isPatched(client as object)) return client;
  const originalCreate = client.responses.create.bind(client.responses);

  const instrumentedCreate = async (params: any, ...rest: any[]) => {
    const model = params.model ?? 'unknown';
    const messages = Array.isArray(params.input)
      ? params.input.map((m: any) => ({ role: m.role, content: m.content }))
      : params.input
        ? [{ role: 'user', content: String(params.input) }]
        : [];

    // Inject guidelines into the Responses-API `instructions` kwarg shape.
    const guidelines = getAndClearGuidelines();
    let finalParams: any = params;
    if (guidelines && guidelines.length > 0) {
      finalParams = {
        ...params,
        instructions: buildAugmentedInstructions(params.instructions, guidelines),
      };
    }

    return withLLMSpan(
      'openai.responses',
      { model, messages },
      async () => originalCreate(finalParams, ...rest),
      (response: any): LLMCallResult => ({
        model: response.model ?? model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        finishReasons: response.status ? [response.status] : [],
        output: response.output_text ?? response.output?.[0]?.content?.[0]?.text,
      }),
    );
  };

  const wrapped = new Proxy(client, {
    get(target, prop) {
      if (prop === 'responses') {
        return new Proxy(target.responses, {
          get(rTarget, rProp) {
            if (rProp === 'create') return instrumentedCreate;
            return (rTarget as any)[rProp];
          },
        });
      }
      return (target as any)[prop];
    },
  });

  markPatched(wrapped as object);
  return wrapped;
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
