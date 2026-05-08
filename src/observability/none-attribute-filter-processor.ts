/**
 * Klira SDK — Pre-export attribute hygiene processor.
 *
 * Mirrors Python `klira/sdk/telemetry/processor.py`. Two responsibilities:
 *   1. Strip null / undefined attribute values so the OTLP exporter never
 *      emits them on the wire.
 *   2. Inject `klira.duration_ms` (and `klira.guardrails.latency_ms` for
 *      guardrails spans) if the wrappers haven't already set it.
 */

import type {
  Context,
  Span as ApiSpan,
} from '@opentelemetry/api';
import type {
  ReadableSpan,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

/**
 * Strips null / undefined attribute values pre-export so the OTLP exporter
 * never emits them on the wire. Mirrors Python `klira/sdk/telemetry/processor.py`.
 *
 * Note: an earlier revision also injected `klira.duration_ms` /
 * `klira.guardrails.latency_ms` here. Removed in PROD-764 because Python's
 * processor doesn't emit those, and the cross-SDK parity diff failed on them.
 * Span duration is recoverable from `start_time` / `end_time` on the wire.
 */
export class NoneAttributeFilterProcessor implements SpanProcessor {
  onStart(_span: ApiSpan, _parentContext: Context): void {
    // no-op
  }

  onEnd(span: ReadableSpan): void {
    // Mutates `span.attributes` in place. The OTel JS SDK doesn't freeze
    // the attribute object today, so this works — but `ReadableSpan` is
    // contractually read-only, and a future SDK release that freezes
    // attributes would break this. The fix would be to do the filtering
    // at the exporter layer (we'd own the serialization there). Left as
    // a known trade-off; widespread pattern across OTel-JS processors.
    const attrs = span.attributes as Record<string, unknown>;
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === null || value === undefined) {
        delete attrs[key];
      }
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
