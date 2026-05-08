/**
 * PROD-764 Phase 4 — adapter idempotency sentinel.
 *
 * Mirrors the Python `tests/unit/test_llm_adapters.py:650-815` regression
 * for PROD-483: re-patching a client must not produce nested wrappers,
 * so a single LLM call must produce a single `klira.llm.*` span.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { createOpenAIAdapter, createOpenAIResponsesAdapter } from '../../adapters/openai/index.js';
import { createAnthropicAdapter } from '../../adapters/anthropic/index.js';
import { createOllamaAdapter } from '../../adapters/ollama/index.js';
import { createLiteLLMAdapter } from '../../adapters/litellm/index.js';
import { isPatched } from '../../adapters/sentinel.js';

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  context.setGlobalContextManager(new AsyncLocalStorageContextManager());
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
});

afterEach(async () => {
  await provider.shutdown();
  context.disable();
  trace.disable();
});

function makeOpenAIClient() {
  return {
    chat: {
      completions: {
        create: async (p: any) => ({
          model: p.model,
          choices: [{ finish_reason: 'stop', message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      },
    },
  };
}

describe('idempotency sentinel', () => {
  it('marks the patched client and short-circuits a second wrap (OpenAI)', () => {
    const original = makeOpenAIClient();
    const once = createOpenAIAdapter(original);
    expect(isPatched(once as object)).toBe(true);

    const twice = createOpenAIAdapter(once);
    expect(twice).toBe(once);
  });

  it('produces exactly one klira.llm.openai span across two patch calls', async () => {
    const original = makeOpenAIClient();
    const wrapped1 = createOpenAIAdapter(original);
    const wrapped2 = createOpenAIAdapter(wrapped1); // no-op

    await wrapped2.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const llmSpans = exporter.getFinishedSpans().filter((s) => s.name.startsWith('klira.llm.'));
    expect(llmSpans).toHaveLength(1);
    expect(llmSpans[0].name).toBe('klira.llm.openai.completion');
  });

  it('Anthropic short-circuits second-wrap', () => {
    const client = {
      messages: {
        create: async () => ({ content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 1, output_tokens: 1 } }),
      },
    };
    const once = createAnthropicAdapter(client);
    expect(createAnthropicAdapter(once)).toBe(once);
  });

  it('Ollama short-circuits second-wrap', () => {
    const client = { chat: async () => ({ message: { content: 'x' }, done: true }) };
    const once = createOllamaAdapter(client);
    expect(createOllamaAdapter(once)).toBe(once);
  });

  it('LiteLLM short-circuits second-wrap', () => {
    const client = {
      completion: async () => ({ choices: [{ message: { content: 'x' } }], usage: {} }),
    };
    const once = createLiteLLMAdapter(client);
    expect(createLiteLLMAdapter(once)).toBe(once);
  });
});

describe('OpenAI Responses adapter (Python parity)', () => {
  it('emits klira.llm.openai.responses spans', async () => {
    const client = {
      responses: {
        create: async (p: any) => ({
          model: p.model,
          status: 'completed',
          output_text: 'hi',
          usage: { input_tokens: 2, output_tokens: 3 },
        }),
      },
    };
    const wrapped = createOpenAIResponsesAdapter(client);
    await wrapped.responses.create({ model: 'gpt-4o-mini', input: 'hi' });

    const spans = exporter.getFinishedSpans();
    const llm = spans.find((s) => s.name === 'klira.llm.openai.responses');
    expect(llm).toBeDefined();
    // Python parity: gen_ai.system is the *provider* name only ("openai"),
    // not the API variant. The span name carries the variant via the
    // `.responses` operation suffix.
    expect(llm!.attributes['gen_ai.system']).toBe('openai');
    expect(llm!.attributes['gen_ai.usage.input_tokens']).toBe(2);
    expect(llm!.attributes['gen_ai.usage.output_tokens']).toBe(3);
  });

  it('Responses adapter short-circuits second-wrap', () => {
    const client = {
      responses: { create: async () => ({ status: 'completed', output_text: 'x' }) },
    };
    const once = createOpenAIResponsesAdapter(client);
    expect(createOpenAIResponsesAdapter(once)).toBe(once);
  });
});
