/**
 * Tests for guardrails configuration through KliraAI.init()
 * This test suite verifies that guardrails options are properly passed through
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KliraAI } from '../index.js';
import { GuardrailsEngine } from '../guardrails/engine.js';

describe('Guardrails Configuration', () => {
  beforeEach(() => {
    // Reset singleton instances before each test
    GuardrailsEngine.resetInstance();
    // Reset KliraAI initialization state
    (KliraAI as any).initialized = false;
    (KliraAI as any).config = null;
    (KliraAI as any).guardrails = null;
    (KliraAI as any).tracing = null;
    (KliraAI as any).metrics = null;
    (KliraAI as any).logger = null;
  });

  afterEach(() => {
    // Clean up after each test
    GuardrailsEngine.resetInstance();
    (KliraAI as any).initialized = false;
    (KliraAI as any).config = null;
    (KliraAI as any).guardrails = null;
    (KliraAI as any).tracing = null;
    (KliraAI as any).metrics = null;
    (KliraAI as any).logger = null;
  });

  describe('Basic Guardrails Configuration', () => {
    it('should use default guardrails config when no options provided', async () => {
      await KliraAI.init({
        appName: 'test-app',
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.fastRulesEnabled).toBe(true);
      expect(config.augmentationEnabled).toBe(true);
      expect(config.llmFallbackEnabled).toBe(false);
      expect(config.failureMode).toBe('open');
    });

    it('should override fastRulesEnabled via guardrails config', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          fastRulesEnabled: false,
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.fastRulesEnabled).toBe(false);
      expect(config.augmentationEnabled).toBe(true); // Still default
    });

    it('should override augmentationEnabled via guardrails config', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          augmentationEnabled: false,
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.augmentationEnabled).toBe(false);
      expect(config.fastRulesEnabled).toBe(true); // Still default
    });

    it('should override failureMode via guardrails config', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          failureMode: 'closed',
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.failureMode).toBe('closed');
    });

    it('should accept multiple guardrails options at once', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          fastRulesEnabled: false,
          augmentationEnabled: false,
          failureMode: 'closed',
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.fastRulesEnabled).toBe(false);
      expect(config.augmentationEnabled).toBe(false);
      expect(config.failureMode).toBe('closed');
    });
  });

  describe('Policy Path Configuration', () => {
    it('should use top-level policiesPath when provided', async () => {
      await KliraAI.init({
        appName: 'test-app',
        policiesPath: '/custom/path/policies.yaml',
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.policyPath).toBe('/custom/path/policies.yaml');
    });

    it('should use guardrails.policyPath when provided', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          policyPath: '/guardrails/custom/policies.yaml',
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.policyPath).toBe('/guardrails/custom/policies.yaml');
    });

    it('should prefer guardrails.policyPath over top-level policiesPath', async () => {
      await KliraAI.init({
        appName: 'test-app',
        policiesPath: '/top/level/policies.yaml',
        guardrails: {
          policyPath: '/guardrails/override/policies.yaml',
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.policyPath).toBe('/guardrails/override/policies.yaml');
    });

    it('should handle undefined policyPath gracefully', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          fastRulesEnabled: true,
          // No policyPath provided
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      // Should be undefined or use default
      expect(config.policyPath).toBeUndefined();
    });
  });

  describe('LLM Fallback Configuration', () => {
    const originalEnv = process.env.OPENAI_API_KEY;

    afterEach(() => {
      // Restore original env
      if (originalEnv) {
        process.env.OPENAI_API_KEY = originalEnv;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    it('should enable LLM fallback when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'test-key-12345';

      await KliraAI.init({
        appName: 'test-app',
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.llmFallbackEnabled).toBe(true);
      expect(config.llmService).toBeDefined();
    });

    it('should not enable LLM fallback when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;

      await KliraAI.init({
        appName: 'test-app',
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.llmFallbackEnabled).toBe(false);
    });

    it('should allow explicitly enabling LLM fallback via config', async () => {
      delete process.env.OPENAI_API_KEY;

      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          llmFallbackEnabled: true,
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      // Will try to enable but may fail without API key
      // The key test is that it attempted to enable it
      expect(config.llmFallbackEnabled).toBe(true);
    });

    it('should allow explicitly disabling LLM fallback even with API key', async () => {
      process.env.OPENAI_API_KEY = 'test-key-12345';

      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          llmFallbackEnabled: false,
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      // Should be disabled despite API key being available
      expect(config.llmFallbackEnabled).toBe(false);
    });
  });

  describe('API Configuration', () => {
    it('should pass apiEndpoint to guardrails config', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          apiEndpoint: 'https://api.example.com/policies',
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.apiEndpoint).toBe('https://api.example.com/policies');
    });

    it('should pass apiKey to guardrails config', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          apiKey: 'my-policy-api-key',
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.apiKey).toBe('my-policy-api-key');
    });

    it('should pass both apiEndpoint and apiKey', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          apiEndpoint: 'https://api.example.com/policies',
          apiKey: 'my-policy-api-key',
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.apiEndpoint).toBe('https://api.example.com/policies');
      expect(config.apiKey).toBe('my-policy-api-key');
    });
  });

  describe('Complex Configuration Scenarios', () => {
    it('should handle full guardrails config with all options', async () => {
      await KliraAI.init({
        appName: 'test-app',
        policiesPath: '/should/be/overridden.yaml',
        guardrails: {
          fastRulesEnabled: false,
          augmentationEnabled: false,
          llmFallbackEnabled: false,
          failureMode: 'closed',
          policyPath: '/custom/policies.yaml',
          apiEndpoint: 'https://api.example.com/policies',
          apiKey: 'test-key',
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(config.fastRulesEnabled).toBe(false);
      expect(config.augmentationEnabled).toBe(false);
      expect(config.llmFallbackEnabled).toBe(false);
      expect(config.failureMode).toBe('closed');
      expect(config.policyPath).toBe('/custom/policies.yaml');
      expect(config.apiEndpoint).toBe('https://api.example.com/policies');
      expect(config.apiKey).toBe('test-key');
    });

    it('should work with minimal config', async () => {
      await KliraAI.init({
        appName: 'minimal-test',
      });

      const guardrails = KliraAI.getGuardrails();
      expect(guardrails).toBeDefined();

      // Should use all defaults
      const config = (guardrails as any).config;
      expect(config.fastRulesEnabled).toBe(true);
      expect(config.augmentationEnabled).toBe(true);
      expect(config.failureMode).toBe('open');
    });

    it('should maintain backward compatibility with no guardrails config', async () => {
      await KliraAI.init({
        appName: 'test-app',
        verbose: true,
        tracingEnabled: false,
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      // Should use defaults
      expect(config.fastRulesEnabled).toBe(true);
      expect(config.augmentationEnabled).toBe(true);
      expect(config.llmFallbackEnabled).toBe(false);
      expect(config.failureMode).toBe('open');
    });
  });

  describe('Config Validation', () => {
    it('should accept valid failureMode values', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          failureMode: 'open',
        },
      });

      let guardrails = KliraAI.getGuardrails();
      expect((guardrails as any).config.failureMode).toBe('open');

      // Reset for second test
      GuardrailsEngine.resetInstance();
      (KliraAI as any).initialized = false;

      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          failureMode: 'closed',
        },
      });

      guardrails = KliraAI.getGuardrails();
      expect((guardrails as any).config.failureMode).toBe('closed');
    });

    it('should handle boolean guardrails options correctly', async () => {
      await KliraAI.init({
        appName: 'test-app',
        guardrails: {
          fastRulesEnabled: true,
          augmentationEnabled: false,
          llmFallbackEnabled: false,
        },
      });

      const guardrails = KliraAI.getGuardrails();
      const config = (guardrails as any).config;

      expect(typeof config.fastRulesEnabled).toBe('boolean');
      expect(typeof config.augmentationEnabled).toBe('boolean');
      expect(typeof config.llmFallbackEnabled).toBe('boolean');
    });
  });
});
