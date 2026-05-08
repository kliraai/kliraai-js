/**
 * Klira SDK v2 — Context propagation utilities.
 *
 * `withSpan` is the single span-creation entrypoint shared by every
 * wrapper and LLM adapter. It delegates to `tracer.startActiveSpan` so
 * the OTel context manager threads the new span as the parent for any
 * child work — no manual `context.with` plumbing.
 */

import {
  SpanStatusCode,
  context as otelContext,
  type Context,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { getTracer } from '../observability/pipeline.js';
import {
  getKliraUserId,
  getKliraConversationId,
  getKliraFramework,
} from '../tracing/propagation.js';

/**
 * Stamp `klira.user_id` / `klira.conversation_id` / `klira.framework`
 * onto a span when those values are present in the active OTel context.
 *
 * Matches Python `klira/sdk/tracing/propagation.py` — the sentinel
 * `"anonymous"` user_id is intentionally not propagated, so spans
 * created outside an explicit `userMessage` don't pretend to be tied
 * to a known caller.
 */
export function applyRuntimeAttrs(span: Span, ctx: Context = otelContext.active()): void {
  const userId = getKliraUserId(ctx);
  if (userId !== undefined && userId !== 'anonymous') {
    span.setAttribute('klira.user_id', userId);
  }
  const conversationId = getKliraConversationId(ctx);
  if (conversationId !== undefined) {
    span.setAttribute('klira.conversation_id', conversationId);
  }
  const framework = getKliraFramework(ctx);
  if (framework !== undefined) {
    span.setAttribute('klira.framework', framework);
  }
}

/**
 * Run `fn` inside a new child span. Uses `tracer.startActiveSpan` so the
 * span is automatically installed as the active OTel context for the
 * duration of `fn`.
 */
export function withSpan<T>(
  spanName: string,
  attributes: Record<string, string | number | boolean | string[]>,
  fn: (span: Span) => T | Promise<T>,
  tracer?: Tracer,
): T | Promise<T> {
  const t = tracer ?? getTracer();

  return t.startActiveSpan(spanName, { attributes }, (span) => {
    applyRuntimeAttrs(span);

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
  });
}
