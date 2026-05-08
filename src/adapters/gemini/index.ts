/**
 * Klira SDK v2 — Gemini adapter.
 *
 * Wraps a Google Generative AI client. Intercepts generateContent()
 * and creates klira.llm.gemini spans with gen_ai.* attributes.
 */

import {
  withLLMSpan,
} from '../base-llm.js';
import type { LLMCallResult } from '../../types/index.js';
import { isPatched, markPatched } from '../sentinel.js';
import { getAndClearGuidelines } from '../../guardrails/guideline-context.js';
import { buildAugmentedContents } from '../../guardrails/augmentation.js';

const PROVIDER = 'gemini';

/**
 * Create a Gemini adapter that instruments generateContent calls.
 *
 * @example
 * ```ts
 * import { GoogleGenerativeAI } from '@google/generative-ai';
 * import { createGeminiAdapter } from '@klira-ai/sdk/gemini';
 *
 * const genAI = new GoogleGenerativeAI(apiKey);
 * const model = createGeminiAdapter(genAI.getGenerativeModel({ model: 'gemini-pro' }));
 * const result = await model.generateContent('Hello');
 * ```
 */
export function createGeminiAdapter<T extends { generateContent: (...args: any[]) => any }>(
  model: T,
  options?: { modelName?: string },
): T {
  if (isPatched(model as object)) return model;
  const originalGenerate = model.generateContent.bind(model);
  const modelName = options?.modelName ?? 'gemini-pro';

  const instrumentedGenerate = async (...args: any[]) => {
    const request = args[0];
    const messages = typeof request === 'string'
      ? [{ role: 'user', content: request }]
      : (request?.contents ?? []).map((c: any) => ({
          role: c.role,
          content: c.parts?.map((p: any) => p.text).join('') ?? '',
        }));

    // Inject guidelines into Gemini's `contents` field shape.
    const guidelines = getAndClearGuidelines();
    let finalArgs = args;
    if (guidelines && guidelines.length > 0 && typeof request !== 'string') {
      const augmented = buildAugmentedContents(request?.contents, guidelines);
      finalArgs = [{ ...request, contents: augmented }, ...args.slice(1)];
    }

    return withLLMSpan(
      PROVIDER,
      { model: modelName, messages },
      async () => originalGenerate(...finalArgs),
      (response: any): LLMCallResult => {
        const text = response?.response?.text?.() ?? '';
        const usage = response?.response?.usageMetadata;
        return {
          model: modelName,
          inputTokens: usage?.promptTokenCount,
          outputTokens: usage?.candidatesTokenCount,
          finishReasons: response?.response?.candidates
            ?.map((c: any) => c.finishReason)
            .filter(Boolean),
          output: text,
        };
      },
    );
  };

  const wrapped = new Proxy(model, {
    get(target, prop) {
      if (prop === 'generateContent') {
        return instrumentedGenerate;
      }
      return (target as any)[prop];
    },
  });

  markPatched(wrapped as object);
  return wrapped;
}
