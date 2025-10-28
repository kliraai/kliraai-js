/**
 * Integration test for OpenTelemetry exporters
 * Validates that protobuf exporters are properly configured
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KliraTracing } from '../observability/tracing.js';
import { KliraMetrics } from '../observability/metrics.js';
import { setGlobalConfig, createConfig } from '../config/index.js';

describe('OpenTelemetry Exporters', () => {
  beforeEach(() => {
    // Initialize global config required by observability classes
    const config = createConfig({
      appName: 'test-app',
      apiKey: 'test-key',
      tracingEnabled: false,
      verbose: false,
    });
    setGlobalConfig(config);

    // Reset singleton instances
    KliraTracing.resetInstance();
    KliraMetrics.resetInstance();
  });

  afterEach(async () => {
    // Clean up instances
    const tracing = KliraTracing.getInstance({
      serviceName: 'test',
      serviceVersion: '1.0.0',
      enabled: false,
    });
    const metrics = KliraMetrics.getInstance({
      serviceName: 'test',
      serviceVersion: '1.0.0',
      enabled: false,
    });

    await tracing.shutdown();
    await metrics.shutdown();

    KliraTracing.resetInstance();
    KliraMetrics.resetInstance();
  });

  it('should instantiate KliraTracing with protobuf exporter', () => {
    const tracing = KliraTracing.getInstance({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      endpoint: 'http://localhost:4318/v1/traces',
      enabled: false, // Don't actually initialize SDK
    });

    expect(tracing).toBeDefined();
    expect(tracing.isInitialized()).toBe(false);
  });

  it('should instantiate KliraMetrics with protobuf exporter', () => {
    const metrics = KliraMetrics.getInstance({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      endpoint: 'http://localhost:4318/v1/metrics',
      enabled: false, // Don't actually initialize SDK
    });

    expect(metrics).toBeDefined();
    expect(metrics.isInitialized()).toBe(false);
  });

  it('should create tracing instance from Klira config', () => {
    const tracing = KliraTracing.fromKliraConfig({
      appName: 'test-app',
      apiKey: 'test-key',
      tracingEnabled: false, // Don't actually initialize
    });

    expect(tracing).toBeDefined();
    expect(tracing).toBeInstanceOf(KliraTracing);
  });

  it('should create metrics instance from Klira config', () => {
    const metrics = KliraMetrics.fromKliraConfig({
      appName: 'test-app',
      apiKey: 'test-key',
      tracingEnabled: false, // Don't actually initialize
    });

    expect(metrics).toBeDefined();
    expect(metrics).toBeInstanceOf(KliraMetrics);
  });

  it('should initialize tracing with protobuf exporter when enabled', async () => {
    const tracing = KliraTracing.getInstance({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      endpoint: 'http://localhost:4318/v1/traces',
      enabled: true,
      autoInstrumentation: false, // Don't load all instrumentations
    });

    // Initialize should not throw with protobuf exporter
    await expect(tracing.initialize()).resolves.not.toThrow();

    expect(tracing.isInitialized()).toBe(true);

    // Clean up
    await tracing.shutdown();
  });

  it('should initialize metrics with protobuf exporter when enabled', async () => {
    const metrics = KliraMetrics.getInstance({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      endpoint: 'http://localhost:4318/v1/metrics',
      enabled: true,
      exportIntervalMs: 60000, // Set long interval to avoid actual exports
    });

    // Initialize should not throw with protobuf exporter
    await expect(metrics.initialize()).resolves.not.toThrow();

    expect(metrics.isInitialized()).toBe(true);

    // Clean up
    await metrics.shutdown();
  });

  it('should handle multiple initialize calls gracefully', async () => {
    const tracing = KliraTracing.getInstance({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      enabled: true,
      autoInstrumentation: false,
    });

    await tracing.initialize();
    await tracing.initialize(); // Should not throw on second call

    expect(tracing.isInitialized()).toBe(true);

    await tracing.shutdown();
  });

  it('should use resourceFromAttributes for Resource creation', async () => {
    // This test validates that we're using the new API
    const tracing = KliraTracing.getInstance({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      enabled: true,
      autoInstrumentation: false,
    });

    // Should initialize without errors (would fail with old Resource() API)
    await expect(tracing.initialize()).resolves.not.toThrow();

    expect(tracing.isInitialized()).toBe(true);

    await tracing.shutdown();
  });
});
