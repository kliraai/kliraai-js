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

  // Evaluation system settings
  evalsRun: z.string().optional(),

  // Remote dataset configuration for evals
  datasetId: z.string().optional(),
  datasetApiUrl: z.string().url().optional(),
  datasetFetchTimeout: z.number().min(1000).max(60000).default(10000),
  datasetFetchRetries: z.number().min(0).max(10).default(3),

  // Tracing and metrics settings
  traceContent: z.boolean().default(true),
  metricsEnabled: z.boolean().default(true),
  loggingEnabled: z.boolean().default(false),

  // Top-level guardrails options (for backward compatibility)
  llmFallbackEnabled: z.boolean().optional(),

  // LLM Fallback configuration
  llmFallbackProvider: z.enum(['openai', 'anthropic']).optional(),
  llmFallbackModel: z.string().optional(),
  llmFallbackApiKey: z.string().optional(),

  // Fuzzy matching configuration
  fuzzySimilarityThreshold: z.number().min(0).max(100).default(85),

  // Remote policy loading
  useRemotePolicies: z.boolean().default(true),

  // Prompt logging configuration
  logPrompts: z.boolean().default(true),
  promptTruncationLimit: z.number().min(0).default(15000),
  responseTruncationLimit: z.number().min(0).default(1000),

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

    // Evaluation system settings
    evalsRun: process.env.KLIRA_EVALS_RUN,

    // Remote dataset configuration
    datasetId: process.env.KLIRA_DATASET_ID,
    datasetApiUrl: process.env.KLIRA_DATASET_API_URL,
    datasetFetchTimeout: process.env.KLIRA_DATASET_FETCH_TIMEOUT
      ? parseInt(process.env.KLIRA_DATASET_FETCH_TIMEOUT, 10)
      : undefined,
    datasetFetchRetries: process.env.KLIRA_DATASET_FETCH_RETRIES
      ? parseInt(process.env.KLIRA_DATASET_FETCH_RETRIES, 10)
      : undefined,

    // Tracing and metrics settings
    traceContent: process.env.KLIRA_TRACE_CONTENT ? process.env.KLIRA_TRACE_CONTENT === 'true' : undefined,
    metricsEnabled: process.env.KLIRA_METRICS_ENABLED ? process.env.KLIRA_METRICS_ENABLED === 'true' : undefined,
    loggingEnabled: process.env.KLIRA_LOGGING_ENABLED ? process.env.KLIRA_LOGGING_ENABLED === 'true' : undefined,

    // LLM Fallback configuration
    llmFallbackProvider: process.env.KLIRA_LLM_FALLBACK_PROVIDER as 'openai' | 'anthropic' | undefined,
    llmFallbackModel: process.env.KLIRA_LLM_FALLBACK_MODEL,
    llmFallbackApiKey: process.env.KLIRA_LLM_FALLBACK_API_KEY,

    // Fuzzy matching configuration
    fuzzySimilarityThreshold: process.env.KLIRA_FUZZY_SIMILARITY_THRESHOLD
      ? parseFloat(process.env.KLIRA_FUZZY_SIMILARITY_THRESHOLD)
      : undefined,

    // Remote policy loading
    useRemotePolicies: process.env.KLIRA_USE_REMOTE_POLICIES ? process.env.KLIRA_USE_REMOTE_POLICIES === 'true' : undefined,

    // Prompt logging configuration
    logPrompts: process.env.KLIRA_LOG_PROMPTS ? process.env.KLIRA_LOG_PROMPTS === 'true' : undefined,
    promptTruncationLimit: process.env.KLIRA_PROMPT_TRUNCATION_LIMIT
      ? parseInt(process.env.KLIRA_PROMPT_TRUNCATION_LIMIT, 10)
      : undefined,
    responseTruncationLimit: process.env.KLIRA_RESPONSE_TRUNCATION_LIMIT
      ? parseInt(process.env.KLIRA_RESPONSE_TRUNCATION_LIMIT, 10)
      : undefined,
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