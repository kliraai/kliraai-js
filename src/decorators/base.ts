/**
 * Base decorator infrastructure for Klira AI SDK
 * Provides decorators for tracing workflows, tasks, agents, and tools
 */

import { trace, context as otelContext, SpanStatusCode, SpanKind, type Span } from '@opentelemetry/api';
import type { TraceMetadata } from '../types/index.js';

export interface DecoratorOptions {
  name?: string;
  version?: number;
  userId?: string;
  organizationId?: string;
  projectId?: string;
  agentId?: string;
  taskId?: string;
  toolId?: string;
  conversationId?: string;
  [key: string]: any;
}

export type DecoratorType = 'workflow' | 'task' | 'agent' | 'tool';

/**
 * Get current context from OpenTelemetry context
 */
function getCurrentContext(): Partial<TraceMetadata> {
  const ctx: Partial<TraceMetadata> = {};

  // Extract values from OpenTelemetry context
  const keys = [
    'klira.organization_id',
    'klira.project_id',
    'klira.agent_id',
    'klira.task_id',
    'klira.tool_id',
    'klira.conversation_id',
    'klira.user_id',
  ];

  for (const key of keys) {
    const value = otelContext.active().getValue(Symbol.for(key));
    if (value) {
      const shortKey = key.replace('klira.', '').replace(/_(.)/g, (_, c) => c.toUpperCase());
      (ctx as any)[shortKey] = value;
    }
  }

  return ctx;
}

/**
 * Validate that userId is provided either via decorator options or global context
 */
function validateUserId(decoratorType: DecoratorType, functionName: string, options: DecoratorOptions): void {
  const userIdFromDecorator = options.userId;

  if (!userIdFromDecorator) {
    // Check global context
    const currentContext = getCurrentContext();
    const userIdFromContext = currentContext.userId;

    if (!userIdFromContext) {
      throw new Error(
        `userId is required for @${decoratorType} '${functionName}'. ` +
        `Provide it via decorator parameter or KliraAI.setHierarchyContext().\n\n` +
        `Example 1 - Via decorator parameter:\n` +
        `  @${decoratorType}({ name: 'my_${decoratorType}', userId: 'user_123' })\n` +
        `  async function ${functionName}() { ... }\n\n` +
        `Example 2 - Via global context:\n` +
        `  import { KliraAI } from '@kliraai/sdk';\n` +
        `  KliraAI.setHierarchyContext({ userId: 'user_123' });\n` +
        `  @${decoratorType}({ name: 'my_${decoratorType}' })\n` +
        `  async function ${functionName}() { ... }\n\n` +
        `For more information, see: https://docs.getklira.com/user-tracking`
      );
    }
  }
}

/**
 * Add Klira-specific context attributes to the current OpenTelemetry context
 */
function addKliraContext(decoratorType: DecoratorType, options: DecoratorOptions): void {
  let ctx = otelContext.active();

  // Add hierarchy context attributes
  if (options.organizationId) {
    ctx = ctx.setValue(Symbol.for('klira.organization_id'), options.organizationId);
  }
  if (options.projectId) {
    ctx = ctx.setValue(Symbol.for('klira.project_id'), options.projectId);
  }
  if (options.agentId) {
    ctx = ctx.setValue(Symbol.for('klira.agent_id'), options.agentId);
  }
  if (options.taskId) {
    ctx = ctx.setValue(Symbol.for('klira.task_id'), options.taskId);
  }
  if (options.toolId) {
    ctx = ctx.setValue(Symbol.for('klira.tool_id'), options.toolId);
  }
  if (options.conversationId) {
    ctx = ctx.setValue(Symbol.for('klira.conversation_id'), options.conversationId);
  }
  if (options.userId) {
    ctx = ctx.setValue(Symbol.for('klira.user_id'), options.userId);
  }

  // Add entity type
  ctx = ctx.setValue(Symbol.for('klira.entity_type'), decoratorType);

  otelContext.setGlobalContextManager(ctx as any);
}

/**
 * Create a span for a decorated function
 */
function createDecoratorSpan(
  decoratorType: DecoratorType,
  functionName: string,
  options: DecoratorOptions
): Span {
  const tracer = trace.getTracer(`klira.${decoratorType}`);
  const spanName = options.name || functionName;

  const attributes: Record<string, any> = {
    'klira.entity_type': decoratorType,
  };

  // Add version if provided
  if (options.version !== undefined) {
    attributes[`${decoratorType}.version`] = options.version;
  }

  // Add hierarchy context
  if (options.organizationId) attributes['klira.organization_id'] = options.organizationId;
  if (options.projectId) attributes['klira.project_id'] = options.projectId;
  if (options.agentId) attributes['klira.agent_id'] = options.agentId;
  if (options.taskId) attributes['klira.task_id'] = options.taskId;
  if (options.toolId) attributes['klira.tool_id'] = options.toolId;
  if (options.conversationId) attributes['klira.conversation_id'] = options.conversationId;
  if (options.userId) attributes['klira.user_id'] = options.userId;

  // Create span
  const span = tracer.startSpan(spanName, {
    kind: SpanKind.INTERNAL,
    attributes,
  });

  return span;
}

/**
 * Base decorator implementation
 */
export function createDecorator(decoratorType: DecoratorType) {
  return function (options: DecoratorOptions = {}) {
    return function <T extends (...args: any[]) => any>(
      _target: any,
      propertyKey: string,
      descriptor: TypedPropertyDescriptor<T>
    ): TypedPropertyDescriptor<T> | void {
      const originalMethod = descriptor.value;

      if (!originalMethod) {
        throw new Error(`@${decoratorType} can only be applied to methods`);
      }

      const functionName = options.name || propertyKey;

      descriptor.value = function (this: any, ...args: any[]): any {
        // Validate userId before execution
        validateUserId(decoratorType, functionName, options);

        // Add Klira context
        addKliraContext(decoratorType, options);

        // Create span
        const span = createDecoratorSpan(decoratorType, functionName, options);

        // Execute function in span context
        return otelContext.with(trace.setSpan(otelContext.active(), span), () => {
          try {
            const result = originalMethod.apply(this, args);

            // Handle async results
            if (result && typeof result.then === 'function') {
              return result
                .then((value: any) => {
                  span.setStatus({ code: SpanStatusCode.OK });
                  span.end();
                  return value;
                })
                .catch((error: any) => {
                  span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error.message || String(error),
                  });
                  span.recordException(error);
                  span.end();
                  throw error;
                });
            } else {
              // Sync result
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return result;
            }
          } catch (error: any) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message || String(error),
            });
            span.recordException(error);
            span.end();
            throw error;
          }
        });
      } as T;

      return descriptor;
    };
  };
}
