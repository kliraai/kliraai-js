/**
 * Klira SDK — Auto-patch installed LLM SDKs at `Klira.init()` time.
 *
 * Mirrors Python's `_autoinstrument` behavior. We dynamically import each
 * supported provider package; if the package isn't installed, we skip it
 * silently. This keeps the SDK zero-config for the common case ("install
 * `klira` and your provider, nothing else") and the idempotency sentinel
 * (see `src/adapters/sentinel.ts`) ensures repeat calls don't double-wrap.
 */

import { createOpenAIAdapter, createOpenAIResponsesAdapter } from './openai/index.js';
import { createAnthropicAdapter } from './anthropic/index.js';
import { createGeminiAdapter } from './gemini/index.js';
import { createOllamaAdapter } from './ollama/index.js';
import { createLiteLLMAdapter } from './litellm/index.js';

type DynamicImport = (specifier: string) => Promise<unknown>;
const dynamicImport: DynamicImport = (s) => import(/* @vite-ignore */ s);

async function tryPatch(
  packageName: string,
  patch: (mod: any) => void, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<void> {
  try {
    const mod = await dynamicImport(packageName);
    patch(mod);
  } catch {
    // Package not installed or its constructor isn't usable — silently skip.
  }
}

export async function autoPatchInstalledLLMs(): Promise<void> {
  await tryPatch('openai', (mod) => {
    const OpenAI = mod.default ?? mod.OpenAI ?? mod;
    if (typeof OpenAI === 'function') {
      const original = OpenAI.prototype;
      if (original?.chat?.completions?.create) {
        // Best-effort prototype patch — the per-instance proxies still work.
        createOpenAIAdapter(original);
      }
      if (original?.responses?.create) {
        createOpenAIResponsesAdapter(original);
      }
    }
  });

  await tryPatch('@anthropic-ai/sdk', (mod) => {
    const Anthropic = mod.default ?? mod.Anthropic ?? mod;
    if (typeof Anthropic === 'function' && Anthropic.prototype?.messages?.create) {
      createAnthropicAdapter(Anthropic.prototype);
    }
  });

  await tryPatch('@google/generative-ai', (mod) => {
    const Gemini = mod.GoogleGenerativeAI ?? mod.default ?? mod;
    if (typeof Gemini === 'function' && Gemini.prototype?.generateContent) {
      createGeminiAdapter(Gemini.prototype);
    }
  });

  await tryPatch('ollama', (mod) => {
    const Ollama = mod.Ollama ?? mod.default ?? mod;
    if (typeof Ollama === 'function' && Ollama.prototype?.chat) {
      createOllamaAdapter(Ollama.prototype);
    }
  });

  await tryPatch('litellm', (mod) => {
    if (typeof mod.completion === 'function') {
      createLiteLLMAdapter(mod);
    }
  });
}
