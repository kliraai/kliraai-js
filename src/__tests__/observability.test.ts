/**
 * Tests for observability and tracing functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KliraTracing } from '../observability/tracing.js';
import { KliraMetrics } from '../observability/metrics.js';
import { setGlobalConfig, createConfig } from '../config/index.js';

// Mock OpenTelemetry APIs for testing
const mockTrace = {
  getTracer: vi.fn(() => ({
    startSpan: vi.fn(() => ({
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    })),
  })),
};

const mockMetrics = {
  getMeter: vi.fn(() => ({
    createCounter: vi.fn(() => ({
      add: vi.fn(),
    })),
    createHistogram: vi.fn(() => ({
      record: vi.fn(),
    })),
    createUpDownCounter: vi.fn(() => ({
      add: vi.fn(),
    })),
  })),
};

// Mock the OpenTelemetry modules
vi.mock('@opentelemetry/api', () => ({
  trace: mockTrace,
  metrics: mockMetrics,
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
}));

describe('Observability', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Set up global config for tests
    const config = createConfig({
      appName: 'test-app',
      tracingEnabled: true,
      telemetryEnabled: true,
      verbose: false,
    });
    setGlobalConfig(config);
  });

  describe('KliraTracing', () => {
    let tracing: KliraTracing;

    beforeEach(() => {
      tracing = new KliraTracing();
    });

    it('should initialize tracing correctly', () => {
      expect(tracing).toBeInstanceOf(KliraTracing);
      expect(mockTrace.getTracer).toHaveBeenCalledWith('@kliraai/sdk', expect.any(String));
    });

    it('should create spans for LLM calls', async () => {
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };
      
      const mockTracer = {
        startSpan: vi.fn(() => mockSpan),
      };
      
      mockTrace.getTracer.mockReturnValue(mockTracer);

      const testOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'test result';
      };

      const result = await tracing.traceLLMCall('test-operation', {
        model: 'gpt-4',
        provider: 'openai',
        inputTokens: 100,
        outputTokens: 50,
      }, testOperation);

      expect(result).toBe('test result');
      expect(mockTracer.startSpan).toHaveBeenCalledWith('llm.test-operation');
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'llm.operation': 'test-operation',
        'llm.model': 'gpt-4',
        'llm.provider': 'openai',
        'llm.input_tokens': 100,
        'llm.output_tokens': 50,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle errors in traced operations', async () => {
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };
      
      const mockTracer = {
        startSpan: vi.fn(() => mockSpan),
      };
      
      mockTrace.getTracer.mockReturnValue(mockTracer);

      const testError = new Error('Test error');
      const failingOperation = async () => {
        throw testError;
      };

      await expect(
        tracing.traceLLMCall('failing-operation', {}, failingOperation)
      ).rejects.toThrow('Test error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(testError);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: 'Test error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should add custom attributes to spans', async () => {
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      };
      
      const mockTracer = {
        startSpan: vi.fn(() => mockSpan),
      };
      
      mockTrace.getTracer.mockReturnValue(mockTracer);

      const testOperation = async () => 'result';

      await tracing.traceLLMCall('test-operation', {
        userId: 'user-123',
        sessionId: 'session-456',
        customAttribute: 'custom-value',
      }, testOperation);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'llm.operation': 'test-operation',
        'user.id': 'user-123',
        'session.id': 'session-456',
        'custom.attribute': 'custom-value',
      });
    });

    it('should handle tracing when disabled', async () => {
      const config = createConfig({
        tracingEnabled: false,
      });
      setGlobalConfig(config);

      const tracingDisabled = new KliraTracing();
      const testOperation = async () => 'result';

      const result = await tracingDisabled.traceLLMCall('test-operation', {}, testOperation);

      expect(result).toBe('result');
      // Should not create spans when tracing is disabled
      expect(mockTrace.getTracer).not.toHaveBeenCalled();
    });
  });

  describe('KliraMetrics', () => {
    let metrics: KliraMetrics;

    beforeEach(() => {
      metrics = new KliraMetrics();
    });

    it('should initialize metrics correctly', () => {
      expect(metrics).toBeInstanceOf(KliraMetrics);
      expect(mockMetrics.getMeter).toHaveBeenCalledWith('@kliraai/sdk', expect.any(String));
    });

    it('should track LLM request metrics', () => {
      const mockCounter = { add: vi.fn() };
      const mockHistogram = { record: vi.fn() };
      
      const mockMeter = {
        createCounter: vi.fn(() => mockCounter),
        createHistogram: vi.fn(() => mockHistogram),
      };
      
      mockMetrics.getMeter.mockReturnValue(mockMeter);
      metrics = new KliraMetrics(); // Reinitialize with mocked meter

      metrics.trackLLMRequest({
        operation: 'generateText',
        provider: 'openai',
        model: 'gpt-4',
        success: true,
        latency: 1500,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.002,
      });

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        operation: 'generateText',
        provider: 'openai',
        model: 'gpt-4',
        success: 'true',
      });

      expect(mockHistogram.record).toHaveBeenCalledWith(1500, {
        operation: 'generateText',
        provider: 'openai',
        model: 'gpt-4',
      });
    });

    it('should track guardrail violations', () => {
      const mockCounter = { add: vi.fn() };
      
      const mockMeter = {
        createCounter: vi.fn(() => mockCounter),
        createHistogram: vi.fn(() => ({ record: vi.fn() })),
      };
      
      mockMetrics.getMeter.mockReturnValue(mockMeter);
      metrics = new KliraMetrics();

      metrics.trackGuardrailViolation({
        ruleId: 'pii-email',
        severity: 'high',
        action: 'block',
        category: 'privacy',
      });

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        rule_id: 'pii-email',
        severity: 'high',
        action: 'block',
        category: 'privacy',
      });
    });

    it('should track token usage', () => {
      const mockCounter = { add: vi.fn() };
      
      const mockMeter = {
        createCounter: vi.fn(() => mockCounter),
        createHistogram: vi.fn(() => ({ record: vi.fn() })),
      };
      
      mockMetrics.getMeter.mockReturnValue(mockMeter);
      metrics = new KliraMetrics();

      metrics.trackTokenUsage({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 150,
        outputTokens: 75,
        totalTokens: 225,
      });

      // Should track both input and output tokens
      expect(mockCounter.add).toHaveBeenCalledWith(150, {
        provider: 'openai',
        model: 'gpt-4',
        token_type: 'input',
      });

      expect(mockCounter.add).toHaveBeenCalledWith(75, {
        provider: 'openai',
        model: 'gpt-4',
        token_type: 'output',
      });
    });

    it('should handle metrics when disabled', () => {
      const config = createConfig({
        telemetryEnabled: false,
      });
      setGlobalConfig(config);

      const metricsDisabled = new KliraMetrics();
      
      // Should not crash when metrics are disabled
      metricsDisabled.trackLLMRequest({
        operation: 'test',
        provider: 'test',
        model: 'test',
        success: true,
        latency: 100,
      });

      // Meter should not be created when disabled
      expect(mockMetrics.getMeter).not.toHaveBeenCalled();
    });
  });

  describe('Integration', () => {
    it('should work together for complete observability', async () => {
      const tracing = new KliraTracing();
      const metrics = new KliraMetrics();

      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      };
      
      const mockTracer = {
        startSpan: vi.fn(() => mockSpan),
      };
      
      const mockCounter = { add: vi.fn() };
      const mockHistogram = { record: vi.fn() };
      
      const mockMeter = {
        createCounter: vi.fn(() => mockCounter),
        createHistogram: vi.fn(() => mockHistogram),
      };
      
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockMetrics.getMeter.mockReturnValue(mockMeter);

      const startTime = Date.now();
      
      const testOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      };

      const result = await tracing.traceLLMCall('integration-test', {
        provider: 'openai',
        model: 'gpt-4',
      }, testOperation);

      const endTime = Date.now();
      const latency = endTime - startTime;

      // Track metrics after the operation
      metrics.trackLLMRequest({
        operation: 'integration-test',
        provider: 'openai',
        model: 'gpt-4',
        success: true,
        latency,
        inputTokens: 100,
        outputTokens: 50,
      });

      expect(result).toBe('success');
      expect(mockTracer.startSpan).toHaveBeenCalled();
      expect(mockCounter.add).toHaveBeenCalled();
      expect(mockHistogram.record).toHaveBeenCalled();
    });
  });
});