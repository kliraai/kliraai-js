/**
 * Klira SDK v2 — Custom OTLP span exporter with Bearer token auth.
 *
 * Endpoint is stored as a *base URL* (no trailing path). The full traces
 * path (`/v1/traces` or `/evals/v1/traces` when running under an evals run)
 * is computed at construction time. This mirrors Python which threads the
 * base URL through config and switches paths when `KLIRA_EVALS_RUN` is set.
 */

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';

export interface KliraExporterOptions {
  /** Base URL — no `/v1/traces` suffix. */
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly additionalHeaders?: Record<string, string>;
  /** When set, full URL becomes `${endpoint}/evals/v1/traces`. */
  readonly evalsRun?: string;
}

export function getTelemetryEndpoint(config: { endpoint: string; evalsRun?: string }): string {
  const base = config.endpoint.replace(/\/+$/, '');
  return config.evalsRun ? `${base}/evals/v1/traces` : `${base}/v1/traces`;
}

export class KliraOTLPSpanExporter extends OTLPTraceExporter {
  constructor(options: KliraExporterOptions) {
    const headers: Record<string, string> = { ...options.additionalHeaders };
    if (options.apiKey) {
      headers['Authorization'] = `Bearer ${options.apiKey}`;
    }

    super({
      url: getTelemetryEndpoint({ endpoint: options.endpoint, evalsRun: options.evalsRun }),
      headers,
    });
  }
}

/** @deprecated Use `new KliraOTLPSpanExporter(...)`. */
export function createKliraExporter(options: KliraExporterOptions): KliraOTLPSpanExporter {
  return new KliraOTLPSpanExporter(options);
}
