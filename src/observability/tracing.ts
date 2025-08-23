/**
 * OpenTelemetry tracing integration for Klira AI SDK
 */

import { trace, context, SpanStatusCode, SpanKind, type Span } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { 
  KliraConfig, 
  SpanAttributes, 
  TraceMetadata, 
  HierarchyContext, 
  ConversationContext, 
  Logger,
  PolicyViolation,
  GuardrailResult,
  ComplianceMetadata,
  ViolationSpanEvent,
  PolicyUsageInfo
} from '../types/index.js';
import { getLogger } from '../config/index.js';

export interface TracingConfig {
  serviceName: string;
  serviceVersion: string;
  endpoint?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  autoInstrumentation?: boolean;
}

export class KliraTracing {
  private static instance: KliraTracing | null = null;
  private sdk: NodeSDK | null = null;
  private tracer = trace.getTracer('klira-ai-sdk');
  private logger: Logger;
  private initialized: boolean = false;
  private config: TracingConfig;

  private constructor(config: TracingConfig) {
    this.config = config;
    this.logger = getLogger();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: TracingConfig): KliraTracing {
    if (!KliraTracing.instance && config) {
      KliraTracing.instance = new KliraTracing(config);
    }
    if (!KliraTracing.instance) {
      throw new Error('KliraTracing not initialized. Provide config on first call.');
    }
    return KliraTracing.instance;
  }

  /**
   * Initialize tracing from Klira config
   */
  static fromKliraConfig(kliraConfig: KliraConfig): KliraTracing {
    const tracingConfig: TracingConfig = {
      serviceName: kliraConfig.appName || 'klira-app',
      serviceVersion: '0.1.0', // TODO: Get from package.json
      endpoint: kliraConfig.openTelemetryEndpoint || 'https://api.getklira.com/v1/traces',
      headers: kliraConfig.apiKey ? {
        'Authorization': `Bearer ${kliraConfig.apiKey}`,
      } : {},
      enabled: kliraConfig.tracingEnabled ?? true,
      autoInstrumentation: true,
    };

    return KliraTracing.getInstance(tracingConfig);
  }

  /**
   * Initialize the tracing SDK
   */
  async initialize(): Promise<void> {
    if (this.initialized || !this.config.enabled) {
      return;
    }

    try {
      this.logger.info('Initializing OpenTelemetry tracing...');

      // Create resource
      const resource = new Resource({
        [ATTR_SERVICE_NAME]: this.config.serviceName,
        [ATTR_SERVICE_VERSION]: this.config.serviceVersion,
        'klira.sdk.name': 'klira',
        'klira.sdk.version': '0.1.0',
      });

      // Create exporter
      const exporter = new OTLPTraceExporter({
        url: this.config.endpoint || 'https://api.getklira.com/v1/traces',
        headers: this.config.headers || {},
      });

      // Create SDK
      this.sdk = new NodeSDK({
        resource,
        traceExporter: exporter,
        instrumentations: this.config.autoInstrumentation 
          ? [getNodeAutoInstrumentations({
              // Disable some instrumentations that might conflict
              '@opentelemetry/instrumentation-fs': {
                enabled: false,
              },
            })]
          : [],
      });

      // Start the SDK
      this.sdk.start();
      this.initialized = true;

      this.logger.info('OpenTelemetry tracing initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize tracing: ${error}`);
      throw error;
    }
  }

  /**
   * Create a new span
   */
  startSpan(
    name: string,
    attributes: Partial<SpanAttributes> = {},
    kind: SpanKind = SpanKind.INTERNAL
  ): Span {
    const span = this.tracer.startSpan(name, {
      kind,
      attributes: {
        'klira.instrumented': true,
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Wrap a function with tracing
   */
  traceFunction<T extends (...args: any[]) => any>(
    name: string,
    fn: T,
    options: {
      attributes?: Partial<SpanAttributes>;
      kind?: SpanKind;
      captureArgs?: boolean;
      captureResult?: boolean;
    } = {}
  ): T {
    const { attributes = {}, kind = SpanKind.INTERNAL, captureArgs = false, captureResult = false } = options;

    return ((...args: Parameters<T>) => {
      const span = this.startSpan(name, attributes, kind);

      try {
        // Capture arguments if requested
        if (captureArgs) {
          span.setAttributes({
            'function.args.count': args.length,
            'function.args': JSON.stringify(args.slice(0, 3)), // First 3 args only
          });
        }

        const result = fn(...args);

        // Handle async functions
        if (result instanceof Promise) {
          return result
            .then((value) => {
              if (captureResult) {
                span.setAttribute('function.result.type', typeof value);
              }
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return value;
            })
            .catch((error) => {
              span.recordException(error);
              span.setStatus({ 
                code: SpanStatusCode.ERROR, 
                message: error.message 
              });
              span.end();
              throw error;
            });
        } else {
          // Handle sync functions
          if (captureResult) {
            span.setAttribute('function.result.type', typeof result);
          }
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        }
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: (error as Error).message 
        });
        span.end();
        throw error;
      }
    }) as T;
  }

  /**
   * Trace LLM interaction
   */
  traceLLMCall<T>(
    operation: string,
    metadata: TraceMetadata,
    fn: () => Promise<T>
  ): Promise<T> {
    const span = this.startSpan(`llm.${operation}`, {
      'llm.operation': operation,
      'llm.model': metadata.model,
      'llm.provider': metadata.provider,
      'llm.framework': metadata.framework,
      'user.id': metadata.userId,
      'session.id': metadata.sessionId,
      'request.id': metadata.requestId,
    }, SpanKind.CLIENT);

    const startTime = Date.now();

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn();

        // Calculate duration
        const duration = Date.now() - startTime;
        span.setAttribute('llm.duration_ms', duration);

        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: (error as Error).message 
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Trace guardrails evaluation
   */
  traceGuardrails<T>(
    operation: 'input' | 'output' | 'augmentation',
    fn: () => Promise<T>
  ): Promise<T> {
    const span = this.startSpan(`guardrails.${operation}`, {
      'guardrails.operation': operation,
    });

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: (error as Error).message 
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Add attributes to current span
   */
  addAttributes(attributes: Partial<SpanAttributes>): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  }

  /**
   * Record an event on current span
   */
  addEvent(name: string, attributes?: Record<string, any>): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * Record an exception on current span
   */
  recordException(error: Error): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
    }
  }

  /**
   * Get current active span
   */
  getCurrentSpan(): Span | undefined {
    return trace.getActiveSpan();
  }

  /**
   * Set organization context (matching Python SDK)
   */
  setOrganization(organizationId: string): void {
    const contextAttributes = {
      'klira.organization_id': organizationId,
    };
    
    this.addAttributes(contextAttributes);
    this.logger.debug(`Set organization context: ${organizationId}`);
  }

  /**
   * Set project context (matching Python SDK)
   */
  setProject(projectId: string): void {
    const contextAttributes = {
      'klira.project_id': projectId,
    };
    
    this.addAttributes(contextAttributes);
    this.logger.debug(`Set project context: ${projectId}`);
  }

  /**
   * Set conversation context (matching Python SDK)
   */
  setConversationContext(conversationId: string, userId?: string): void {
    const contextAttributes: Partial<SpanAttributes> = {
      'klira.conversation_id': conversationId,
    };
    
    if (userId) {
      contextAttributes['klira.user_id'] = userId;
    }
    
    this.addAttributes(contextAttributes);
    this.logger.debug(`Set conversation context: ${conversationId}${userId ? ` for user: ${userId}` : ''}`);
  }

  /**
   * Set complete hierarchy context (matching Python SDK)
   */
  setHierarchyContext(context: HierarchyContext): void {
    const contextAttributes: Partial<SpanAttributes> = {};
    
    if (context.organizationId) {
      contextAttributes['klira.organization_id'] = context.organizationId;
    }
    if (context.projectId) {
      contextAttributes['klira.project_id'] = context.projectId;
    }
    if (context.agentId) {
      contextAttributes['klira.agent_id'] = context.agentId;
    }
    if (context.taskId) {
      contextAttributes['klira.task_id'] = context.taskId;
    }
    if (context.toolId) {
      contextAttributes['klira.tool_id'] = context.toolId;
    }
    if (context.conversationId) {
      contextAttributes['klira.conversation_id'] = context.conversationId;
    }
    if (context.userId) {
      contextAttributes['klira.user_id'] = context.userId;
    }
    
    this.addAttributes(contextAttributes);
    this.logger.debug(`Set hierarchy context:`, context);
  }

  /**
   * Get current context (matching Python SDK)
   */
  getCurrentContext(): Partial<TraceMetadata> {
    const span = trace.getActiveSpan();
    if (!span) {
      return {};
    }

    // Extract context from span attributes
    // Note: OpenTelemetry doesn't provide direct access to span attributes
    // This is a best-effort implementation
    const context: Partial<TraceMetadata> = {};
    
    // In a real implementation, we would need to store context separately
    // or use OpenTelemetry context API to store and retrieve these values
    this.logger.debug('getCurrentContext called - returning empty context (span attributes not directly accessible)');
    
    return context;
  }

  /**
   * Set external prompt tracing context (matching Python SDK)
   */
  setExternalPromptContext(promptId: string, model: string, parameters?: Record<string, any>): void {
    const contextAttributes: Partial<SpanAttributes> = {
      'prompt.id': promptId,
      'prompt.model': model,
    };
    
    if (parameters) {
      Object.entries(parameters).forEach(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          contextAttributes[`prompt.param.${key}`] = String(value);
        }
      });
    }
    
    this.addAttributes(contextAttributes);
    this.logger.debug(`Set external prompt context: ${promptId} with model: ${model}`);
  }

  /**
   * Record comprehensive policy violations in spans with detailed attributes and events
   */
  recordPolicyViolations(
    violations: PolicyViolation[],
    result: GuardrailResult,
    complianceMetadata?: ComplianceMetadata
  ): void {
    const span = trace.getActiveSpan();
    if (!span) {
      this.logger.warn('No active span found for recording policy violations');
      return;
    }

    // Record general policy evaluation metadata
    const generalAttributes: Partial<SpanAttributes> = {
      'klira.policy.violations.count': violations.length,
      'klira.policy.evaluation.blocked': result.blocked,
      'klira.policy.evaluation.allowed': result.allowed,
      'klira.guardrails.evaluation.duration_ms': result.evaluationDuration || 0,
    };

    if (result.direction) {
      generalAttributes['klira.policy.usage.direction'] = result.direction;
    }

    if (result.triggeredPolicies) {
      generalAttributes['klira.policy.usage.triggeredPolicies'] = result.triggeredPolicies;
      generalAttributes['klira.policy.usage.evaluationCount'] = result.triggeredPolicies.length;
    }

    // Add compliance metadata if provided
    if (complianceMetadata) {
      if (complianceMetadata.agentName) {
        generalAttributes['klira.agent.name'] = complianceMetadata.agentName;
      }
      if (complianceMetadata.agentVersion) {
        generalAttributes['klira.agent.version'] = complianceMetadata.agentVersion;
      }
      if (complianceMetadata.enforcementMode) {
        generalAttributes['klira.policy.enforcement.mode'] = complianceMetadata.enforcementMode;
      }
      if (complianceMetadata.customTags) {
        // Flatten custom tags into span attributes
        Object.entries(complianceMetadata.customTags).forEach(([key, value]) => {
          generalAttributes[`klira.compliance.tag.${key}`] = value;
        });
      }
      if (complianceMetadata.organizationId) {
        generalAttributes['klira.organization_id'] = complianceMetadata.organizationId;
      }
      if (complianceMetadata.projectId) {
        generalAttributes['klira.project_id'] = complianceMetadata.projectId;
      }
    }

    // Set general attributes on span
    span.setAttributes(generalAttributes);

    // Record individual violations as span attributes and events
    violations.forEach((violation, index) => {
      const violationPrefix = index === 0 ? 'klira.policy.violation' : `klira.policy.violation.${index}`;
      
      // Set span attributes for each violation
      const violationAttributes: Record<string, any> = {
        [`${violationPrefix}.ruleId`]: violation.ruleId,
        [`${violationPrefix}.severity`]: violation.severity,
        [`${violationPrefix}.blocked`]: violation.blocked,
        [`${violationPrefix}.message`]: violation.message,
      };

      if (violation.description) {
        violationAttributes[`${violationPrefix}.description`] = violation.description;
      }
      if (violation.category) {
        violationAttributes[`${violationPrefix}.category`] = violation.category;
      }
      if (violation.direction) {
        violationAttributes[`${violationPrefix}.direction`] = violation.direction;
      }
      if (violation.policyName) {
        violationAttributes[`${violationPrefix}.policyName`] = violation.policyName;
      }

      span.setAttributes(violationAttributes);

      // Create span event for individual violation
      const eventAttributes: ViolationSpanEvent['attributes'] = {
        'violation.ruleId': violation.ruleId,
        'violation.severity': violation.severity,
        'violation.message': violation.message,
        'violation.blocked': violation.blocked,
        'violation.direction': violation.direction || result.direction || 'unknown',
        'violation.timestamp': violation.timestamp || Date.now(),
      };

      if (violation.description) {
        eventAttributes['violation.description'] = violation.description;
      }
      if (violation.category) {
        eventAttributes['violation.category'] = violation.category;
      }
      if (violation.policyName) {
        eventAttributes['violation.policyName'] = violation.policyName;
      }

      span.addEvent(`policy.violation.${violation.severity}`, eventAttributes);
    });

    this.logger.debug(`Recorded ${violations.length} policy violations in span`);
  }

  /**
   * Record policy usage tracking (which policies were evaluated)
   */
  recordPolicyUsage(policyUsage: PolicyUsageInfo): void {
    const span = trace.getActiveSpan();
    if (!span) {
      this.logger.warn('No active span found for recording policy usage');
      return;
    }

    const usageAttributes: Partial<SpanAttributes> = {
      'klira.policy.usage.evaluatedPolicies': policyUsage.evaluatedPolicies,
      'klira.policy.usage.triggeredPolicies': policyUsage.triggeredPolicies,
      'klira.policy.usage.evaluationCount': policyUsage.evaluationCount,
      'klira.policy.usage.direction': policyUsage.direction,
    };

    if (policyUsage.duration) {
      usageAttributes['klira.policy.usage.duration_ms'] = policyUsage.duration;
    }

    span.setAttributes(usageAttributes);
    
    // Add event for policy usage
    span.addEvent('policy.usage.evaluation', {
      'usage.evaluatedCount': policyUsage.evaluatedPolicies.length,
      'usage.triggeredCount': policyUsage.triggeredPolicies.length,
      'usage.direction': policyUsage.direction,
      'usage.timestamp': Date.now(),
    });

    this.logger.debug(
      `Recorded policy usage: ${policyUsage.evaluatedPolicies.length} evaluated, ${policyUsage.triggeredPolicies.length} triggered`
    );
  }

  /**
   * Set compliance metadata on the current span
   */
  setComplianceMetadata(metadata: ComplianceMetadata): void {
    const contextAttributes: Partial<SpanAttributes> = {};
    
    if (metadata.agentName) {
      contextAttributes['klira.agent.name'] = metadata.agentName;
    }
    if (metadata.agentVersion) {
      contextAttributes['klira.agent.version'] = metadata.agentVersion;
    }
    if (metadata.enforcementMode) {
      contextAttributes['klira.policy.enforcement.mode'] = metadata.enforcementMode;
    }
    if (metadata.organizationId) {
      contextAttributes['klira.organization_id'] = metadata.organizationId;
    }
    if (metadata.projectId) {
      contextAttributes['klira.project_id'] = metadata.projectId;
    }
    if (metadata.evaluationTimestamp) {
      contextAttributes['klira.compliance.evaluation.timestamp'] = metadata.evaluationTimestamp;
    }
    
    // Handle custom tags
    if (metadata.customTags) {
      Object.entries(metadata.customTags).forEach(([key, value]) => {
        contextAttributes[`klira.compliance.tag.${key}`] = value;
      });
    }
    
    this.addAttributes(contextAttributes);
    this.logger.debug('Set compliance metadata on span');
  }

  /**
   * Check if tracing is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Shutdown tracing
   */
  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.logger.info('OpenTelemetry tracing shut down');
    }
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    KliraTracing.instance = null;
  }
}