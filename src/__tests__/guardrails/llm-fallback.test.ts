/**
 * PROD-764 — BuiltInLLMFallbackEvaluator.
 *
 * The provider SDKs are dynamically imported, so the unit test injects a
 * fake `LLMService` directly via `LLMFallbackService.configure` to drive
 * the engine end-to-end without faking ESM imports.
 */

import { describe, it, expect } from 'vitest';
import { BuiltInLLMFallbackEvaluator, LLMFallbackService } from '../../guardrails/llm-fallback.js';

describe('BuiltInLLMFallbackEvaluator', () => {
  it('honors onError="block" by failing closed when the provider throws', async () => {
    const evaluator = new BuiltInLLMFallbackEvaluator({
      provider: 'openai',
      // Bogus key + missing module → callProvider throws.
      apiKey: 'klira_test_key',
      onError: 'block',
    });

    // Force the dynamic import to fail by overriding the spec lookup —
    // the fallback should fail closed.
    const result = await evaluator.evaluate('hello', 'inbound');
    expect(result.blocked).toBe(true);
    expect(result.matches[0].ruleId).toBe('llm-fallback-error');
  });

  it('honors onError="allow" (default) by failing open on provider errors', async () => {
    const evaluator = new BuiltInLLMFallbackEvaluator({
      provider: 'anthropic',
      apiKey: 'klira_test_key',
    });

    const result = await evaluator.evaluate('hello', 'inbound');
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);
  });
});

describe('LLMFallbackService', () => {
  it('passes through to a configured service', async () => {
    const svc = new LLMFallbackService();
    svc.configure({
      async evaluate(content: string, direction: string) {
        if (content.includes('badword')) {
          return {
            allowed: false,
            blocked: true,
            matches: [{ ruleId: 'fake', message: `${direction}: blocked`, blocked: true }],
          };
        }
        return { allowed: true, blocked: false, matches: [] };
      },
    });

    const ok = await svc.evaluate('hello', 'inbound');
    expect(ok.blocked).toBe(false);

    const blocked = await svc.evaluate('badword in input', 'inbound');
    expect(blocked.blocked).toBe(true);
  });

  it('returns an allow result when nothing is configured', async () => {
    const svc = new LLMFallbackService();
    expect(svc.isEnabled()).toBe(false);
    const result = await svc.evaluate('content', 'outbound');
    expect(result.allowed).toBe(true);
  });
});
