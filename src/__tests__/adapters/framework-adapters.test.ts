import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { createVercelAIAdapter } from '../../adapters/vercel-ai/index.js';
import { createLangChainAdapter } from '../../adapters/langchain/index.js';
import { instrumentLLMCall, createCustomAdapter } from '../../adapters/custom/index.js';

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
// Tests: Vercel AI adapter
// ---------------------------------------------------------------------------

describe('Vercel AI adapter', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('creates span for generateText', async () => {
    const adapter = createVercelAIAdapter();
    const mockGenerateText = async (params: any) => ({
      text: 'Hello!',
      usage: { promptTokens: 5, completionTokens: 3 },
      finishReason: 'stop',
    });

    const result = await adapter.generateText(mockGenerateText, {
      model: { provider: 'openai', modelId: 'gpt-4o' },
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.text).toBe('Hello!');

    const spans = exporter.getFinishedSpans();
    const llmSpan = spans.find((s) => s.name === 'klira.llm.openai');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.attributes['gen_ai.request.model']).toBe('gpt-4o');
    expect(llmSpan!.attributes['klira.framework']).toBe('vercel-ai');
    expect(llmSpan!.attributes['klira.framework.operation']).toBe('generateText');
    expect(llmSpan!.attributes['gen_ai.usage.input_tokens']).toBe(5);
    expect(llmSpan!.attributes['gen_ai.usage.output_tokens']).toBe(3);
  });

  it('suppresses experimental_telemetry', async () => {
    const adapter = createVercelAIAdapter();
    let receivedParams: any = null;

    const mockFn = async (params: any) => {
      receivedParams = params;
      return { text: 'ok' };
    };

    await adapter.generateText(mockFn, {
      model: { provider: 'openai', modelId: 'gpt-4o' },
      experimental_telemetry: { enabled: true },
      messages: [{ role: 'user', content: 'Hi' }],
    });

    // experimental_telemetry should be removed
    expect(receivedParams.experimental_telemetry).toBeUndefined();
  });

  it('verifies suppression returns true', () => {
    const adapter = createVercelAIAdapter();
    expect(adapter.verifySuppression()).toBe(true);
  });

  it('augments with guidelines', async () => {
    const adapter = createVercelAIAdapter({ guidelines: ['Be safe'] });
    let receivedParams: any = null;

    const mockFn = async (params: any) => {
      receivedParams = params;
      return { text: 'ok' };
    };

    await adapter.generateText(mockFn, {
      model: { provider: 'openai', modelId: 'gpt-4o' },
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(receivedParams.messages.length).toBe(2);
    expect(receivedParams.messages[0].content).toContain('Be safe');
  });
});

// ---------------------------------------------------------------------------
// Tests: LangChain adapter
// ---------------------------------------------------------------------------

describe('LangChain adapter', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('wraps model invoke with klira span', async () => {
    const adapter = createLangChainAdapter({ suppressNativeTracing: false });
    const mockModel = {
      invoke: async (input: any) => ({
        content: 'Hello from LangChain!',
        response_metadata: {
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          finish_reason: 'stop',
        },
      }),
    };

    const wrapped = adapter.wrapModel(mockModel, {
      provider: 'openai',
      modelName: 'gpt-4o',
    });

    const result = await wrapped.invoke('Hello');
    expect(result.content).toBe('Hello from LangChain!');

    const spans = exporter.getFinishedSpans();
    const llmSpan = spans.find((s) => s.name === 'klira.llm.openai');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.attributes['gen_ai.request.model']).toBe('gpt-4o');
    expect(llmSpan!.attributes['klira.framework']).toBe('langchain');
    expect(llmSpan!.attributes['gen_ai.usage.input_tokens']).toBe(10);
    expect(llmSpan!.attributes['gen_ai.usage.output_tokens']).toBe(5);
  });

  it('suppresses native LangChain tracing', () => {
    const adapter = createLangChainAdapter();
    adapter.patchFramework();
    expect(adapter.verifySuppression()).toBe(true);
    expect(process.env.LANGCHAIN_TRACING_V2).toBe('false');
  });

  it('preserves non-invoke properties', () => {
    const adapter = createLangChainAdapter({ suppressNativeTracing: false });
    const mockModel = {
      invoke: async () => ({ content: 'test' }),
      modelName: 'gpt-4o',
      metadata: { version: '1' },
    };

    const wrapped = adapter.wrapModel(mockModel);
    expect(wrapped.modelName).toBe('gpt-4o');
    expect(wrapped.metadata).toEqual({ version: '1' });
  });
});

// ---------------------------------------------------------------------------
// Tests: Custom adapter
// ---------------------------------------------------------------------------

describe('Custom adapter', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('instrumentLLMCall creates a span', async () => {
    const result = await instrumentLLMCall(
      'my-llm',
      { model: 'my-model' },
      async () => ({ text: 'Hello', tokens: 5 }),
      (response) => ({
        model: 'my-model',
        outputTokens: response.tokens,
        output: response.text,
      }),
    );

    expect(result.text).toBe('Hello');

    const spans = exporter.getFinishedSpans();
    const llmSpan = spans.find((s) => s.name === 'klira.llm.my-llm');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.attributes['gen_ai.system']).toBe('my-llm');
    expect(llmSpan!.attributes['gen_ai.request.model']).toBe('my-model');
    expect(llmSpan!.attributes['gen_ai.usage.output_tokens']).toBe(5);
    expect(llmSpan!.attributes['klira.output']).toBe('Hello');
  });

  it('createCustomAdapter provides reusable adapter', async () => {
    const adapter = createCustomAdapter<{ text: string; tokens: number }>('my-llm', {
      extractResult: (resp) => ({
        model: 'my-model',
        outputTokens: resp.tokens,
        output: resp.text,
      }),
    });

    const result = await adapter.call(
      { model: 'my-model' },
      async () => ({ text: 'Result', tokens: 10 }),
    );

    expect(result.text).toBe('Result');

    const spans = exporter.getFinishedSpans();
    expect(spans.find((s) => s.name === 'klira.llm.my-llm')).toBeDefined();
  });

  it('createCustomAdapter augments messages with guidelines', async () => {
    let capturedMessages: any = null;

    const adapter = createCustomAdapter('test', {
      guidelines: ['Be careful'],
    });

    await adapter.call(
      {
        model: 'test',
        messages: [{ role: 'user', content: 'Hello' }],
      },
      async () => 'ok',
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'klira.llm.test');
    expect(span).toBeDefined();
    // The augmentation happens in the messages passed to the span
    const input = span!.attributes['klira.input'] as string;
    expect(input).toContain('Be careful');
  });
});
