/**
 * End-to-end trace validation — runs a complete workflow and validates
 * the full trace hierarchy against contracts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { workflow, agent, task, tool, userMessage } from '../../wrappers/index.js';
import { createOpenAIAdapter } from '../../adapters/openai/index.js';
import { GuardrailsEngine } from '../../guardrails/engine.js';
import { validateSpan, SPAN_DEFINITIONS } from '../../contracts/trace-schema.js';

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
// Mock OpenAI client
// ---------------------------------------------------------------------------

function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: async (params: any) => ({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          model: params.model,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Mock response' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('End-to-end trace validation', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('creates correct trace hierarchy: userMessage > workflow > agent > task > tool + LLM', async () => {
    const openai = createOpenAIAdapter(createMockOpenAI());

    const myWorkflow = workflow('my-workflow', async () => {
      return await agent('my-agent', async () => {
        return await task('process', async () => {
          const searchResult = await tool('search', async () => 'found it')();

          const llmResult = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: 'Summarize' }],
          });

          return { searchResult, llmResult: llmResult.choices[0].message.content };
        })();
      })();
    });

    const wrappedWithUserMessage = userMessage(
      { userId: 'user-1', conversationId: 'conv-1', messageId: 'msg-1' },
      myWorkflow,
    );

    const result = await wrappedWithUserMessage();

    expect(result).toEqual({
      searchResult: 'found it',
      llmResult: 'Mock response',
    });

    // Validate spans
    const spans = exporter.getFinishedSpans();
    const spanNames = spans.map((s) => s.name);

    // All expected span types should be present
    expect(spanNames).toContain('klira.user.message');
    expect(spanNames).toContain('klira.workflow.my-workflow');
    expect(spanNames).toContain('klira.agent.my-agent');
    expect(spanNames).toContain('klira.task.process');
    expect(spanNames).toContain('klira.tool.search');
    expect(spanNames).toContain('klira.llm.openai');

    // Validate user message span attributes
    const userSpan = spans.find((s) => s.name === 'klira.user.message');
    expect(userSpan).toBeDefined();
    expect(userSpan!.attributes['klira.user_id']).toBe('user-1');
    expect(userSpan!.attributes['klira.conversation_id']).toBe('conv-1');
    expect(userSpan!.attributes['klira.message_id']).toBe('msg-1');

    // Validate LLM span attributes
    const llmSpan = spans.find((s) => s.name === 'klira.llm.openai');
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.attributes['gen_ai.system']).toBe('openai');
    expect(llmSpan!.attributes['gen_ai.request.model']).toBe('gpt-4o');
    expect(llmSpan!.attributes['gen_ai.response.model']).toBe('gpt-4o');
    expect(llmSpan!.attributes['gen_ai.usage.input_tokens']).toBe(10);
    expect(llmSpan!.attributes['gen_ai.usage.output_tokens']).toBe(5);

    // Validate parent-child relationships
    const userSpanId = userSpan!.spanContext().spanId;
    const workflowSpan = spans.find((s) => s.name === 'klira.workflow.my-workflow');
    expect(workflowSpan!.parentSpanContext?.spanId).toBe(userSpanId);

    const agentSpan = spans.find((s) => s.name === 'klira.agent.my-agent');
    expect(agentSpan!.parentSpanContext?.spanId).toBe(workflowSpan!.spanContext().spanId);

    const taskSpan = spans.find((s) => s.name === 'klira.task.process');
    expect(taskSpan!.parentSpanContext?.spanId).toBe(agentSpan!.spanContext().spanId);
  });

  it('guardrails integration: init > evaluate > audit', async () => {
    const engine = new GuardrailsEngine();
    await engine.initialize();

    // Evaluate input
    const inputResult = await engine.evaluateInput('Hello, how are you?');
    expect(inputResult.allowed).toBe(true);

    // Evaluate output
    const outputResult = await engine.evaluateOutput('I am fine, thank you!');
    expect(outputResult.allowed).toBe(true);

    // Validate guardrails spans
    const spans = exporter.getFinishedSpans();
    const inputSpan = spans.find((s) => s.name === 'klira.guardrails.input');
    expect(inputSpan).toBeDefined();
    expect(inputSpan!.attributes['klira.guardrails.decision']).toBe('allowed');

    const outputSpan = spans.find((s) => s.name === 'klira.guardrails.output');
    expect(outputSpan).toBeDefined();

    // Fast rules span should exist as child
    const fastRulesSpans = spans.filter((s) => s.name === 'klira.guardrails.fast_rules');
    expect(fastRulesSpans.length).toBeGreaterThanOrEqual(2);

    // Route decision spans
    const routeSpans = spans.filter((s) => s.name === 'klira.guardrails.route_decision');
    expect(routeSpans.length).toBeGreaterThanOrEqual(2);
  });

  it('all wrapper spans have klira.entity_type', () => {
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('klira.user.message', (span) => {
      span.setAttribute('klira.entity_type', 'user_message');
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    expect(spans[0].attributes['klira.entity_type']).toBe('user_message');
  });

  it('full workflow completes under 100ms', async () => {
    const openai = createOpenAIAdapter(createMockOpenAI());

    const start = performance.now();

    const myWorkflow = workflow('perf-test', async () => {
      return await agent('agent', async () => {
        return await task('task', async () => {
          return await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: 'Hello' }],
          });
        })();
      })();
    });

    await myWorkflow();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
