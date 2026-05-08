/**
 * Klira SDK v2 — Telemetry pipeline setup.
 *
 * Processor chain (Python parity):
 *   NoneAttributeFilterProcessor (synchronous) →
 *   BatchSpanProcessor (scheduledDelayMillis=500) →
 *   KliraFilteringExporter → KliraOTLPSpanExporter
 *
 * If a `TracerProvider` is already installed when `initPipeline` runs, we
 * take it over (Python `klira/sdk/__init__.py:120-142`) by replacing the
 * global delegate with our own provider.
 */

import { context, trace, type Tracer } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { KliraConfig } from '../types/index.js';
import { KliraOTLPSpanExporter } from './exporter.js';
import { createKliraBatchProcessor } from './processor.js';
import { NoneAttributeFilterProcessor } from './none-attribute-filter-processor.js';
import { KliraFilteringExporter } from './filtering-exporter.js';
import { PhiAwareExporter } from '../healthcare/phi-exporter.js';
import { PhiMethod } from '../contracts/phi-pipeline.js';
import type { PhiAnonymizationMethod } from '../types/index.js';

let provider: BasicTracerProvider | null = null;
let processor: SpanProcessor | null = null;
let kliraTracer: Tracer | null = null;

function takeoverGlobalTracerProvider(): void {
  // Reset the OTel API's internal provider state. The cast is brittle on
  // purpose — Python does the equivalent reflection. Documented risk: if
  // `@opentelemetry/api` rearranges its globals shape, this needs updating.
  const traceApi = trace as unknown as {
    disable?: () => void;
  };
  traceApi.disable?.();
}

function phiMethodFromConfig(method: PhiAnonymizationMethod): PhiMethod {
  switch (method) {
    case 'mask': return PhiMethod.MASK;
    case 'hash': return PhiMethod.HASH;
    case 'remove': return PhiMethod.REPLACE;
    case 'redact':
    default:
      return PhiMethod.REDACT;
  }
}

export function initPipeline(config: Readonly<KliraConfig>): Tracer {
  if (kliraTracer) return kliraTracer;

  takeoverGlobalTracerProvider();

  // Python parity (PROD-764): match the resource attributes Python's
  // SDK emits — `service.name` plus `klira.sdk.version`. Python does not
  // emit `service.version` or `klira.sdk.name`; the `telemetry.sdk.*`
  // attributes are populated automatically by the OTel SDK on each side
  // (with the language-appropriate values, e.g. `nodejs` vs `python`).
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.appName,
    'klira.sdk.version': '2.0.0',
  });

  const otlp = new KliraOTLPSpanExporter({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    evalsRun: config.evalsRun,
  });

  // Wire PHI scrubbing in front of the OTLP exporter when anonymization
  // is configured. The scanner is constructed eagerly so a misconfigured
  // anonymizer fails closed at init() rather than at first export.
  let downstream: typeof otlp | PhiAwareExporter = otlp;
  if (config.anonymization) {
    downstream = new PhiAwareExporter({
      delegate: otlp,
      method: phiMethodFromConfig(config.anonymization),
    });
  }

  const filtering = new KliraFilteringExporter(downstream);

  const noneFilter = new NoneAttributeFilterProcessor();
  const batch = createKliraBatchProcessor(filtering, {
    scheduledDelayMillis: config.batchDelayMs,
  });
  processor = batch;

  const contextManager = new AsyncLocalStorageContextManager();
  context.setGlobalContextManager(contextManager);

  provider = new BasicTracerProvider({
    resource,
    spanProcessors: [noneFilter, batch],
  });
  trace.setGlobalTracerProvider(provider);

  kliraTracer = trace.getTracer('klira', '2.0.0');
  return kliraTracer;
}

export function getTracer(): Tracer {
  if (!kliraTracer) {
    return trace.getTracer('klira', '2.0.0');
  }
  return kliraTracer;
}

/**
 * Returns Klira's underlying TracerProvider after `initPipeline` has run.
 * Exposed for testing harnesses (e.g. the cross-SDK parity diff) that
 * need to attach an extra `SpanProcessor` for capture. Production code
 * should not depend on this — use the public `getTracer()` instead.
 */
export function getProviderForTesting(): BasicTracerProvider | null {
  return provider;
}

export function getProcessor(): SpanProcessor | null {
  return processor;
}

export async function shutdownPipeline(): Promise<void> {
  if (processor) {
    await processor.forceFlush();
    await processor.shutdown();
    processor = null;
  }
  if (provider) {
    await provider.shutdown();
    provider = null;
  }
  kliraTracer = null;
}

export function resetPipeline(): void {
  provider = null;
  processor = null;
  kliraTracer = null;
}
