/**
 * Klira SDK — Filtering wrapper exporter.
 *
 * Mirrors Python `klira/sdk/telemetry/filter.py`. Drops any span whose name
 * does not start with `klira.` so user-installed instrumentation that
 * happens to share our pipeline does not leak into Klira's backend.
 */

import type { ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

export class KliraFilteringExporter implements SpanExporter {
  constructor(private readonly delegate: SpanExporter) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const kliraSpans = spans.filter((s) => s.name.startsWith('klira.'));
    if (kliraSpans.length === 0) {
      resultCallback({ code: 0 });
      return;
    }
    this.delegate.export(kliraSpans, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }
}
