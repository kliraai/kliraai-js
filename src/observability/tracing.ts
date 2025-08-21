/**
 * OpenTelemetry tracing integration for Klira AI SDK
 */

import { trace, context, SpanStatusCode, SpanKind, type Span } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { KliraConfig, SpanAttributes, TraceMetadata, Logger } from '../types/index.js';
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
      enabled: kliraConfig.tracingEnabled,
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
        'klira.sdk.name': '@kliraai/sdk',
        'klira.sdk.version': '0.1.0',
      });

      // Create exporter
      const exporter = new OTLPTraceExporter({
        url: this.config.endpoint,
        headers: this.config.headers,
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