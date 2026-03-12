import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { workflow, agent, task, tool, userMessage } from '../../wrappers/index.js';

describe('Wrappers v2', () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    const contextManager = new AsyncLocalStorageContextManager();
    context.setGlobalContextManager(contextManager);
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

  describe('workflow()', () => {
    it('creates a klira.workflow.{name} span', async () => {
      const fn = workflow('test-flow', async (input: string) => input.toUpperCase());
      const result = await fn('hello');

      expect(result).toBe('HELLO');
      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe('klira.workflow.test-flow');
      expect(spans[0].attributes['klira.entity_type']).toBe('workflow');
      expect(spans[0].attributes['klira.entity_name']).toBe('test-flow');
    });

    it('captures output truncated to 500 chars', async () => {
      const longOutput = 'x'.repeat(1000);
      const fn = workflow('long-output', async () => longOutput);
      await fn();

      const spans = exporter.getFinishedSpans();
      const output = spans[0].attributes['klira.output'] as string;
      expect(output.length).toBeLessThanOrEqual(501); // 500 + '…'
      expect(output.endsWith('…')).toBe(true);
    });

    it('propagates errors', async () => {
      const fn = workflow('error-flow', async () => {
        throw new Error('test error');
      });

      await expect(fn()).rejects.toThrow('test error');
      const spans = exporter.getFinishedSpans();
      expect(spans[0].status.code).toBe(2); // ERROR
    });

    it('preserves return types', async () => {
      const fn = workflow('typed', async (a: number, b: number) => a + b);
      const result = await fn(3, 4);
      expect(result).toBe(7);
    });
  });

  describe('agent()', () => {
    it('creates a klira.agent.{name} span', async () => {
      const fn = agent('my-agent', async () => 'agent result');
      const result = await fn();

      expect(result).toBe('agent result');
      const spans = exporter.getFinishedSpans();
      expect(spans[0].name).toBe('klira.agent.my-agent');
      expect(spans[0].attributes['klira.entity_type']).toBe('agent');
    });
  });

  describe('task()', () => {
    it('creates a klira.task.{name} span', async () => {
      const fn = task('process', async () => 42);
      const result = await fn();

      expect(result).toBe(42);
      const spans = exporter.getFinishedSpans();
      expect(spans[0].name).toBe('klira.task.process');
      expect(spans[0].attributes['klira.entity_type']).toBe('task');
    });
  });

  describe('tool()', () => {
    it('creates a klira.tool.{name} span', async () => {
      const fn = tool('search', async (query: string) => `results for ${query}`);
      const result = await fn('test');

      expect(result).toBe('results for test');
      const spans = exporter.getFinishedSpans();
      expect(spans[0].name).toBe('klira.tool.search');
      expect(spans[0].attributes['klira.entity_type']).toBe('tool');
    });

    it('sets FHIR resource type when provided', async () => {
      const fn = tool('patient-lookup', async () => 'patient data', {
        fhirResourceType: 'Patient',
      });
      await fn();

      const spans = exporter.getFinishedSpans();
      expect(spans[0].attributes['klira.fhir.resource_type']).toBe('Patient');
    });
  });

  describe('userMessage()', () => {
    it('creates klira.user.message root span', async () => {
      const fn = userMessage(
        { userId: 'user-1', conversationId: 'conv-1', messageId: 'msg-1' },
        async () => 'response',
      );
      const result = await fn();

      expect(result).toBe('response');
      const spans = exporter.getFinishedSpans();
      expect(spans[0].name).toBe('klira.user.message');
      expect(spans[0].attributes['klira.entity_type']).toBe('user_message');
      expect(spans[0].attributes['klira.user_id']).toBe('user-1');
      expect(spans[0].attributes['klira.conversation_id']).toBe('conv-1');
      expect(spans[0].attributes['klira.message_id']).toBe('msg-1');
    });
  });

  describe('nesting — parent-child relationships', () => {
    it('workflow > agent > task > tool creates correct hierarchy', async () => {
      const flow = workflow('main', async () => {
        return agent('my-agent', async () => {
          return task('process', async () => {
            return tool('search', async () => 'found')();
          })();
        })();
      });

      const result = await flow();
      expect(result).toBe('found');

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(4);

      const toolSpan = spans.find(s => s.name === 'klira.tool.search')!;
      const taskSpan = spans.find(s => s.name === 'klira.task.process')!;
      const agentSpan = spans.find(s => s.name === 'klira.agent.my-agent')!;
      const workflowSpan = spans.find(s => s.name === 'klira.workflow.main')!;

      expect(toolSpan.parentSpanContext?.spanId).toBe(taskSpan.spanContext().spanId);
      expect(taskSpan.parentSpanContext?.spanId).toBe(agentSpan.spanContext().spanId);
      expect(agentSpan.parentSpanContext?.spanId).toBe(workflowSpan.spanContext().spanId);
    });

    it('userMessage > workflow creates correct hierarchy', async () => {
      const handler = userMessage(
        { userId: 'u1', conversationId: 'c1', messageId: 'm1' },
        async () => {
          return workflow('inner', async () => 'done')();
        },
      );

      await handler();
      const spans = exporter.getFinishedSpans();
      const msgSpan = spans.find(s => s.name === 'klira.user.message')!;
      const wfSpan = spans.find(s => s.name === 'klira.workflow.inner')!;

      expect(wfSpan.parentSpanContext?.spanId).toBe(msgSpan.spanContext().spanId);
    });
  });

  describe('output capture', () => {
    it('captures string output', async () => {
      const fn = workflow('str', async () => 'hello world');
      await fn();
      const spans = exporter.getFinishedSpans();
      expect(spans[0].attributes['klira.output']).toBe('hello world');
    });

    it('captures object output as JSON', async () => {
      const fn = workflow('obj', async () => ({ key: 'value' }));
      await fn();
      const spans = exporter.getFinishedSpans();
      expect(spans[0].attributes['klira.output']).toBe('{"key":"value"}');
    });

    it('does not capture undefined/null output', async () => {
      const fn = workflow('void', async () => undefined);
      await fn();
      const spans = exporter.getFinishedSpans();
      expect(spans[0].attributes['klira.output']).toBeUndefined();
    });
  });
});
