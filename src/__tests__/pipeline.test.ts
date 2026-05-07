import { describe, it, expect, afterEach } from 'vitest';
import { Klira } from '../index.js';
import { initPipeline } from '../observability/pipeline.js';
import type { KliraConfig } from '../types/index.js';

describe('Klira.init() & pipeline', () => {
  afterEach(async () => {
    await Klira.shutdown();
  });

  it('initializes and returns frozen config', async () => {
    const config = await Klira.init({
      appName: 'test-app',
      apiKey: 'klira_test_key',
      tracingEnabled: false,
    });

    expect(config.appName).toBe('test-app');
    expect(Object.isFrozen(config)).toBe(true);
    expect(Klira.isInitialized()).toBe(true);
  });

  it('returns same config on double init', async () => {
    const config1 = await Klira.init({
      appName: 'test-app',
      tracingEnabled: false,
    });
    const config2 = await Klira.init({
      appName: 'other-app',
      tracingEnabled: false,
    });
    expect(config1).toBe(config2);
  });

  it('getConfig throws before init', () => {
    expect(() => Klira.getConfig()).toThrow('not initialized');
  });

  it('shutdown resets state', async () => {
    await Klira.init({ appName: 'test-app', tracingEnabled: false });
    expect(Klira.isInitialized()).toBe(true);

    await Klira.shutdown();
    expect(Klira.isInitialized()).toBe(false);
    expect(() => Klira.getConfig()).toThrow();
  });

  it('rejects invalid config', async () => {
    await expect(
      Klira.init({ appName: 'test-app', apiKey: 'bad_key', tracingEnabled: false }),
    ).rejects.toThrow('klira_');
  });

  it('config immutability prevents mutation', async () => {
    const config = await Klira.init({
      appName: 'test-app',
      tracingEnabled: false,
    });

    expect(() => {
      (config as any).appName = 'hacked';
    }).toThrow();
  });

  // PROD-764 Phase 1 — drop klira.schema.version from emitted resource
  it('does not emit klira.schema.version as a resource attribute', async () => {
    const fakeConfig: KliraConfig = Object.freeze({
      apiKey: undefined,
      appName: 'parity-test',
      environment: 'test',
      tracingEnabled: true,
      endpoint: 'http://localhost:4318',
      verbose: false,
      debugMode: false,
      policiesPath: undefined,
      policyApiEndpoint: undefined,
      guardrails: Object.freeze({
        fastRulesEnabled: true,
        augmentationEnabled: true,
        llmFallbackEnabled: false,
        failureMode: 'open' as const,
      }),
    });

    const tracer = initPipeline(fakeConfig);
    const span = tracer.startSpan('klira.workflow.parity-test');
    span.end();
    const resource: { attributes?: Record<string, unknown>; _attributes?: Record<string, unknown> } = (span as unknown as { resource: { attributes?: Record<string, unknown>; _attributes?: Record<string, unknown> } }).resource;
    const attrs = resource.attributes ?? resource._attributes ?? {};

    expect(attrs['klira.schema.version']).toBeUndefined();
    expect(attrs['klira.sdk.name']).toBe('klira-js');
  });
});
