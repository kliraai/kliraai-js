/**
 * PROD-764 Phase 3 — auto-trace + context propagation.
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

describe('workflow auto-trace', () => {
  it('auto-creates a klira.user.message root when invoked outside userMessage', async () => {
    const fn = workflow('flow', async () => 'ok');
    await fn();

    const spans = exporter.getFinishedSpans();
    const root = spans.find((s) => s.name === 'klira.user.message');
    expect(root).toBeDefined();
    expect(root!.attributes['klira.user_id']).toBe('anonymous');
    expect(typeof root!.attributes['klira.conversation_id']).toBe('string');
    expect(typeof root!.attributes['klira.message_id']).toBe('string');
    expect(root!.parentSpanContext).toBeUndefined();
  });

  it('does not auto-create a root when wrapped in userMessage', async () => {
    const handler = userMessage(
      { userId: 'u1', conversationId: 'c1', messageId: 'm1' },
      workflow('inner', async () => 'ok'),
    );
    await handler();

    const spans = exporter.getFinishedSpans();
    const roots = spans.filter((s) => s.name === 'klira.user.message');
    expect(roots).toHaveLength(1);
    expect(roots[0].attributes['klira.user_id']).toBe('u1');
  });
});

describe('runtime attribute propagation', () => {
  it('child wrappers inherit klira.user_id and klira.conversation_id', async () => {
    const handler = userMessage(
      { userId: 'u-42', conversationId: 'c-42', messageId: 'm-42', framework: 'pytest' },
      async () => {
        return workflow('outer', async () => {
          return agent('inner-agent', async () => {
            return task('inner-task', async () => 'done')();
          })();
        })();
      },
    );

    await handler();

    const spans = exporter.getFinishedSpans();
    for (const name of ['klira.workflow.outer', 'klira.agent.inner-agent', 'klira.task.inner-task']) {
      const span = spans.find((s) => s.name === name);
      expect(span, `expected ${name} to exist`).toBeDefined();
      expect(span!.attributes['klira.user_id']).toBe('u-42');
      expect(span!.attributes['klira.conversation_id']).toBe('c-42');
      expect(span!.attributes['klira.framework']).toBe('pytest');
    }
  });

  it('does not propagate the "anonymous" user_id sentinel onto child spans', async () => {
    const fn = workflow('flow', async () => {
      return tool('search', async () => 'ok')();
    });
    await fn();

    const spans = exporter.getFinishedSpans();
    const toolSpan = spans.find((s) => s.name === 'klira.tool.search');
    expect(toolSpan!.attributes['klira.user_id']).toBeUndefined();
  });
});

describe('tool({ fhir })', () => {
  it('accepts the short alias for fhirResourceType', async () => {
    const fn = tool('lookup-patient', async () => 'p', { fhir: 'Patient' });
    await fn();

    const spans = exporter.getFinishedSpans();
    const toolSpan = spans.find((s) => s.name === 'klira.tool.lookup-patient');
    expect(toolSpan!.attributes['klira.fhir.resource_type']).toBe('Patient');
  });

  it('the long-form fhirResourceType still works', async () => {
    const fn = tool('lookup-patient', async () => 'p', { fhirResourceType: 'Observation' });
    await fn();

    const spans = exporter.getFinishedSpans();
    const toolSpan = spans.find((s) => s.name === 'klira.tool.lookup-patient');
    expect(toolSpan!.attributes['klira.fhir.resource_type']).toBe('Observation');
  });
});
