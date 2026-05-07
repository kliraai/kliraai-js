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
import { hrTimeToMilliseconds } from '@opentelemetry/core';

export class NoneAttributeFilterProcessor implements SpanProcessor {
  onStart(_span: ApiSpan, _parentContext: Context): void {
    // no-op
  }

  onEnd(span: ReadableSpan): void {
    const attrs = span.attributes as Record<string, unknown>;

    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === null || value === undefined) {
        delete attrs[key];
      }
    }

    if (attrs['klira.duration_ms'] === undefined) {
      const start = hrTimeToMilliseconds(span.startTime);
      const end = hrTimeToMilliseconds(span.endTime);
      const duration = end - start;
      if (duration >= 0) {
        attrs['klira.duration_ms'] = duration;
      }
    }

    if (
      span.name.startsWith('klira.guardrails.') &&
      attrs['klira.guardrails.latency_ms'] === undefined &&
      typeof attrs['klira.duration_ms'] === 'number'
    ) {
      attrs['klira.guardrails.latency_ms'] = attrs['klira.duration_ms'];
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
