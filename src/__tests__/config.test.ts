/**
 * Tests for configuration management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createConfig, validateConfig, SimpleLogger } from '../config/index.js';
import type { KliraConfig } from '../types/index.js';

describe('Configuration Management', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.KLIRA_API_KEY;
    delete process.env.KLIRA_APP_NAME;
    delete process.env.KLIRA_TRACING_ENABLED;
    delete process.env.NODE_ENV;
  });

  describe('createConfig', () => {
    it('should create config with defaults', () => {
      const config = createConfig();

      expect(config.tracingEnabled).toBe(true);
      expect(config.telemetryEnabled).toBe(false);
      expect(config.policyEnforcement).toBe(true);
      expect(config.policiesPath).toBe('./policies');
      expect(config.verbose).toBe(false);
      expect(config.debugMode).toBe(false);
      expect(config.environment).toBe('development');
    });

    it('should use environment variables', () => {
      process.env.KLIRA_API_KEY = 'klira_test_key';
      process.env.KLIRA_APP_NAME = 'test-app';
      process.env.KLIRA_TRACING_ENABLED = 'false';
      process.env.KLIRA_VERBOSE = 'true';

      const config = createConfig();
      
      expect(config.apiKey).toBe('klira_test_key');
      expect(config.appName).toBe('test-app');
      expect(config.tracingEnabled).toBe(false);
      expect(config.verbose).toBe(true);
    });

    it('should override with explicit options', () => {
      process.env.KLIRA_API_KEY = 'klira_env_key';
      
      const config = createConfig({
        apiKey: 'klira_override_key',
        verbose: true,
      });
      
      expect(config.apiKey).toBe('klira_override_key');
      expect(config.verbose).toBe(true);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const config: KliraConfig = {
        apiKey: 'klira_valid_key',
        appName: 'test-app',
        tracingEnabled: true,
        environment: 'development',
      };
      
      const errors = validateConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should detect invalid API key format', () => {
      const config: KliraConfig = {
        apiKey: 'invalid_key',
        appName: 'test-app',
      };
      
      const errors = validateConfig(config);
      expect(errors).toContain('API key must start with "klira_"');
    });

    it('should detect invalid OpenTelemetry endpoint', () => {
      const config: KliraConfig = {
        openTelemetryEndpoint: 'not-a-url',
        appName: 'test-app',
      };
      
      const errors = validateConfig(config);
      expect(errors).toContain('Invalid OpenTelemetry endpoint URL');
    });

    it('should require API key in production', () => {
      const config: KliraConfig = {
        appName: 'test-app',
        environment: 'production',
      };
      
      const errors = validateConfig(config);
      expect(errors).toContain('API key is required in production environment');
    });
  });

  describe('SimpleLogger', () => {
    it('should log debug messages when in debug mode', () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      
      const config: KliraConfig = {
        debugMode: true,
        appName: 'test',
      };
      
      const logger = new SimpleLogger(config);
      logger.debug('test message');
      
      expect(consoleSpy).toHaveBeenCalledWith('[Klira:DEBUG] test message');
      consoleSpy.mockRestore();
    });

    it('should not log debug messages when not in debug mode', () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      
      const config: KliraConfig = {
        debugMode: false,
        verbose: false,
        appName: 'test',
      };
      
      const logger = new SimpleLogger(config);
      logger.debug('test message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should always log error messages', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const config: KliraConfig = {
        debugMode: false,
        verbose: false,
        appName: 'test',
      };
      
      const logger = new SimpleLogger(config);
      logger.error('error message');
      
      expect(consoleSpy).toHaveBeenCalledWith('[Klira:ERROR] error message');
      consoleSpy.mockRestore();
    });
  });
});