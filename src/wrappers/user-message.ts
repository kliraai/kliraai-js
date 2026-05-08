/**
 * Klira SDK v2 — userMessage() HOF
 *
 * Creates the klira.user.message root span, threads user/conversation/
 * framework into the OTel context (so child wrappers can stamp them),
 * and flushes pending spans on scope exit so a CLI-style script that
 * exits right after the call doesn't drop traces.
 */

import { context as otelContext, SpanStatusCode } from '@opentelemetry/api';
import type { UserMessageOptions } from '../types/index.js';
import { getProcessor, getTracer } from '../observability/pipeline.js';
import { setKliraContext, markInTrace } from '../tracing/propagation.js';
import { getGlobalConfigOrNull } from '../config/index.js';

export function userMessage<TArgs extends unknown[], TReturn>(
  options: UserMessageOptions,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const tracer = getTracer();
    const config = getGlobalConfigOrNull();
    const framework = options.framework ?? config?.framework;

    const baseCtx = setKliraContext(otelContext.active(), {
      userId: options.userId,
      conversationId: options.conversationId,
      framework,
    });
    const ctx = markInTrace(baseCtx);

    // Python parity (verified against captured OTLP from healthcare_agent.py):
    // klira.user.message carries the four core identifiers + `klira.evals.evals_run`
    // when the SDK is in eval mode. Framework / clinical_domain stay on the
    // workflow span (set via setClinicalContext etc), NOT on the root.
    const rootAttrs: Record<string, string> = {
      'klira.entity_type': 'user_message',
      'klira.user_id': options.userId,
      'klira.conversation_id': options.conversationId,
      'klira.message_id': options.messageId,
    };
    if (config?.evalsRun) {
      rootAttrs['klira.evals.evals_run'] = config.evalsRun;
    }

    return otelContext.with(ctx, () =>
      tracer.startActiveSpan(
        'klira.user.message',
        { attributes: rootAttrs },
        async (span) => {
          try {
            const value = await fn(...args);
            span.setStatus({ code: SpanStatusCode.OK });
            return value;
          } catch (error) {
            span.recordException(error as Error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: (error as Error).message,
            });
            throw error;
          } finally {
            span.end();
            const processor = getProcessor();
            if (processor) {
              try {
                await processor.forceFlush();
              } catch {
                // Flush failures must not affect the wrapped call's outcome.
              }
            }
          }
        },
      ),
    );
  };
}
