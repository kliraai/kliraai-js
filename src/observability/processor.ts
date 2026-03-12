/**
 * Klira SDK v2 — Batch span processor with Klira-specific defaults.
 */

import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';

export interface KliraProcessorOptions {
  readonly maxQueueSize?: number;
  readonly maxExportBatchSize?: number;
  readonly scheduledDelayMillis?: number;
  readonly exportTimeoutMillis?: number;
}

const DEFAULTS: Required<KliraProcessorOptions> = {
  maxQueueSize: 2048,
  maxExportBatchSize: 512,
  scheduledDelayMillis: 5000,
  exportTimeoutMillis: 30000,
};

export function createKliraBatchProcessor(
  exporter: SpanExporter,
  options: KliraProcessorOptions = {},
): BatchSpanProcessor {
  return new BatchSpanProcessor(exporter, {
    maxQueueSize: options.maxQueueSize ?? DEFAULTS.maxQueueSize,
    maxExportBatchSize: options.maxExportBatchSize ?? DEFAULTS.maxExportBatchSize,
    scheduledDelayMillis: options.scheduledDelayMillis ?? DEFAULTS.scheduledDelayMillis,
    exportTimeoutMillis: options.exportTimeoutMillis ?? DEFAULTS.exportTimeoutMillis,
  });
}
