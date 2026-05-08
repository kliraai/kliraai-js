import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { createOpenAIAdapter } from '../../adapters/openai/index.js';
import { createAnthropicAdapter } from '../../adapters/anthropic/index.js';
import { createGeminiAdapter } from '../../adapters/gemini/index.js';
import { createOllamaAdapter } from '../../adapters/ollama/index.js';
import { createLiteLLMAdapter } from '../../adapters/litellm/index.js';
import {
  withLLMSpan,
  augmentMessages,
  setRequestAttributes,
  setResponseAttributes,
} from '../../adapters/base-llm.js';
import { PROMPT_TRUNCATION_LIMIT, OUTPUT_TRUNCATION_LIMIT } from '../../contracts/adapter-interfaces.js';

// ---------------------------------------------------------------------------
// OTel test harness
// ---------------------------------------------------------------------------

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

function setupOtel() {
  exporter = new InMemorySpanExporter();
  const contextManager = new AsyncLocalStorageContextManager();
  context.setGlobalContextManager(contextManager);
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
}

async function teardownOtel() {
  await provider.shutdown();
  context.disable();
  trace.disable();
}

// ---------------------------------------------------------------------------
// Mock clients
// ---------------------------------------------------------------------------

function createMockOpenAIClient() {
  return {
    chat: {
      completions: {
        create: async (params: any) => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          model: params.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello! How can I help?' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18,
          },
        }),
      },
    },
  };
}

function createMockAnthropicClient() {
  return {
    messages: {
      create: async (params: any) => ({
        id: 'msg_123',
        type: 'message',
        model: params.model,
        content: [{ type: 'text', text: 'Hello from Claude!' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 12,
          output_tokens: 6,
        },
      }),
    },
  };
}

function createMockGeminiModel() {
  return {
    generateContent: async (_request: any) => ({
      response: {
        text: () => 'Hello from Gemini!',
        usageMetadata: {
          promptTokenCount: 8,
          candidatesTokenCount: 5,
        },
        candidates: [{ finishReason: 'STOP' }],
      },
    }),
  };
}

function createMockOllamaClient() {
  return {
    chat: async (params: any) => ({
      model: params.model,
      message: { role: 'assistant', content: 'Hello from Ollama!' },
      done: true,
      prompt_eval_count: 15,
      eval_count: 7,
    }),
  };
}

function createMockLiteLLMClient() {
  return {
    completion: async (params: any) => ({
      model: params.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello from LiteLLM!' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 6,
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests: Base utilities
// ---------------------------------------------------------------------------

describe('Base LLM utilities', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('withLLMSpan creates a span with correct name and attributes', async () => {
    await withLLMSpan(
      'test-provider',
      { model: 'test-model' },
      async () => 'result',
      () => ({
        model: 'test-model',
        inputTokens: 10,
        outputTokens: 5,
        finishReasons: ['stop'],
        output: 'result',
      }),
    );

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].name).toBe('klira.llm.test-provider');
    expect(spans[0].attributes['gen_ai.system']).toBe('test-provider');
    expect(spans[0].attributes['gen_ai.request.model']).toBe('test-model');
    expect(spans[0].attributes['gen_ai.response.model']).toBe('test-model');
    expect(spans[0].attributes['gen_ai.usage.input_tokens']).toBe(10);
    expect(spans[0].attributes['gen_ai.usage.output_tokens']).toBe(5);
    expect(spans[0].attributes['gen_ai.response.finish_reasons']).toEqual(['stop']);
    expect(spans[0].attributes['klira.entity_type']).toBe('llm');
  });

  it('withLLMSpan records errors', async () => {
    await expect(
      withLLMSpan(
        'test-provider',
        { model: 'test-model' },
        async () => { throw new Error('API failed'); },
      ),
    ).rejects.toThrow('API failed');

    const spans = exporter.getFinishedSpans();
    expect(spans[0].status.code).toBe(2); // SpanStatusCode.ERROR
  });

  it('augmentMessages prepends system message with guidelines', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
    ];
    const result = augmentMessages(messages, ['Be safe', 'Be kind']);
    expect(result.length).toBe(2);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('1. Be safe');
    expect(result[0].content).toContain('2. Be kind');
  });

  it('augmentMessages appends to existing system message', () => {
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ];
    const result = augmentMessages(messages, ['Be safe']);
    expect(result.length).toBe(2);
    expect(result[0].content).toContain('You are helpful.');
    expect(result[0].content).toContain('1. Be safe');
  });

  it('augmentMessages returns original when no guidelines', () => {
    const messages = [{ role: 'user', content: 'Hello' }];
    const result = augmentMessages(messages, []);
    expect(result).toBe(messages);
  });

  it('truncates gen_ai.prompt to 10k chars (silent — Python parity)', async () => {
    const longPrompt = 'a'.repeat(PROMPT_TRUNCATION_LIMIT + 1000);
    await withLLMSpan(
      'test',
      { model: 'test', messages: [{ content: longPrompt }] },
      async () => 'ok',
    );

    const spans = exporter.getFinishedSpans();
    const prompt = spans[0].attributes['gen_ai.prompt'] as string;
    expect(prompt.length).toBe(PROMPT_TRUNCATION_LIMIT);
    expect(prompt).not.toContain('[truncated]');
  });

  it('truncates output to 5k chars (silent — Python parity)', async () => {
    const longOutput = 'b'.repeat(OUTPUT_TRUNCATION_LIMIT + 1000);
    await withLLMSpan(
      'test',
      { model: 'test' },
      async () => longOutput,
      () => ({ output: longOutput }),
    );

    const spans = exporter.getFinishedSpans();
    const output = spans[0].attributes['klira.output'] as string;
    expect(output.length).toBe(OUTPUT_TRUNCATION_LIMIT);
    expect(output).not.toContain('[truncated]');
  });
});

// ---------------------------------------------------------------------------
// Tests: OpenAI adapter
// ---------------------------------------------------------------------------

describe('OpenAI adapter', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('creates klira.llm.openai span', async () => {
    const client = createMockOpenAIClient();
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.model).toBe('gpt-4o');
    expect(result.choices[0].message.content).toBe('Hello! How can I help?');

    const spans = exporter.getFinishedSpans();
    const llmSpan = spans.find((s) => s.name === 'klira.llm.openai.completion');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.attributes['gen_ai.system']).toBe('openai');
    expect(llmSpan!.attributes['gen_ai.request.model']).toBe('gpt-4o');
    expect(llmSpan!.attributes['gen_ai.response.model']).toBe('gpt-4o');
    expect(llmSpan!.attributes['gen_ai.usage.input_tokens']).toBe(10);
    expect(llmSpan!.attributes['gen_ai.usage.output_tokens']).toBe(8);
    expect(llmSpan!.attributes['gen_ai.response.finish_reasons']).toEqual(['stop']);
  });

  it('passes through non-chat properties', () => {
    const client = { ...createMockOpenAIClient(), models: { list: () => [] } } as any;
    const adapter = createOpenAIAdapter(client);
    expect(adapter.models.list()).toEqual([]);
  });

  it('augments messages with guidelines', async () => {
    let capturedMessages: any = null;
    const client = {
      chat: {
        completions: {
          create: async (params: any) => {
            capturedMessages = params.messages;
            return createMockOpenAIClient().chat.completions.create(params);
          },
        },
      },
    };

    const adapter = createOpenAIAdapter(client, { guidelines: ['Be safe'] });
    await adapter.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(capturedMessages.length).toBe(2);
    expect(capturedMessages[0].role).toBe('system');
    expect(capturedMessages[0].content).toContain('Be safe');
  });
});

// ---------------------------------------------------------------------------
// Tests: Anthropic adapter
// ---------------------------------------------------------------------------

describe('Anthropic adapter', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('creates klira.llm.anthropic span', async () => {
    const client = createMockAnthropicClient();
    const adapter = createAnthropicAdapter(client);

    const result = await adapter.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.content[0].text).toBe('Hello from Claude!');

    const spans = exporter.getFinishedSpans();
    const llmSpan = spans.find((s) => s.name === 'klira.llm.anthropic');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.attributes['gen_ai.system']).toBe('anthropic');
    expect(llmSpan!.attributes['gen_ai.request.model']).toBe('claude-sonnet-4-20250514');
    expect(llmSpan!.attributes['gen_ai.response.model']).toBe('claude-sonnet-4-20250514');
    expect(llmSpan!.attributes['gen_ai.usage.input_tokens']).toBe(12);
    expect(llmSpan!.attributes['gen_ai.usage.output_tokens']).toBe(6);
    expect(llmSpan!.attributes['gen_ai.response.finish_reasons']).toEqual(['end_turn']);
    expect(llmSpan!.attributes['klira.output']).toBe('Hello from Claude!');
  });
});

// ---------------------------------------------------------------------------
// Tests: Gemini adapter
// ---------------------------------------------------------------------------

describe('Gemini adapter', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('creates klira.llm.gemini span', async () => {
    const model = createMockGeminiModel();
    const adapter = createGeminiAdapter(model, { modelName: 'gemini-pro' });

    const result = await adapter.generateContent('Hello');
    expect(result.response.text()).toBe('Hello from Gemini!');

    const spans = exporter.getFinishedSpans();
    const llmSpan = spans.find((s) => s.name === 'klira.llm.gemini');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.attributes['gen_ai.system']).toBe('gemini');
    expect(llmSpan!.attributes['gen_ai.request.model']).toBe('gemini-pro');
    expect(llmSpan!.attributes['gen_ai.usage.input_tokens']).toBe(8);
    expect(llmSpan!.attributes['gen_ai.usage.output_tokens']).toBe(5);
    expect(llmSpan!.attributes['gen_ai.response.finish_reasons']).toEqual(['STOP']);
  });
});

// ---------------------------------------------------------------------------
// Tests: Ollama adapter
// ---------------------------------------------------------------------------

describe('Ollama adapter', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('creates klira.llm.ollama span', async () => {
    const client = createMockOllamaClient();
    const adapter = createOllamaAdapter(client);

    const result = await adapter.chat({
      model: 'llama3',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.message.content).toBe('Hello from Ollama!');

    const spans = exporter.getFinishedSpans();
    const llmSpan = spans.find((s) => s.name === 'klira.llm.ollama');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.attributes['gen_ai.system']).toBe('ollama');
    expect(llmSpan!.attributes['gen_ai.request.model']).toBe('llama3');
    expect(llmSpan!.attributes['gen_ai.usage.input_tokens']).toBe(15);
    expect(llmSpan!.attributes['gen_ai.usage.output_tokens']).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Tests: LiteLLM adapter
// ---------------------------------------------------------------------------

describe('LiteLLM adapter', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('creates klira.llm.litellm span', async () => {
    const client = createMockLiteLLMClient();
    const adapter = createLiteLLMAdapter(client);

    const result = await adapter.completion({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.choices[0].message.content).toBe('Hello from LiteLLM!');

    const spans = exporter.getFinishedSpans();
    const llmSpan = spans.find((s) => s.name === 'klira.llm.litellm');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.attributes['gen_ai.system']).toBe('litellm');
    expect(llmSpan!.attributes['gen_ai.request.model']).toBe('gpt-4o');
    expect(llmSpan!.attributes['gen_ai.usage.input_tokens']).toBe(11);
    expect(llmSpan!.attributes['gen_ai.usage.output_tokens']).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Tests: validateSpan compliance
// ---------------------------------------------------------------------------

describe('Adapter spans pass contract validation', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('all adapter spans have required gen_ai.* attributes', async () => {
    // Run all adapters
    const openai = createOpenAIAdapter(createMockOpenAIClient());
    await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
    });

    const anthropic = createAnthropicAdapter(createMockAnthropicClient());
    await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'test' }],
    });

    const gemini = createGeminiAdapter(createMockGeminiModel(), { modelName: 'gemini-pro' });
    await gemini.generateContent('test');

    const ollama = createOllamaAdapter(createMockOllamaClient());
    await ollama.chat({ model: 'llama3', messages: [{ role: 'user', content: 'test' }] });

    const litellm = createLiteLLMAdapter(createMockLiteLLMClient());
    await litellm.completion({ model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] });

    const spans = exporter.getFinishedSpans();
    const llmSpans = spans.filter((s) => s.name.startsWith('klira.llm.'));
    expect(llmSpans.length).toBe(5);

    for (const span of llmSpans) {
      expect(span.attributes['gen_ai.system']).toBeDefined();
      expect(span.attributes['gen_ai.request.model']).toBeDefined();
      expect(span.attributes['gen_ai.response.model']).toBeDefined();
      expect(span.attributes['gen_ai.usage.input_tokens']).toBeDefined();
      expect(span.attributes['gen_ai.usage.output_tokens']).toBeDefined();
      expect(span.attributes['klira.entity_type']).toBe('llm');
    }
  });
});
