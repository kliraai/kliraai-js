/**
 * PROD-764 Phase 2 — OTel pipeline parity tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import type { ExportResult } from '@opentelemetry/core';

import { NoneAttributeFilterProcessor } from '../../observability/none-attribute-filter-processor.js';
import { KliraFilteringExporter } from '../../observability/filtering-exporter.js';
import { getTelemetryEndpoint } from '../../observability/exporter.js';

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

function setupOtel(processors: ReturnType<typeof Array.prototype.concat> = []) {
  exporter = new InMemorySpanExporter();
  const contextManager = new AsyncLocalStorageContextManager();
  context.setGlobalContextManager(contextManager);
  provider = new BasicTracerProvider({
    spanProcessors: [...processors, new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
}

async function teardownOtel() {
  await provider.shutdown();
  context.disable();
  trace.disable();
}

describe('NoneAttributeFilterProcessor', () => {
  beforeEach(() => setupOtel([new NoneAttributeFilterProcessor()]));
  afterEach(teardownOtel);

  it('strips null and undefined attributes before export', () => {
    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('klira.workflow.x');
    span.setAttribute('keep', 'value');
    span.setAttribute('drop_null', null as unknown as string);
    span.setAttribute('drop_undef', undefined as unknown as string);
    span.end();

    const got = exporter.getFinishedSpans()[0];
    expect(got.attributes['keep']).toBe('value');
    expect('drop_null' in got.attributes).toBe(false);
    expect('drop_undef' in got.attributes).toBe(false);
  });

  // PROD-764 — Python parity removed duration_ms / guardrails.latency_ms
  // injection. Span duration is recoverable from start/end times on the wire.
  it('does not inject klira.duration_ms', () => {
    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('klira.workflow.x');
    span.end();

    const got = exporter.getFinishedSpans()[0];
    expect('klira.duration_ms' in got.attributes).toBe(false);
  });

  it('does not inject klira.guardrails.latency_ms on guardrails spans', () => {
    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('klira.guardrails.input');
    span.end();

    const got = exporter.getFinishedSpans()[0];
    expect('klira.guardrails.latency_ms' in got.attributes).toBe(false);
  });
});

class CountingExporter implements SpanExporter {
  public received: ReadableSpan[] = [];
  export(spans: ReadableSpan[], cb: (r: ExportResult) => void): void {
    this.received.push(...spans);
    cb({ code: 0 });
  }
  shutdown(): Promise<void> { return Promise.resolve(); }
  forceFlush(): Promise<void> { return Promise.resolve(); }
}

describe('KliraFilteringExporter', () => {
  it('drops spans whose name does not start with klira.', async () => {
    const downstream = new CountingExporter();
    const filtering = new KliraFilteringExporter(downstream);

    const fakeKlira = { name: 'klira.workflow.x' } as unknown as ReadableSpan;
    const fakeOther = { name: 'http.client.request' } as unknown as ReadableSpan;

    await new Promise<void>((resolve) => {
      filtering.export([fakeKlira, fakeOther], () => resolve());
    });

    expect(downstream.received).toHaveLength(1);
    expect(downstream.received[0].name).toBe('klira.workflow.x');
  });

  it('short-circuits when no klira spans are present', async () => {
    const downstream = new CountingExporter();
    const filtering = new KliraFilteringExporter(downstream);

    const fakeOther = { name: 'http.client.request' } as unknown as ReadableSpan;

    let result: ExportResult | undefined;
    await new Promise<void>((resolve) => {
      filtering.export([fakeOther], (r) => { result = r; resolve(); });
    });

    expect(downstream.received).toHaveLength(0);
    expect(result?.code).toBe(0);
  });
});

describe('getTelemetryEndpoint', () => {
  it('returns /v1/traces by default', () => {
    expect(getTelemetryEndpoint({ endpoint: 'https://api.getklira.com' })).toBe(
      'https://api.getklira.com/v1/traces',
    );
  });

  it('switches to /evals/v1/traces when evalsRun is set', () => {
    expect(
      getTelemetryEndpoint({ endpoint: 'https://api.getklira.com', evalsRun: 'run-1' }),
    ).toBe('https://api.getklira.com/evals/v1/traces');
  });

  it('strips trailing slashes from the base URL', () => {
    expect(getTelemetryEndpoint({ endpoint: 'https://api.getklira.com//' })).toBe(
      'https://api.getklira.com/v1/traces',
    );
  });
});
