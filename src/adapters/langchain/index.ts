/**
 * Klira SDK v2 — LangChain.js adapter.
 *
 * Provides a callback handler that creates Klira spans for LangChain operations.
 * Suppresses LangChain native tracing by setting LANGCHAIN_TRACING_V2=false.
 */

import { withLLMSpan, augmentMessages } from '../base-llm.js';
import type { LLMCallResult } from '../../types/index.js';

const FRAMEWORK_NAME = 'langchain';

// ---------------------------------------------------------------------------
// Types (avoid requiring as dependency)
// ---------------------------------------------------------------------------

interface LangChainCallbackHandlerMethods {
  handleLLMStart?: (
    llm: { name: string },
    prompts: string[],
    runId: string,
  ) => void | Promise<void>;
  handleLLMEnd?: (output: any, runId: string) => void | Promise<void>;
  handleLLMError?: (error: Error, runId: string) => void | Promise<void>;
  handleChainStart?: (
    chain: { name: string },
    inputs: Record<string, unknown>,
    runId: string,
  ) => void | Promise<void>;
  handleChainEnd?: (outputs: Record<string, unknown>, runId: string) => void | Promise<void>;
  handleChainError?: (error: Error, runId: string) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface LangChainAdapterOptions {
  guidelines?: readonly string[];
  suppressNativeTracing?: boolean;
}

/**
 * Create a LangChain adapter that instruments LLM calls with Klira spans.
 *
 * @example
 * ```ts
 * import { createLangChainAdapter } from 'klira/adapters/langchain';
 *
 * const kliraLangChain = createLangChainAdapter();
 *
 * // Use the wrapModel helper to instrument a model
 * const instrumentedModel = kliraLangChain.wrapModel(model);
 * ```
 */
export function createLangChainAdapter(options?: LangChainAdapterOptions) {
  // Suppress native LangChain tracing
  if (options?.suppressNativeTracing !== false) {
    if (typeof process !== 'undefined') {
      process.env.LANGCHAIN_TRACING_V2 = 'false';
    }
  }

  return {
    frameworkName: FRAMEWORK_NAME,

    /**
     * Wrap a LangChain model's invoke method with Klira instrumentation.
     */
    wrapModel<T extends { invoke: (...args: any[]) => any }>(
      model: T,
      modelOptions?: { provider?: string; modelName?: string },
    ): T {
      const provider = modelOptions?.provider ?? 'langchain';
      const modelName = modelOptions?.modelName ?? 'unknown';
      const originalInvoke = model.invoke.bind(model);

      const instrumentedInvoke = async (input: any, ...rest: any[]) => {
        // Extract messages from input
        let messages: Array<Record<string, unknown>> = [];
        if (Array.isArray(input)) {
          messages = input.map((m: any) => ({
            role: m._getType?.() ?? m.role ?? 'user',
            content: typeof m === 'string' ? m : m.content ?? String(m),
          }));
        } else if (typeof input === 'string') {
          messages = [{ role: 'user', content: input }];
        }

        // Augment with guidelines
        if (options?.guidelines && options.guidelines.length > 0) {
          messages = augmentMessages(messages, options.guidelines);
        }

        return withLLMSpan(
          provider,
          { model: modelName, messages },
          async (span) => {
            span.setAttribute('klira.framework', FRAMEWORK_NAME);
            return originalInvoke(input, ...rest);
          },
          (response: any): LLMCallResult => ({
            model: modelName,
            inputTokens: response?.response_metadata?.usage?.prompt_tokens
              ?? response?.usage_metadata?.input_tokens,
            outputTokens: response?.response_metadata?.usage?.completion_tokens
              ?? response?.usage_metadata?.output_tokens,
            finishReasons: response?.response_metadata?.finish_reason
              ? [response.response_metadata.finish_reason]
              : [],
            output: typeof response === 'string'
              ? response
              : response?.content ?? response?.text,
          }),
        );
      };

      return new Proxy(model, {
        get(target, prop) {
          if (prop === 'invoke') {
            return instrumentedInvoke;
          }
          return (target as any)[prop];
        },
      });
    },

    patchFramework(): void {
      if (typeof process !== 'undefined') {
        process.env.LANGCHAIN_TRACING_V2 = 'false';
      }
    },

    verifySuppression(): boolean {
      return process.env.LANGCHAIN_TRACING_V2 === 'false';
    },
  };
}
