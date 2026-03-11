import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { workflow, agent, task, tool, userMessage } from '../../wrappers/index.js';
import { validateSpan } from '../../contracts/trace-schema.js';

describe('Wrapper contract validation', () => {
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

  it('workflow span validates against trace schema', async () => {
    await workflow('test', async () => 'ok')();
    const span = exporter.getFinishedSpans()[0];
    const errors = validateSpan(
      span.name,
      span.attributes as Record<string, unknown>,
      undefined,
    );
    expect(errors).toEqual([]);
  });

  it('agent span validates against trace schema', async () => {
    await workflow('parent', async () => {
      return agent('child', async () => 'ok')();
    })();

    const agentSpan = exporter.getFinishedSpans().find(s => s.name.startsWith('klira.agent.'))!;
    const parentSpan = exporter.getFinishedSpans().find(s => s.name.startsWith('klira.workflow.'))!;
    const errors = validateSpan(
      agentSpan.name,
      agentSpan.attributes as Record<string, unknown>,
      parentSpan.name,
    );
    expect(errors).toEqual([]);
  });

  it('task span validates against trace schema', async () => {
    await workflow('parent', async () => {
      return task('child', async () => 'ok')();
    })();

    const taskSpan = exporter.getFinishedSpans().find(s => s.name.startsWith('klira.task.'))!;
    const errors = validateSpan(
      taskSpan.name,
      taskSpan.attributes as Record<string, unknown>,
      'klira.workflow.parent',
    );
    expect(errors).toEqual([]);
  });

  it('tool span validates against trace schema', async () => {
    await workflow('parent', async () => {
      return tool('child', async () => 'ok')();
    })();

    const toolSpan = exporter.getFinishedSpans().find(s => s.name.startsWith('klira.tool.'))!;
    const errors = validateSpan(
      toolSpan.name,
      toolSpan.attributes as Record<string, unknown>,
      'klira.workflow.parent',
    );
    expect(errors).toEqual([]);
  });

  it('userMessage span validates against trace schema', async () => {
    await userMessage(
      { userId: 'u1', conversationId: 'c1', messageId: 'm1' },
      async () => 'ok',
    )();

    const span = exporter.getFinishedSpans()[0];
    const errors = validateSpan(
      span.name,
      span.attributes as Record<string, unknown>,
      null,
    );
    expect(errors).toEqual([]);
  });

  it('full hierarchy validates against trace schema', async () => {
    await userMessage(
      { userId: 'u1', conversationId: 'c1', messageId: 'm1' },
      async () => {
        return workflow('flow', async () => {
          return agent('my-agent', async () => {
            return task('process', async () => {
              return tool('search', async () => 'result')();
            })();
          })();
        })();
      },
    )();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(5);

    for (const span of spans) {
      const parentSpanId = (span as any).parentSpanContext?.spanId;
      const parentSpan = parentSpanId
        ? spans.find(s => s.spanContext().spanId === parentSpanId)
        : undefined;
      const errors = validateSpan(
        span.name,
        span.attributes as Record<string, unknown>,
        parentSpan?.name ?? null,
      );
      expect(errors).toEqual([]);
    }
  });
});
