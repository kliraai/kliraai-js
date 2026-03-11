/**
 * Klira SDK v2 — Vercel AI SDK adapter.
 *
 * Wraps generateText, streamText, generateObject, streamObject.
 * Suppresses Vercel telemetry by NOT passing experimental_telemetry (opt-in).
 * Creates klira.llm.{provider} spans with gen_ai.* attributes.
 */

import { withLLMSpan, augmentMessages } from '../base-llm.js';
import type { LLMCallResult } from '../../types/index.js';

const FRAMEWORK_NAME = 'vercel-ai';

// ---------------------------------------------------------------------------
// Types (avoid requiring as dependency)
// ---------------------------------------------------------------------------

interface VercelAIModel {
  provider?: string;
  modelId?: string;
  [key: string]: unknown;
}

interface VercelAIParams {
  model: VercelAIModel;
  messages?: Array<Record<string, unknown>>;
  prompt?: string;
  system?: string;
  experimental_telemetry?: unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface VercelAIAdapterOptions {
  guidelines?: readonly string[];
}

/**
 * Create a Vercel AI SDK adapter.
 *
 * @example
 * ```ts
 * import { generateText } from 'ai';
 * import { createVercelAIAdapter } from 'klira/adapters/vercel-ai';
 *
 * const kliraAI = createVercelAIAdapter();
 * const result = await kliraAI.generateText({
 *   model: openai('gpt-4o'),
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * ```
 */
export function createVercelAIAdapter(options?: VercelAIAdapterOptions) {
  return {
    frameworkName: FRAMEWORK_NAME,

    /**
     * Wrap Vercel AI SDK's generateText.
     */
    generateText: wrapVercelFn('generateText', options),

    /**
     * Wrap Vercel AI SDK's streamText.
     */
    streamText: wrapVercelFn('streamText', options),

    /**
     * Wrap Vercel AI SDK's generateObject.
     */
    generateObject: wrapVercelFn('generateObject', options),

    /**
     * Wrap Vercel AI SDK's streamObject.
     */
    streamObject: wrapVercelFn('streamObject', options),

    patchFramework(): void {
      // Vercel AI SDK telemetry is opt-in via experimental_telemetry.
      // By not passing it, native telemetry is suppressed.
    },

    verifySuppression(): boolean {
      return true;
    },
  };
}

/**
 * Create a wrapper for a Vercel AI SDK function.
 * Returns a function that takes (originalFn, params) and instruments the call.
 */
function wrapVercelFn(
  operation: string,
  options?: VercelAIAdapterOptions,
) {
  return async (originalFn: (...args: any[]) => any, params: VercelAIParams) => {
    const provider = params.model?.provider ?? 'unknown';
    const modelId = params.model?.modelId ?? 'unknown';

    // Suppress native telemetry by removing experimental_telemetry
    const { experimental_telemetry, ...cleanParams } = params;

    // Augment messages with guidelines
    let messages = cleanParams.messages;
    if (options?.guidelines && options.guidelines.length > 0 && messages) {
      messages = augmentMessages(messages, options.guidelines);
    }

    const finalParams = { ...cleanParams, messages };

    return withLLMSpan(
      provider,
      {
        model: modelId,
        messages: messages as Array<Record<string, unknown>>,
      },
      async (span) => {
        span.setAttribute('klira.framework', FRAMEWORK_NAME);
        span.setAttribute('klira.framework.operation', operation);
        return originalFn(finalParams);
      },
      (response: any): LLMCallResult => ({
        model: modelId,
        inputTokens: response?.usage?.promptTokens,
        outputTokens: response?.usage?.completionTokens,
        finishReasons: response?.finishReason ? [response.finishReason] : [],
        output: response?.text
          ?? (response?.object ? JSON.stringify(response.object).slice(0, 500) : undefined),
      }),
    );
  };
}
