/**
 * Klira SDK v2 — workflow() HOF
 *
 * Creates a klira.workflow.{name} span. If the workflow is invoked
 * outside an explicit `userMessage()` scope, an `klira.user.message`
 * root span is auto-created so every Klira trace has the same shape
 * as Python (Python's `@workflow` does the same — see
 * `klira/sdk/decorators/workflow.py`).
 */

import { context as otelContext } from '@opentelemetry/api';
import { withSpan } from './context.js';
import { captureOutput } from './output.js';
import { getTracer } from '../observability/pipeline.js';
import {
  isInKliraTrace,
  markInTrace,
  setKliraContext,
} from '../tracing/propagation.js';

const PROMPT_TRUNCATION_LIMIT = 10000;

function captureWorkflowInput(args: unknown[]): string {
  if (args.length === 0) return '';
  const text = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join('\n');
  return text.length > PROMPT_TRUNCATION_LIMIT ? text.slice(0, PROMPT_TRUNCATION_LIMIT) : text;
}

function generateMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function workflow<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs): Promise<TReturn> => {
    const runWorkflow = async (): Promise<TReturn> => {
      const result = withSpan(
        `klira.workflow.${name}`,
        {
          'klira.entity_type': 'workflow',
          'klira.entity_name': name,
          'klira.input': captureWorkflowInput(args as unknown[]),
        },
        async (span) => {
          const value = await fn(...args);
          captureOutput(span, value);
          return value;
        },
      );
      return (await result) as TReturn;
    };

    if (isInKliraTrace(otelContext.active())) {
      return runWorkflow();
    }

    // Auto-create a klira.user.message root span. Python's `@workflow`
    // does the same so customers don't need to wrap every entrypoint.
    const tracer = getTracer();
    const conversationId = generateMessageId();
    const messageId = generateMessageId();

    const ctx = markInTrace(
      setKliraContext(otelContext.active(), {
        userId: 'anonymous',
        conversationId,
      }),
    );

    return otelContext.with(ctx, () =>
      tracer.startActiveSpan(
        'klira.user.message',
        {
          attributes: {
            'klira.entity_type': 'user_message',
            'klira.entity_name': 'user_message',
            'klira.user_id': 'anonymous',
            'klira.conversation_id': conversationId,
            'klira.message_id': messageId,
          },
        },
        async (rootSpan) => {
          try {
            return await runWorkflow();
          } finally {
            rootSpan.end();
          }
        },
      ),
    );
  };
}
