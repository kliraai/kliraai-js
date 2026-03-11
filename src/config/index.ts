/**
 * Klira SDK v2 — Immutable configuration
 *
 * Config is created once at Klira.init() and frozen. No mutation after construction.
 */

import type { KliraConfig, KliraInitOptions, Logger } from '../types/index.js';
import { KliraConfigError } from '../types/index.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_ENDPOINT = 'https://api.getklira.com/v1/traces';

// ---------------------------------------------------------------------------
// Config creation & validation
// ---------------------------------------------------------------------------

export function createConfig(options: KliraInitOptions): Readonly<KliraConfig> {
  const config: KliraConfig = {
    apiKey: options.apiKey ?? process.env.KLIRA_API_KEY,
    appName: options.appName,
    environment: options.environment ?? process.env.NODE_ENV ?? 'development',
    tracingEnabled: options.tracingEnabled ?? true,
    endpoint: options.endpoint ?? process.env.KLIRA_OPENTELEMETRY_ENDPOINT ?? DEFAULT_ENDPOINT,
    verbose: options.verbose ?? (process.env.KLIRA_VERBOSE === 'true'),
    debugMode: options.debugMode ?? (process.env.KLIRA_DEBUG === 'true'),
    policiesPath: options.policiesPath ?? process.env.KLIRA_POLICIES_PATH,
    policyApiEndpoint: options.policyApiEndpoint,
    guardrails: Object.freeze({
      fastRulesEnabled: options.guardrails?.fastRulesEnabled ?? true,
      augmentationEnabled: options.guardrails?.augmentationEnabled ?? true,
      llmFallbackEnabled: options.guardrails?.llmFallbackEnabled ?? false,
      failureMode: options.guardrails?.failureMode ?? 'open',
    }),
  };

  return Object.freeze(config);
}

export function validateConfig(config: KliraConfig): string[] {
  const errors: string[] = [];

  if (!config.appName) {
    errors.push('appName is required');
  }

  if (config.apiKey && !config.apiKey.startsWith('klira_')) {
    errors.push('API key must start with "klira_"');
  }

  if (config.endpoint) {
    try {
      new URL(config.endpoint);
    } catch {
      errors.push('Invalid endpoint URL');
    }
  }

  if (config.environment === 'production' && !config.apiKey) {
    errors.push('API key is required in production environment');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Global config singleton
// ---------------------------------------------------------------------------

let globalConfig: Readonly<KliraConfig> | null = null;

export function setGlobalConfig(config: Readonly<KliraConfig>): void {
  globalConfig = config;
}

export function getGlobalConfig(): Readonly<KliraConfig> {
  if (!globalConfig) {
    throw new KliraConfigError('Klira SDK not initialized. Call Klira.init() first.');
  }
  return globalConfig;
}

export function resetGlobalConfig(): void {
  globalConfig = null;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export class SimpleLogger implements Logger {
  constructor(private readonly config: Readonly<KliraConfig>) {}

  debug(message: string, ...args: unknown[]): void {
    if (this.config.debugMode || this.config.verbose) {
      console.debug(`[Klira:DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.config.verbose) {
      console.info(`[Klira:INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[Klira:WARN] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[Klira:ERROR] ${message}`, ...args);
  }
}

// Re-export error types
export { KliraConfigError, KliraInitializationError } from '../types/index.js';
