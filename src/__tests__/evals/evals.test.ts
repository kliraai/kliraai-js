import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { evaluate } from '../../evals/evaluate.js';
import { createLocalDataset } from '../../evals/datasets.js';
import type { KliraDataset } from '../../evals/types.js';

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
// Tests
// ---------------------------------------------------------------------------

describe('evaluate()', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  const testDataset: KliraDataset = {
    id: 'test-ds',
    name: 'Test Dataset',
    testCases: [
      { input: 'Hello', expectedOutput: 'Hi there!' },
      { input: 'Goodbye', expectedOutput: 'See you!' },
      { input: 'Error case', expectedOutput: 'Should fail' },
    ],
  };

  it('runs all test cases and returns summary', async () => {
    const summary = await evaluate(
      async (input) => {
        if (input === 'Hello') return 'Hi there!';
        if (input === 'Goodbye') return 'See you!';
        return 'unknown';
      },
      testDataset,
    );

    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.errorCount).toBe(0);
    expect(summary.avgDurationMs).toBeGreaterThan(0);
    expect(summary.results.length).toBe(3);
  });

  it('creates klira.evals.test_case spans', async () => {
    await evaluate(
      async () => 'result',
      testDataset,
    );

    const spans = exporter.getFinishedSpans();
    const evalSpans = spans.filter((s) => s.name === 'klira.evals.test_case');
    expect(evalSpans.length).toBe(3);

    for (const span of evalSpans) {
      expect(span.attributes['klira.entity_type']).toBe('eval');
      expect(span.attributes['klira.evals.dataset_id']).toBe('test-ds');
      expect(span.attributes['klira.evals.dataset_name']).toBe('Test Dataset');
    }
  });

  it('handles errors gracefully', async () => {
    const summary = await evaluate(
      async (input) => {
        if (input === 'Error case') throw new Error('Test error');
        return 'ok';
      },
      testDataset,
    );

    expect(summary.errorCount).toBe(1);
    const errorResult = summary.results.find((r) => r.error);
    expect(errorResult).toBeDefined();
    expect(errorResult!.error).toBe('Test error');
    expect(errorResult!.passed).toBe(false);
  });

  it('uses custom comparator', async () => {
    const summary = await evaluate(
      async () => 'HELLO WORLD',
      {
        id: 'test',
        name: 'test',
        testCases: [
          { input: 'test', expectedOutput: 'hello world' },
        ],
      },
      {
        comparator: (output, expected) =>
          output.toLowerCase() === expected.toLowerCase(),
      },
    );

    expect(summary.passed).toBe(1);
  });

  it('passes when no expectedOutput specified', async () => {
    const summary = await evaluate(
      async () => 'any result',
      {
        id: 'test',
        name: 'test',
        testCases: [
          { input: 'test' }, // no expectedOutput
        ],
      },
    );

    expect(summary.passed).toBe(1);
  });

  it('records tags on spans', async () => {
    await evaluate(
      async () => 'result',
      {
        id: 'test',
        name: 'test',
        testCases: [
          { input: 'test', tags: ['safety', 'regression'] },
        ],
      },
    );

    const spans = exporter.getFinishedSpans();
    expect(spans[0].attributes['klira.evals.tags']).toBe('safety,regression');
  });
});

describe('createLocalDataset()', () => {
  it('creates a dataset from local test cases', () => {
    const dataset = createLocalDataset('My Tests', [
      { input: 'Hello', expectedOutput: 'Hi' },
      { input: 'Bye', expectedOutput: 'Goodbye' },
    ]);

    expect(dataset.name).toBe('My Tests');
    expect(dataset.id).toMatch(/^local-/);
    expect(dataset.testCases.length).toBe(2);
  });
});
