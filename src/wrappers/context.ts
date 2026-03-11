/**
 * Klira SDK v2 — Context propagation utilities.
 *
 * Shared helper used by all wrappers to run a function inside a span's context.
 */

import {
  context,
  trace,
  SpanStatusCode,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { getTracer } from '../observability/pipeline.js';

/**
 * Run `fn` inside a new child span, propagating context so nested
 * wrappers automatically become children.
 */
export function withSpan<T>(
  spanName: string,
  attributes: Record<string, string | number | boolean | string[]>,
  fn: (span: Span) => T | Promise<T>,
  tracer?: Tracer,
): T | Promise<T> {
  const t = tracer ?? getTracer();
  const span = t.startSpan(spanName, { attributes });

  const ctx = trace.setSpan(context.active(), span);

  const execute = (): T | Promise<T> => {
    try {
      const result = fn(span);

      if (result instanceof Promise) {
        return result
          .then((value) => {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            return value;
          })
          .catch((error) => {
            span.recordException(error as Error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: (error as Error).message,
            });
            span.end();
            throw error;
          });
      }

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.end();
      throw error;
    }
  };

  return context.with(ctx, execute);
}
