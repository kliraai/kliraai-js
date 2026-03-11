/**
 * Klira SDK v2 — Telemetry pipeline setup.
 *
 * Uses TracerProvider + Resource directly. NO NodeSDK wrapper.
 * NO auto-instrumentations.
 */

import { context, trace, type Tracer } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { SCHEMA_VERSION } from '../contracts/trace-schema.js';
import type { KliraConfig } from '../types/index.js';
import { createKliraExporter } from './exporter.js';
import { createKliraBatchProcessor } from './processor.js';

let provider: BasicTracerProvider | null = null;
let processor: SpanProcessor | null = null;
let kliraTracer: Tracer | null = null;

export function initPipeline(config: Readonly<KliraConfig>): Tracer {
  if (kliraTracer) return kliraTracer;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.appName,
    [ATTR_SERVICE_VERSION]: SCHEMA_VERSION,
    'klira.sdk.name': 'klira-js',
    'klira.sdk.version': '2.0.0',
    'klira.schema.version': SCHEMA_VERSION,
  });

  const exporter = createKliraExporter({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
  });

  processor = createKliraBatchProcessor(exporter);

  // Register async context propagation for correct parent-child spans
  const contextManager = new AsyncLocalStorageContextManager();
  context.setGlobalContextManager(contextManager);

  provider = new BasicTracerProvider({
    resource,
    spanProcessors: [processor],
  });
  trace.setGlobalTracerProvider(provider);

  kliraTracer = trace.getTracer('klira', '2.0.0');
  return kliraTracer;
}

export function getTracer(): Tracer {
  if (!kliraTracer) {
    // Return a no-op tracer if pipeline not initialized
    return trace.getTracer('klira', '2.0.0');
  }
  return kliraTracer;
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
