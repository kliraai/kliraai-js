/**
 * Metrics collection for Klira AI SDK
 */

import { metrics, type Counter, type Histogram, type Gauge } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { TraceMetadata, Logger, KliraConfig } from '../types/index.js';
import { getLogger } from '../config/index.js';

export interface MetricsCollector {
  // Request metrics
  recordRequest(metadata: TraceMetadata): void;
  recordSuccess(metadata: TraceMetadata): void;
  recordError(metadata: TraceMetadata, error: Error): void;
  
  // Performance metrics
  recordLatency(operation: string, durationMs: number, metadata: TraceMetadata): void;
  recordTokens(inputTokens: number, outputTokens: number, metadata: TraceMetadata): void;
  recordCost(inputCost: number, outputCost: number, metadata: TraceMetadata): void;
  
  // Guardrails metrics
  recordGuardrailViolation(violationType: string, metadata: TraceMetadata): void;
  recordGuardrailCheck(operation: string, durationMs: number, blocked: boolean): void;
}

export interface MetricsConfig {
  serviceName: string;
  serviceVersion: string;
  endpoint?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  exportIntervalMs?: number;
}

export class KliraMetrics implements MetricsCollector {
  private static instance: KliraMetrics | null = null;
  private meter = metrics.getMeter('klira-ai-sdk', '0.1.0');
  private logger: Logger;
  private meterProvider: MeterProvider | null = null;
  private metricReader: PeriodicExportingMetricReader | null = null;
  private initialized: boolean = false;
  private config: MetricsConfig | null = null;

  // Counters
  private requestCounter!: Counter;
  private successCounter!: Counter;
  private errorCounter!: Counter;
  private violationCounter!: Counter;
  private guardrailCheckCounter!: Counter;

  // Histograms
  private latencyHistogram!: Histogram;
  private tokenHistogram!: Histogram;
  private costHistogram!: Histogram;
  private guardrailLatencyHistogram!: Histogram;

  // Gauges
  private activeRequestsGauge!: Gauge;

  private constructor(config?: MetricsConfig) {
    this.logger = getLogger();
    this.config = config || null;
    this.initializeInstruments();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: MetricsConfig): KliraMetrics {
    if (!KliraMetrics.instance) {
      KliraMetrics.instance = new KliraMetrics(config);
    }
    return KliraMetrics.instance;
  }

  /**
   * Create metrics instance from Klira config
   */
  static fromKliraConfig(kliraConfig: KliraConfig): KliraMetrics {
    const metricsConfig: MetricsConfig = {
      serviceName: kliraConfig.appName || 'klira-app',
      serviceVersion: '0.1.0', // TODO: Get from package.json
      endpoint: kliraConfig.openTelemetryEndpoint?.replace('/traces', '/metrics') || 'https://api.getklira.com/v1/metrics',
      headers: kliraConfig.apiKey ? {
        'Authorization': `Bearer ${kliraConfig.apiKey}`,
      } : {},
      enabled: kliraConfig.tracingEnabled ?? true,
      exportIntervalMs: 30000, // Export every 30 seconds
    };

    return KliraMetrics.getInstance(metricsConfig);
  }

  /**
   * Initialize metrics SDK with exporter
   */
  async initialize(): Promise<void> {
    if (this.initialized || !this.config || !this.config.enabled) {
      return;
    }

    try {
      this.logger.info('Initializing OpenTelemetry metrics export...');

      // Create resource
      const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: this.config.serviceName,
        [ATTR_SERVICE_VERSION]: this.config.serviceVersion,
        'klira.sdk.name': 'klira',
        'klira.sdk.version': '0.1.0',
      });

      // Create metrics exporter
      const metricsExporter = new OTLPMetricExporter({
        url: this.config.endpoint || 'https://api.getklira.com/v1/metrics',
        headers: this.config.headers || {},
      });

      // Create metric reader with periodic export
      this.metricReader = new PeriodicExportingMetricReader({
        exporter: metricsExporter,
        exportIntervalMillis: this.config.exportIntervalMs || 30000,
        exportTimeoutMillis: 10000,
      });

      // Create meter provider
      this.meterProvider = new MeterProvider({
        resource: resource as any, // Type cast for version compatibility
        readers: [this.metricReader],
      });

      // Set global meter provider
      metrics.setGlobalMeterProvider(this.meterProvider);

      // Update meter to use new provider
      this.meter = metrics.getMeter('klira-ai-sdk', '0.1.0');

      // Initialize instruments with new meter
      this.initializeInstruments();

      this.initialized = true;
      this.logger.info('OpenTelemetry metrics export initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize metrics export: ${error}`);
      // Continue without metrics export but still initialize instruments
      this.initializeInstruments();
    }
  }

  /**
   * Initialize metrics instruments
   */
  private initializeInstruments(): void {
    // Counters
    this.requestCounter = this.meter.createCounter('klira_requests_total', {
      description: 'Total number of requests processed',
    });

    this.successCounter = this.meter.createCounter('klira_requests_success_total', {
      description: 'Total number of successful requests',
    });

    this.errorCounter = this.meter.createCounter('klira_requests_error_total', {
      description: 'Total number of failed requests',
    });

    this.violationCounter = this.meter.createCounter('klira_guardrail_violations_total', {
      description: 'Total number of guardrail violations',
    });

    this.guardrailCheckCounter = this.meter.createCounter('klira_guardrail_checks_total', {
      description: 'Total number of guardrail checks performed',
    });

    // Histograms
    this.latencyHistogram = this.meter.createHistogram('klira_request_duration_ms', {
      description: 'Request duration in milliseconds',
      unit: 'ms',
    });

    this.tokenHistogram = this.meter.createHistogram('klira_tokens_total', {
      description: 'Number of tokens processed',
    });

    this.costHistogram = this.meter.createHistogram('klira_cost_usd', {
      description: 'Cost of requests in USD',
      unit: 'USD',
    });

    this.guardrailLatencyHistogram = this.meter.createHistogram('klira_guardrail_duration_ms', {
      description: 'Guardrail check duration in milliseconds',
      unit: 'ms',
    });

    // Gauges
    this.activeRequestsGauge = this.meter.createGauge('klira_active_requests', {
      description: 'Number of currently active requests',
    });

    this.logger.debug('Metrics instruments initialized');
  }

  /**
   * Record a request
   */
  recordRequest(metadata: TraceMetadata): void {
    this.requestCounter.add(1, {
      framework: metadata.framework || 'unknown',
      provider: metadata.provider || 'unknown',
      model: metadata.model || 'unknown',
    });

    // Increment active requests
    this.activeRequestsGauge.record(1);
  }

  /**
   * Record a successful request
   */
  recordSuccess(metadata: TraceMetadata): void {
    this.successCounter.add(1, {
      framework: metadata.framework || 'unknown',
      provider: metadata.provider || 'unknown',
      model: metadata.model || 'unknown',
    });

    // Decrement active requests
    this.activeRequestsGauge.record(-1);
  }


  /**
   * Record latency
   */
  recordLatency(operation: string, durationMs: number, metadata: TraceMetadata): void {
    this.latencyHistogram.record(durationMs, {
      operation,
      framework: metadata.framework || 'unknown',
      provider: metadata.provider || 'unknown',
      model: metadata.model || 'unknown',
    });
  }

  /**
   * Record token usage
   */
  recordTokens(inputTokens: number, outputTokens: number, metadata: TraceMetadata): void {
    const attributes = {
      framework: metadata.framework || 'unknown',
      provider: metadata.provider || 'unknown',
      model: metadata.model || 'unknown',
    };

    this.tokenHistogram.record(inputTokens, {
      ...attributes,
      token_type: 'input',
    });

    this.tokenHistogram.record(outputTokens, {
      ...attributes,
      token_type: 'output',
    });

    this.tokenHistogram.record(inputTokens + outputTokens, {
      ...attributes,
      token_type: 'total',
    });
  }

  /**
   * Record cost
   */
  recordCost(inputCost: number, outputCost: number, metadata: TraceMetadata): void {
    const attributes = {
      framework: metadata.framework || 'unknown',
      provider: metadata.provider || 'unknown',
      model: metadata.model || 'unknown',
    };

    this.costHistogram.record(inputCost, {
      ...attributes,
      cost_type: 'input',
    });

    this.costHistogram.record(outputCost, {
      ...attributes,
      cost_type: 'output',
    });

    this.costHistogram.record(inputCost + outputCost, {
      ...attributes,
      cost_type: 'total',
    });
  }

  /**
   * Record LLM call metrics (for adapter compatibility)
   */
  recordLLMCall(callData: {
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latency: number;
    cached?: boolean;
    requestId: string;
    streaming?: boolean;
  }): void {
    const attributes = {
      provider: callData.provider,
      model: callData.model,
      cached: callData.cached?.toString() || 'false',
      streaming: callData.streaming?.toString() || 'false',
    };

    // Record request
    this.requestCounter.add(1, attributes);

    // Record success
    this.successCounter.add(1, attributes);

    // Record latency
    this.latencyHistogram.record(callData.latency, {
      ...attributes,
      operation: 'llm_call',
    });

    // Record tokens
    this.tokenHistogram.record(callData.promptTokens, {
      ...attributes,
      token_type: 'input',
    });

    this.tokenHistogram.record(callData.completionTokens, {
      ...attributes,
      token_type: 'output',
    });

    this.tokenHistogram.record(callData.totalTokens, {
      ...attributes,
      token_type: 'total',
    });
  }

  /**
   * Record error for LLM calls (for adapter compatibility)
   */
  recordError(operation: string, errorData: {
    provider: string;
    model: string;
    error: string;
    requestId: string;
  }): void;
  recordError(metadata: TraceMetadata, error: Error): void;
  recordError(
    operationOrMetadata: string | TraceMetadata,
    errorDataOrError?: any
  ): void {
    if (typeof operationOrMetadata === 'string') {
      // New signature for adapter compatibility
      const operation = operationOrMetadata;
      const errorData = errorDataOrError;
      
      this.errorCounter.add(1, {
        operation,
        provider: errorData.provider,
        model: errorData.model,
        error_type: 'llm_error',
      });
    } else {
      // Original signature
      const metadata = operationOrMetadata;
      const error = errorDataOrError;
      
      this.errorCounter.add(1, {
        framework: metadata.framework || 'unknown',
        provider: metadata.provider || 'unknown',
        model: metadata.model || 'unknown',
        error_type: error.constructor.name,
      });

      // Decrement active requests
      this.activeRequestsGauge.record(-1);
    }
  }

  /**
   * Record guardrail violation
   */
  recordGuardrailViolation(violationType: string, metadata: TraceMetadata): void {
    this.violationCounter.add(1, {
      violation_type: violationType,
      framework: metadata.framework || 'unknown',
      provider: metadata.provider || 'unknown',
    });
  }

  /**
   * Record guardrail check
   */
  recordGuardrailCheck(operation: string, durationMs: number, blocked: boolean): void {
    this.guardrailCheckCounter.add(1, {
      operation,
      blocked: blocked.toString(),
    });

    this.guardrailLatencyHistogram.record(durationMs, {
      operation,
    });
  }

  /**
   * Check if metrics export is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Shutdown metrics export
   */
  async shutdown(): Promise<void> {
    if (this.metricReader) {
      await this.metricReader.shutdown();
      this.logger.info('OpenTelemetry metrics export shut down');
    }
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    KliraMetrics.instance = null;
  }
}