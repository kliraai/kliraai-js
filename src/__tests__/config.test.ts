import { describe, it, expect, afterEach } from 'vitest';
import { createConfig, validateConfig, setGlobalConfig, getGlobalConfig, resetGlobalConfig } from '../config/index.js';

describe('Config v2', () => {
  afterEach(() => {
    resetGlobalConfig();
  });

  describe('createConfig', () => {
    it('creates a frozen config', () => {
      const config = createConfig({ appName: 'test-app' });
      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.guardrails)).toBe(true);
    });

    it('sets defaults', () => {
      const config = createConfig({ appName: 'test-app' });
      expect(config.appName).toBe('test-app');
      expect(config.tracingEnabled).toBe(true);
      // PROD-764 phase 6: endpoint is now a base URL; /v1/traces appended at export time.
      expect(config.endpoint).toBe('https://api.getklira.com');
      expect(config.guardrails.fastRulesEnabled).toBe(true);
      expect(config.guardrails.augmentationEnabled).toBe(true);
      expect(config.guardrails.llmFallbackEnabled).toBe(false);
      expect(config.guardrails.failureMode).toBe('open');
    });

    it('prevents mutation in strict mode', () => {
      const config = createConfig({ appName: 'test-app' });
      expect(() => {
        (config as any).appName = 'hacked';
      }).toThrow();
      expect(() => {
        (config.guardrails as any).fastRulesEnabled = false;
      }).toThrow();
    });

    it('accepts custom values', () => {
      const config = createConfig({
        appName: 'my-app',
        apiKey: 'klira_test_key',
        environment: 'production',
        guardrails: {
          fastRulesEnabled: false,
          failureMode: 'closed',
        },
      });
      expect(config.apiKey).toBe('klira_test_key');
      expect(config.environment).toBe('production');
      expect(config.guardrails.fastRulesEnabled).toBe(false);
      expect(config.guardrails.failureMode).toBe('closed');
    });
  });

  describe('validateConfig', () => {
    it('passes for valid config', () => {
      const config = createConfig({ appName: 'test-app', apiKey: 'klira_test' });
      const errors = validateConfig(config);
      expect(errors).toEqual([]);
    });

    it('rejects invalid API key prefix', () => {
      const config = createConfig({ appName: 'test-app', apiKey: 'invalid_key' });
      const errors = validateConfig(config);
      expect(errors).toContain('API key must start with "klira_"');
    });

    it('requires API key in production', () => {
      const config = createConfig({ appName: 'test-app', environment: 'production' });
      const errors = validateConfig(config);
      expect(errors).toContain('API key is required in production environment');
    });
  });

  describe('global config singleton', () => {
    it('throws when not initialized', () => {
      expect(() => getGlobalConfig()).toThrow('Klira SDK not initialized');
    });

    it('stores and retrieves config', () => {
      const config = createConfig({ appName: 'test-app' });
      setGlobalConfig(config);
      expect(getGlobalConfig()).toBe(config);
    });

    it('resets properly', () => {
      const config = createConfig({ appName: 'test-app' });
      setGlobalConfig(config);
      resetGlobalConfig();
      expect(() => getGlobalConfig()).toThrow();
    });
  });
});
