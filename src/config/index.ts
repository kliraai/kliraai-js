/**
 * Configuration management for Klira AI SDK
 */

import { z } from 'zod';
import type { KliraConfig, Logger } from '../types/index.js';

// Error classes
export class KliraConfigError extends Error {
  public readonly code = 'CONFIG_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'KliraConfigError';
  }
}

export class KliraInitializationError extends Error {
  public readonly code = 'INITIALIZATION_ERROR';
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'KliraInitializationError';
  }
}

// Configuration schema validation
const KliraConfigSchema = z.object({
  apiKey: z.string().optional(),
  appName: z.string().default(() => process.env.npm_package_name || 'klira-app'),
  openTelemetryEndpoint: z.string().optional(),
  tracingEnabled: z.boolean().default(true),
  telemetryEnabled: z.boolean().default(false),
  policiesPath: z.string().optional(),
  policyEnforcement: z.boolean().default(true),
  verbose: z.boolean().default(false),
  debugMode: z.boolean().default(false),
  environment: z.string().default('development'),

  // Guardrails configuration
  guardrails: z.object({
    fastRulesEnabled: z.boolean().optional(),
    augmentationEnabled: z.boolean().optional(),
    llmFallbackEnabled: z.boolean().optional(),
    failureMode: z.enum(['open', 'closed']).optional(),
    policyPath: z.string().optional(),
    apiEndpoint: z.string().optional(),
    apiKey: z.string().optional(),
  }).optional(),
});

// Global configuration instance
let globalConfig: KliraConfig | null = null;

/**
 * Create configuration from environment variables and overrides
 */
export function createConfig(overrides: Partial<KliraConfig> = {}): KliraConfig {
  const envConfig: Partial<KliraConfig> = {
    apiKey: process.env.KLIRA_API_KEY,
    appName: process.env.KLIRA_APP_NAME,
    openTelemetryEndpoint: process.env.KLIRA_OPENTELEMETRY_ENDPOINT,
    tracingEnabled: process.env.KLIRA_TRACING_ENABLED ? process.env.KLIRA_TRACING_ENABLED === 'true' : undefined,
    telemetryEnabled: process.env.KLIRA_TELEMETRY_ENABLED ? process.env.KLIRA_TELEMETRY_ENABLED === 'true' : undefined,
    policiesPath: process.env.KLIRA_POLICIES_PATH,
    policyEnforcement: process.env.KLIRA_POLICY_ENFORCEMENT !== 'false',
    verbose: process.env.KLIRA_VERBOSE ? process.env.KLIRA_VERBOSE === 'true' : undefined,
    debugMode: process.env.KLIRA_DEBUG ? process.env.KLIRA_DEBUG === 'true' : undefined,
    environment: process.env.NODE_ENV || process.env.KLIRA_ENVIRONMENT,
  };

  // Remove undefined values
  const cleanEnvConfig = Object.fromEntries(
    Object.entries(envConfig).filter(([_, value]) => value !== undefined)
  );

  const rawConfig = {
    ...cleanEnvConfig,
    ...overrides,
  };

  try {
    return KliraConfigSchema.parse(rawConfig);
  } catch (error) {
    throw new Error(`Invalid Klira AI configuration: ${error}`);
  }
}

/**
 * Set global configuration
 */
export function setGlobalConfig(config: KliraConfig): void {
  globalConfig = config;
}

/**
 * Get global configuration
 */
export function getGlobalConfig(): KliraConfig {
  if (!globalConfig) {
    throw new Error('Klira AI SDK not initialized. Call KliraAI.init() first.');
  }
  return globalConfig;
}

/**
 * Validate configuration
 */
export function validateConfig(config: KliraConfig): string[] {
  const errors: string[] = [];

  // Validate API key format if provided
  if (config.apiKey && !config.apiKey.startsWith('klira_')) {
    errors.push('API key must start with "klira_"');
  }

  // Validate OpenTelemetry endpoint if provided
  if (config.openTelemetryEndpoint) {
    try {
      new URL(config.openTelemetryEndpoint);
    } catch {
      errors.push('Invalid OpenTelemetry endpoint URL');
    }
  }

  // Check for required API key in production
  if (config.environment === 'production' && !config.apiKey) {
    errors.push('API key is required in production environment');
  }

  return errors;
}

/**
 * Simple logger implementation
 */
export class SimpleLogger implements Logger {
  constructor(private config: KliraConfig) {}

  debug(message: string, ...args: any[]): void {
    if (this.config.debugMode || this.config.verbose) {
      console.debug(`[Klira:DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.config.verbose) {
      console.info(`[Klira:INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[Klira:WARN] ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[Klira:ERROR] ${message}`, ...args);
  }
}

/**
 * Get logger instance
 */
export function getLogger(): Logger {
  const config = getGlobalConfig();
  return new SimpleLogger(config);
}