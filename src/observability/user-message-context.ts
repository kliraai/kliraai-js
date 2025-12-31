/**
 * User message trace context for unified tracing architecture
 *
 * Implements the same unified trace pattern as Python SDK to ensure
 * cross-SDK compatibility and platform integration.
 */

import { trace, context as otelContext, type Span, SpanStatusCode } from '@opentelemetry/api';
import { getGlobalConfig } from '../config/index.js';

/**
 * Manages the root trace context for a user message.
 *
 * This context manager creates a unified root trace that all operations
 * (workflows, agents, tasks, tools, LLM calls, guardrails) attach to as child spans.
 *
 * Key Benefits:
 * - One trace per user message (instead of 6+ fragmented traces)
 * - Clear hierarchical span structure
 * - Proper OpenTelemetry context propagation
 * - Reduced API calls (all spans batched in one trace)
 * - Better observability and correlation
 *
 * Example:
 * ```typescript
 * import { startUserMessageTrace } from '@kliraai/sdk';
 *
 * const traceCtx = startUserMessageTrace({
 *   userId: 'user_123',
 *   conversationId: 'conv_456'
 * });
 *
 * // All decorated functions within this block
 * // will create child spans of the root trace
 * const result = await traceCtx.run(async () => {
 *   return myAgent.run(userMessage);
 * });
 * ```
 */
export class UserMessageTraceContext {
  private userId: string;
  private conversationId: string;
  private messageId: string;
  private rootSpan: Span | null = null;
  private tracer: ReturnType<typeof trace.getTracer>;

  constructor(options: {
    userId: string;
    conversationId: string;
    messageId?: string;
    organizationId?: string;
    projectId?: string;
  }) {
    this.userId = options.userId;
    this.conversationId = options.conversationId;
    this.messageId = options.messageId || this.generateMessageId();
    // Note: organizationId and projectId are accepted but not stored
    // (PROD-254 Phase 2: platform extracts from API key metadata)
    this.tracer = trace.getTracer('klira');
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Start the root trace and execute a function within its context
   *
   * @param fn - Function to execute within the unified trace context
   * @returns Result of the function execution
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Create root span for this user message
    this.rootSpan = this.tracer.startSpan('klira.user.message');

    // Set required attributes on root span
    this.rootSpan.setAttribute('klira.user_id', this.userId);
    this.rootSpan.setAttribute('klira.conversation_id', this.conversationId);
    this.rootSpan.setAttribute('klira.message_id', this.messageId);
    this.rootSpan.setAttribute('klira.entity_type', 'user_message');

    // Add evals_run if in eval mode (matching Python SDK)
    const config = getGlobalConfig();
    if (config?.evalsRun) {
      this.rootSpan.setAttribute('klira.evals_run', config.evalsRun);
    }

    // PROD-254 Phase 2: organization_id and project_id removed
    // These are extracted from API key metadata by the platform
    // Removing saves ~96 bytes per span and ~1.75 TB/year at scale

    // Execute function in span context
    const spanContext = trace.setSpan(otelContext.active(), this.rootSpan);

    try {
      const result = await otelContext.with(spanContext, fn);
      this.rootSpan.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const err = error as Error;
      this.rootSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message,
      });
      this.rootSpan.recordException(err);
      throw error;
    } finally {
      this.rootSpan.end();
      this.rootSpan = null;
    }
  }

  /**
   * Get the trace ID of the root span
   *
   * @returns Trace ID as hex string, or null if span not started
   */
  getTraceId(): string | null {
    if (!this.rootSpan) {
      return null;
    }

    const spanContext = this.rootSpan.spanContext();
    if (!spanContext.traceId) {
      return null;
    }

    return spanContext.traceId;
  }

  /**
   * Get the span ID of the root span
   *
   * @returns Span ID as hex string, or null if span not started
   */
  getSpanId(): string | null {
    if (!this.rootSpan) {
      return null;
    }

    const spanContext = this.rootSpan.spanContext();
    if (!spanContext.spanId) {
      return null;
    }

    return spanContext.spanId;
  }
}

/**
 * Start a unified trace for a user message
 *
 * This is a convenience function that creates a UserMessageTraceContext
 * to be used for managing unified traces. All operations within the context
 * will be part of the same unified trace.
 *
 * @param options - User message context options
 * @returns UserMessageTraceContext instance
 *
 * @example
 * ```typescript
 * import { startUserMessageTrace } from '@kliraai/sdk';
 * import { workflow, agent } from '@kliraai/sdk';
 *
 * class CustomerSupport {
 *   @workflow({ name: 'customer_support', userId: 'user_123' })
 *   async handleQuery(query: string) {
 *     return this.processQuery(query);
 *   }
 *
 *   @agent({ name: 'support_agent', userId: 'user_123' })
 *   async processQuery(query: string) {
 *     return "Response";
 *   }
 * }
 *
 * // Use unified tracing
 * const support = new CustomerSupport();
 * const trace = startUserMessageTrace({
 *   userId: 'user_123',
 *   conversationId: 'conv_456'
 * });
 *
 * const response = await trace.run(async () => {
 *   return support.handleQuery("How do I reset my password?");
 * });
 *
 * // Result: 1 unified trace with workflow → agent hierarchy
 * // Instead of 2 separate root traces
 * ```
 */
export function startUserMessageTrace(options: {
  userId: string;
  conversationId: string;
  messageId?: string;
  organizationId?: string;
  projectId?: string;
}): UserMessageTraceContext {
  return new UserMessageTraceContext(options);
}
