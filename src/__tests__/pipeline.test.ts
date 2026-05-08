import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Klira } from '../index.js';
import { initPipeline, resetPipeline } from '../observability/pipeline.js';
import type { KliraConfig } from '../types/index.js';
import { GuardrailsEngine } from '../guardrails/engine.js';

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

  // PROD-764 — emit only the resource attributes Python emits
  it('emits service.name + klira.sdk.version as resource attrs and nothing else Klira-specific', async () => {
    const fakeConfig = Object.freeze({
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
    }) as unknown as KliraConfig;

    const tracer = initPipeline(fakeConfig);
    const span = tracer.startSpan('klira.workflow.parity-test');
    span.end();
    const resource: { attributes?: Record<string, unknown>; _attributes?: Record<string, unknown> } = (span as unknown as { resource: { attributes?: Record<string, unknown>; _attributes?: Record<string, unknown> } }).resource;
    const attrs = resource.attributes ?? resource._attributes ?? {};

    // Python parity: must NOT emit these.
    expect(attrs['klira.schema.version']).toBeUndefined();
    expect(attrs['service.version']).toBeUndefined();
    expect(attrs['klira.sdk.name']).toBeUndefined();

    // Must emit these (matches Python's resource).
    expect(attrs['service.name']).toBe('parity-test');
    expect(attrs['klira.sdk.version']).toBe('2.0.0');
  });

});

// PROD-764 — `policiesEndpoint` and `useRemotePolicies` were silently
// dropped before this fix because the engine was constructed lazily
// with no config. `Klira.init` now seeds the singleton with policy
// config from `KliraConfig`. Run in its own describe block so the
// pipeline.test afterEach's `Klira.shutdown()` reset doesn't race
// with these assertions.
describe('Klira.init() forwards policy config to the GuardrailsEngine singleton', () => {
  beforeEach(async () => {
    // The prior describe block's "drop klira.schema.version" test calls
    // `initPipeline` directly with `endpoint: 'http://localhost:4318'`,
    // which leaves a global TracerProvider pointing at a non-existent
    // local collector. If we don't clear that pipeline before our own
    // `Klira.init`, our `afterEach`'s `Klira.shutdown()` will trigger a
    // forceFlush against `localhost:4318` and emit a noisy ECONNREFUSED.
    resetPipeline();
    GuardrailsEngine.reset();
    await Klira.shutdown();
  });
  afterEach(async () => {
    await Klira.shutdown();
    resetPipeline();
    GuardrailsEngine.reset();
  });

  it('forwards policiesEndpoint + useRemotePolicies', async () => {
    await Klira.init({
      appName: 'cfg-fwd-1',
      apiKey: 'klira_test_key',
      tracingEnabled: false,
      policiesEndpoint: 'https://dev.api.getklira.com',
      useRemotePolicies: true,
    });

    const engine = GuardrailsEngine.getInstance();
    const cfg = (engine as unknown as { config: { policiesEndpoint?: string; useRemotePolicies?: boolean } }).config;
    expect(cfg.policiesEndpoint).toBe('https://dev.api.getklira.com');
    expect(cfg.useRemotePolicies).toBe(true);
  });

  it('forwards policiesPath when configured', async () => {
    await Klira.init({
      appName: 'cfg-fwd-2',
      apiKey: 'klira_test_key',
      tracingEnabled: false,
      policiesPath: '/custom/policies.yaml',
      useRemotePolicies: false,   // override the Python-parity default to test the local-YAML path
    });

    const engine = GuardrailsEngine.getInstance();
    const cfg = (engine as unknown as { config: { policyPath?: string; useRemotePolicies?: boolean } }).config;
    expect(cfg.policyPath).toBe('/custom/policies.yaml');
    expect(cfg.useRemotePolicies).toBe(false);
  });

  it('defaults to Python parity: useRemotePolicies=true, policiesEndpoint=https://api.getklira.com/v1/policies', async () => {
    await Klira.init({
      appName: 'cfg-fwd-3',
      apiKey: 'klira_test_key',
      tracingEnabled: false,
    });

    const config = Klira.getConfig();
    expect(config.useRemotePolicies).toBe(true);
    expect(config.policiesEndpoint).toBe('https://api.getklira.com/v1/policies');
  });
});
