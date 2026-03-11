/**
 * Klira SDK v2 — PHI-aware span exporter.
 *
 * Wraps another SpanExporter. Before export, scans all PHI_SCANNABLE_ATTRIBUTES
 * and PHI_SCANNABLE_PATTERNS for PII/PHI. If found, de-identifies in place.
 * Sets klira.phi.* attributes on each scanned span.
 *
 * Failure mode: If scanning fails on any span, export UNCHANGED (fail-open).
 */

import type {
  SpanExporter,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { ExportResult } from '@opentelemetry/core';
import {
  PHI_SCANNABLE_ATTRIBUTES,
  PHI_SCANNABLE_PATTERNS,
  type PhiMethod,
} from '../contracts/phi-pipeline.js';
import { PhiScanner } from './phi-scanner.js';
import { deidentify } from './phi-deidentifier.js';
import { PhiMethod as PhiMethodEnum } from '../contracts/phi-pipeline.js';

// ---------------------------------------------------------------------------
// PHI Exporter
// ---------------------------------------------------------------------------

export interface PhiExporterOptions {
  /** Underlying exporter to delegate to after de-identification. */
  delegate: SpanExporter;
  /** De-identification method. Default: REDACT. */
  method?: PhiMethod;
  /** Whether to enable PHI scanning. Default: true. */
  enabled?: boolean;
}

export class PhiAwareExporter implements SpanExporter {
  private delegate: SpanExporter;
  private scanner: PhiScanner;
  private method: PhiMethod;
  private enabled: boolean;

  constructor(options: PhiExporterOptions) {
    this.delegate = options.delegate;
    this.scanner = new PhiScanner();
    this.method = options.method ?? PhiMethodEnum.REDACT;
    this.enabled = options.enabled ?? true;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (!this.enabled) {
      this.delegate.export(spans, resultCallback);
      return;
    }

    // Scan and de-identify each span's attributes
    for (const span of spans) {
      try {
        this.processSpan(span);
      } catch {
        // Fail-open: export unchanged on scan failure
      }
    }

    this.delegate.export(spans, resultCallback);
  }

  async shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  async forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private processSpan(span: ReadableSpan): void {
    const attrs = span.attributes;
    let totalEntities = 0;
    const allEntityTypes = new Set<string>();
    let detected = false;

    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value !== 'string') continue;
      if (!this.shouldScan(key)) continue;

      const result = this.scanner.scan(value);
      if (result.detected) {
        detected = true;
        totalEntities += result.entityCount;
        for (const t of result.entityTypes) allEntityTypes.add(t);

        // De-identify and overwrite
        const cleaned = deidentify(value, result, this.method);
        // ReadableSpan attributes are technically read-only, but we need to
        // mutate them for export. The span has already been ended.
        (attrs as any)[key] = cleaned;
      }
    }

    // Set PHI metadata attributes
    (attrs as any)['klira.phi.detected'] = detected;
    if (detected) {
      (attrs as any)['klira.phi.entity_count'] = totalEntities;
      (attrs as any)['klira.phi.entity_types'] = [...allEntityTypes].join(',');
    }
  }

  private shouldScan(key: string): boolean {
    // Exact match
    if (PHI_SCANNABLE_ATTRIBUTES.includes(key)) return true;

    // Pattern match (simple glob: *.content matches foo.content)
    for (const pattern of PHI_SCANNABLE_PATTERNS) {
      if (matchGlob(pattern, key)) return true;
    }

    return false;
  }
}

/**
 * Simple glob matcher (supports * wildcard).
 */
function matchGlob(pattern: string, value: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*') +
      '$',
  );
  return regex.test(value);
}
