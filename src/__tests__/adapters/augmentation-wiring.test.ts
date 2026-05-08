/**
 * PROD-764 — adapter migration to per-provider augmentation helpers.
 *
 * Verifies the *wire shape* the adapters send when guidelines are
 * deposited via the AsyncLocalStorage cell:
 *  - Anthropic → native `system` kwarg
 *  - OpenAI Responses → `instructions` kwarg
 *  - OpenAI / Ollama / LiteLLM → chat-message list
 *  - Gemini → `contents` field
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { createAnthropicAdapter } from '../../adapters/anthropic/index.js';
import { createOpenAIAdapter, createOpenAIResponsesAdapter } from '../../adapters/openai/index.js';
import { createOllamaAdapter } from '../../adapters/ollama/index.js';
import { createLiteLLMAdapter } from '../../adapters/litellm/index.js';
import { createGeminiAdapter } from '../../adapters/gemini/index.js';
import { runWithGuidelines } from '../../guardrails/guideline-context.js';

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

describe('Anthropic — guidelines into native system kwarg', () => {
  it('appends to a string system kwarg, leaves messages untouched', async () => {
    let captured: any;
    const client = {
      messages: {
        create: async (params: any) => {
          captured = params;
          return { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } };
        },
      },
    };
    const wrapped = createAnthropicAdapter(client);

    await runWithGuidelines(['Cite sources'], async () => {
      await wrapped.messages.create({
        model: 'claude-3-5',
        system: 'Be helpful.',
        messages: [{ role: 'user', content: 'hi' }],
      });
    });

    expect(typeof captured.system).toBe('string');
    expect(captured.system).toContain('Be helpful.');
    expect(captured.system).toContain('Cite sources');
    expect(captured.messages).toHaveLength(1);
    expect(captured.messages[0].role).toBe('user');
  });
});

describe('OpenAI Responses — guidelines into instructions kwarg', () => {
  it('appends to existing instructions', async () => {
    let captured: any;
    const client = {
      responses: {
        create: async (params: any) => {
          captured = params;
          return { status: 'completed', output_text: 'ok' };
        },
      },
    };
    const wrapped = createOpenAIResponsesAdapter(client);

    await runWithGuidelines(['Cite sources'], async () => {
      await wrapped.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
        instructions: 'Use formal tone.',
      });
    });

    expect(typeof captured.instructions).toBe('string');
    expect(captured.instructions).toContain('Use formal tone.');
    expect(captured.instructions).toContain('Cite sources');
  });
});

describe('Chat-message providers — guidelines prepended as system message', () => {
  it('OpenAI', async () => {
    let captured: any;
    const client = {
      chat: { completions: { create: async (p: any) => { captured = p; return { choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage: {} }; } } },
    };
    const wrapped = createOpenAIAdapter(client);

    await runWithGuidelines(['Cite sources'], async () => {
      await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    });

    expect(captured.messages[0].role).toBe('system');
    expect(String(captured.messages[0].content)).toContain('Cite sources');
  });

  it('Ollama', async () => {
    let captured: any;
    const client = { chat: async (p: any) => { captured = p; return { message: { content: 'ok' }, done: true }; } };
    const wrapped = createOllamaAdapter(client);

    await runWithGuidelines(['Cite sources'], async () => {
      await wrapped.chat({ model: 'llama3', messages: [{ role: 'user', content: 'hi' }] });
    });

    expect(captured.messages[0].role).toBe('system');
  });

  it('LiteLLM', async () => {
    let captured: any;
    const client = { completion: async (p: any) => { captured = p; return { choices: [{ message: { content: 'ok' } }], usage: {} }; } };
    const wrapped = createLiteLLMAdapter(client);

    await runWithGuidelines(['Cite sources'], async () => {
      await wrapped.completion({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    });

    expect(captured.messages[0].role).toBe('system');
  });
});

describe('Gemini — guidelines prepended into contents', () => {
  it('augments the contents array', async () => {
    let captured: any;
    const model = {
      generateContent: async (req: any) => {
        captured = req;
        return { response: { text: () => 'ok', usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } } };
      },
    };
    const wrapped = createGeminiAdapter(model);

    await runWithGuidelines(['Cite sources'], async () => {
      await wrapped.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      });
    });

    // Single turn (merged into the first user content) — Gemini rejects
    // two consecutive user turns.
    expect(captured.contents.length).toBe(1);
    expect(captured.contents[0].role).toBe('user');
    expect(String(captured.contents[0].parts[0].text)).toContain('Cite sources');
    expect(String(captured.contents[0].parts[0].text)).toContain('hi');
  });
});
