/**
 * Klira SDK v2 — Shared LLM adapter utilities.
 *
 * Creates klira.llm.{provider} spans with gen_ai.* semantic convention attributes.
 * Truncates prompt to 10k chars, output to 5k chars per contract.
 */

import { type Span, SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from '../observability/pipeline.js';
import {
  PROMPT_TRUNCATION_LIMIT,
  OUTPUT_TRUNCATION_LIMIT,
} from '../contracts/adapter-interfaces.js';
import type { LLMCallOptions, LLMCallResult } from '../types/index.js';

// ---------------------------------------------------------------------------
// Span creation
// ---------------------------------------------------------------------------

/**
 * Run an LLM call inside a `klira.llm.{provider}` span.
 *
 * Sets `gen_ai.*` attributes from request and response.
 */
export async function withLLMSpan<T>(
  provider: string,
  options: LLMCallOptions,
  fn: (span: Span) => Promise<T>,
  extractResult?: (response: T) => LLMCallResult,
): Promise<T> {
  const tracer = getTracer();
  const spanName = `klira.llm.${provider}`;

  return tracer.startActiveSpan(spanName, async (span: Span) => {
    try {
      // Set request attributes
      setRequestAttributes(span, provider, options);

      const response = await fn(span);

      // Set response attributes
      if (extractResult) {
        const result = extractResult(response);
        setResponseAttributes(span, result);
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return response;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

export function setRequestAttributes(
  span: Span,
  provider: string,
  options: LLMCallOptions,
): void {
  span.setAttribute('klira.entity_type', 'llm');
  span.setAttribute('klira.entity_name', provider);
  span.setAttribute('gen_ai.system', provider.toLowerCase());
  span.setAttribute('gen_ai.request.model', options.model);

  // Capture prompt (truncated)
  if (options.messages && options.messages.length > 0) {
    const promptText = messagesToText(options.messages);
    span.setAttribute(
      'klira.input',
      truncate(promptText, PROMPT_TRUNCATION_LIMIT),
    );
  }
}

export function setResponseAttributes(
  span: Span,
  result: LLMCallResult,
): void {
  if (result.model) {
    span.setAttribute('gen_ai.response.model', result.model);
  }
  if (result.inputTokens !== undefined) {
    span.setAttribute('gen_ai.usage.input_tokens', result.inputTokens);
  }
  if (result.outputTokens !== undefined) {
    span.setAttribute('gen_ai.usage.output_tokens', result.outputTokens);
  }
  if (result.finishReasons && result.finishReasons.length > 0) {
    span.setAttribute('gen_ai.response.finish_reasons', result.finishReasons);
  }
  if (result.output) {
    span.setAttribute(
      'klira.output',
      truncate(result.output, OUTPUT_TRUNCATION_LIMIT),
    );
  }
}

// ---------------------------------------------------------------------------
// Message augmentation
// ---------------------------------------------------------------------------

/**
 * Augment messages with guidelines as a system message.
 * Only called when guardrails produce guidelines.
 */
export function augmentMessages(
  messages: Array<Record<string, unknown>>,
  guidelines: readonly string[],
): Array<Record<string, unknown>> {
  if (guidelines.length === 0) return messages;

  const numbered = guidelines.map((g, i) => `${i + 1}. ${g}`).join('\n');
  const guidelinesText = `\nIMPORTANT GUIDELINES:\n${numbered}\nPlease follow these guidelines in your response.`;

  const result = [...messages];
  const systemIdx = result.findIndex((m) => m.role === 'system');

  if (systemIdx >= 0) {
    result[systemIdx] = {
      ...result[systemIdx],
      content: `${String(result[systemIdx]?.content ?? '')}${guidelinesText}`,
    };
  } else {
    result.unshift({ role: 'system', content: guidelinesText.trim() });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function messagesToText(messages: Array<Record<string, unknown>>): string {
  return messages
    .map((m) => String(m.content ?? ''))
    .filter(Boolean)
    .join('\n');
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '...[truncated]';
}
