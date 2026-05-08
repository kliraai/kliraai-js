/**
 * Klira SDK — Pre-export attribute hygiene processor.
 *
 * Strips null / undefined attribute values pre-export so the OTLP exporter
 * never emits them on the wire. Mirrors the same responsibility in Python
 * `klira/sdk/telemetry/processor.py`.
 *
 * **Note:** an earlier revision of this processor also injected
 * `klira.duration_ms` and `klira.guardrails.latency_ms`. Both were removed
 * in PROD-764 — Python doesn't emit them, the cross-SDK parity diff caught
 * the drift, and span duration is recoverable from `start_time` /
 * `end_time` on the wire.
 */

import type {
  Context,
  Span as ApiSpan,
} from '@opentelemetry/api';
import type {
  ReadableSpan,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

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
