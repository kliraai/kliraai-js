/**
 * Klira SDK v2 — Custom OTLP span exporter with Bearer token auth.
 *
 * Extends the standard OTLP proto exporter, adding the Authorization header.
 * Endpoint: https://api.getklira.com/v1/traces (default).
 */

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';

export interface KliraExporterOptions {
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly additionalHeaders?: Record<string, string>;
}

export function createKliraExporter(options: KliraExporterOptions): OTLPTraceExporter {
  const headers: Record<string, string> = {
    ...options.additionalHeaders,
  };

  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }

  return new OTLPTraceExporter({
    url: options.endpoint,
    headers,
  });
}
