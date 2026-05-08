/**
 * Klira SDK — best-effort auto-patch of installed LLM SDKs at `Klira.init()`.
 *
 * **Honest limitation (PROD-764).** Most modern provider SDKs structure their
 * APIs as `client.chat.completions.create()` where `chat` and `completions`
 * are *per-instance* properties set in the constructor — they're not on the
 * prototype. Mutating `OpenAI.prototype.chat` doesn't exist; trying to wrap
 * `OpenAI.prototype` with a Proxy and discarding the result (which is what
 * an earlier revision did) was a silent no-op.
 *
 * Recommended path for customers is **explicit factory wrapping**:
 *
 * ```ts
 * import OpenAI from 'openai';
 * import { createOpenAIAdapter } from 'klira/openai';
 * const openai = createOpenAIAdapter(new OpenAI({ apiKey }));
 * ```
 *
 * What this function actually does:
 *
 * 1. For SDKs where the call methods *are* on the prototype (e.g. older
 *    Ollama, top-level `litellm.completion`), it patches the prototype
 *    directly — this works and instruments every instance.
 * 2. For SDKs whose call methods are per-instance (OpenAI, Anthropic,
 *    Gemini), it logs a `verbose`/`debug` notice that auto-patching is
 *    unavailable and recommends `createXAdapter(client)` explicitly.
 *
 * The idempotency sentinel ensures repeat calls don't double-wrap clients
 * that were instrumented via the explicit factory path.
 */

import { createOllamaAdapter } from './ollama/index.js';
import { createLiteLLMAdapter } from './litellm/index.js';
import { pkgLog } from '../utils/logger.js';

type DynamicImport = (specifier: string) => Promise<unknown>;
const dynamicImport: DynamicImport = (s) => import(/* @vite-ignore */ s);

function logUnavailable(packageName: string): void {
  // Info-level: not a problem per se, just informational for verbose
  // operators who want to know which providers Klira tried but couldn't
  // auto-patch. Quiet setups stay quiet.
  pkgLog.info(
    `auto-patch: '${packageName}' uses per-instance method structure; ` +
      `wrap clients explicitly with the corresponding createXAdapter() factory.`,
  );
}

async function tryPatch(
  packageName: string,
  patch: (mod: unknown) => void,
): Promise<void> {
  try {
    const mod = await dynamicImport(packageName);
    patch(mod);
  } catch {
    // Package not installed — silently skip.
  }
}

export async function autoPatchInstalledLLMs(): Promise<void> {
  // OpenAI / Anthropic / Gemini all use per-instance method structures —
  // auto-patching the prototype is a no-op. Document the limitation.
  await tryPatch('openai', () => logUnavailable('openai'));
  await tryPatch('@anthropic-ai/sdk', () => logUnavailable('@anthropic-ai/sdk'));
  await tryPatch('@google/generative-ai', () => logUnavailable('@google/generative-ai'));

  // Ollama: try the prototype path. Some Ollama versions expose `chat`
  // on the prototype; if so, patching there instruments all instances.
  await tryPatch('ollama', (mod) => {
    const m = mod as { Ollama?: unknown; default?: unknown };
    const Ollama = (m.Ollama ?? m.default ?? mod) as { prototype?: { chat?: unknown } } | unknown;
    if (typeof Ollama === 'function' && (Ollama as { prototype?: { chat?: unknown } }).prototype?.chat) {
      // The factory wraps a "client" but for the prototype path we wrap
      // the prototype itself; idempotency sentinel prevents double-wrap
      // on a second init.
      createOllamaAdapter((Ollama as { prototype: { chat: (...args: unknown[]) => unknown } }).prototype);
    } else {
      logUnavailable('ollama');
    }
  });

  // LiteLLM: a top-level `completion` function on the module exports is
  // wrappable directly because there's no instance to construct.
  await tryPatch('litellm', (mod) => {
    const m = mod as { completion?: unknown };
    if (typeof m.completion === 'function') {
      createLiteLLMAdapter(mod as { completion: (...args: unknown[]) => unknown });
    } else {
      logUnavailable('litellm');
    }
  });
}
