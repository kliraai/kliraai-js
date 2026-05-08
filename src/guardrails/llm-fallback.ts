/**
 * Klira SDK v2 — LLM fallback service.
 *
 * Runs only when fast rules produce zero matches. Mirrors Python
 * `klira/sdk/guardrails/llm_fallback.py` — supports `provider` ∈
 * `{ "openai", "anthropic" }`, lazy-imports the provider package, and
 * honors the `onError` knob (`"allow"` ↔ fail-open, `"block"` ↔ fail-closed).
 */

import type { PolicyMatch } from '../types/index.js';

type EvaluationOutcome = {
  allowed: boolean;
  blocked: boolean;
  matches: PolicyMatch[];
  modifiedContent?: string;
};

export interface LLMService {
  evaluate(content: string, direction: string): Promise<EvaluationOutcome>;
}

export interface BuiltInFallbackOptions {
  readonly provider: 'openai' | 'anthropic';
  readonly model?: string;
  readonly apiKey?: string;
  readonly onError?: 'allow' | 'block';
}

const SYSTEM_PROMPT = (direction: string) =>
  `You are a strict compliance checker evaluating ${direction} content. ` +
  `Reply with EXACTLY one word: "ALLOW" if the content is safe, or "BLOCK" if it ` +
  `violates safety, privacy (PII/PHI), or compliance norms. No explanation.`;

function parseDecision(text: string | undefined): 'allow' | 'block' | 'unknown' {
  if (!text) return 'unknown';
  const upper = text.trim().toUpperCase();
  if (upper.startsWith('BLOCK')) return 'block';
  if (upper.startsWith('ALLOW')) return 'allow';
  return 'unknown';
}

/**
 * Built-in LLM fallback evaluator. Resolves the underlying provider SDK
 * lazily so consumers who don't enable fallback never pay the import cost.
 */
export class BuiltInLLMFallbackEvaluator implements LLMService {
  constructor(private readonly options: BuiltInFallbackOptions) {}

  async evaluate(content: string, direction: string): Promise<EvaluationOutcome> {
    const onError = this.options.onError ?? 'allow';
    try {
      const decision = await this.callProvider(content, direction);
      if (decision === 'block') {
        return {
          allowed: false,
          blocked: true,
          matches: [{
            ruleId: 'llm-fallback',
            message: 'Blocked by LLM fallback evaluator',
            blocked: true,
          }],
        };
      }
      // 'allow' or 'unknown' → pass through cleanly.
      return { allowed: true, blocked: false, matches: [] };
    } catch {
      // Fail-open or fail-closed per the configured policy.
      if (onError === 'block') {
        return {
          allowed: false,
          blocked: true,
          matches: [{
            ruleId: 'llm-fallback-error',
            message: 'LLM fallback errored; failing closed per onError="block"',
            blocked: true,
          }],
        };
      }
      return { allowed: true, blocked: false, matches: [] };
    }
  }

  private async callProvider(content: string, direction: string): Promise<'allow' | 'block' | 'unknown'> {
    const userPrompt = `Evaluate this ${direction} content:\n\n${content}`;
    // Dynamic imports use a runtime specifier so TS doesn't try to resolve
    // the optional peer dep at compile time.
    const dynImport: (s: string) => Promise<unknown> = (s) => import(/* @vite-ignore */ s);

    if (this.options.provider === 'anthropic') {
      const mod = (await dynImport('@anthropic-ai/sdk')) as Record<string, unknown>;
      const Anthropic = (mod.default ?? mod.Anthropic ?? mod) as new (
        opts: { apiKey?: string },
      ) => { messages: { create: (p: unknown) => Promise<unknown> } };
      const client = new Anthropic({ apiKey: this.options.apiKey });
      const response = (await client.messages.create({
        model: this.options.model ?? 'claude-3-5-haiku-20241022',
        max_tokens: 8,
        system: SYSTEM_PROMPT(direction),
        messages: [{ role: 'user', content: userPrompt }],
      })) as { content?: Array<{ text?: string }> };
      return parseDecision(response.content?.[0]?.text);
    }

    // openai (default)
    const mod = (await dynImport('openai')) as Record<string, unknown>;
    const OpenAI = (mod.default ?? mod.OpenAI ?? mod) as new (
      opts: { apiKey?: string },
    ) => { chat: { completions: { create: (p: unknown) => Promise<unknown> } } };
    const client = new OpenAI({ apiKey: this.options.apiKey });
    const response = (await client.chat.completions.create({
      model: this.options.model ?? 'gpt-4o-mini',
      max_tokens: 8,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT(direction) },
        { role: 'user', content: userPrompt },
      ],
    })) as { choices?: Array<{ message?: { content?: string } }> };
    return parseDecision(response.choices?.[0]?.message?.content);
  }
}

export class LLMFallbackService {
  private service: LLMService | null = null;
  private enabled = false;

  configure(service: LLMService): void {
    this.service = service;
    this.enabled = true;
  }

  /** Configure with the built-in provider evaluator. */
  configureBuiltIn(options: BuiltInFallbackOptions): void {
    this.configure(new BuiltInLLMFallbackEvaluator(options));
  }

  isEnabled(): boolean {
    return this.enabled && this.service !== null;
  }

  async evaluate(content: string, direction: 'inbound' | 'outbound'): Promise<EvaluationOutcome> {
    if (!this.service) {
      return { allowed: true, blocked: false, matches: [] };
    }
    return this.service.evaluate(content, direction);
  }

  /** @deprecated Use `configureBuiltIn({ provider: "openai", ... })`. */
  static createOpenAIService(options: { apiKey: string; model?: string }): LLMService {
    return new BuiltInLLMFallbackEvaluator({ provider: 'openai', apiKey: options.apiKey, model: options.model });
  }
}
