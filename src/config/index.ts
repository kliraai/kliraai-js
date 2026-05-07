/**
 * Klira SDK v2 — Immutable configuration
 *
 * Config is created once at Klira.init() and frozen. No mutation after construction.
 */

import type {
  KliraConfig,
  KliraInitOptions,
  Logger,
  PhiAnonymizationMethod,
} from '../types/index.js';
import { KliraConfigError } from '../types/index.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_ENDPOINT = 'https://api.getklira.com';

const ALLOWED_PHI_METHODS: readonly PhiAnonymizationMethod[] = ['redact', 'mask', 'hash', 'remove'];

/**
 * Normalize the configured endpoint to the *base URL* shape that Phase 2's
 * exporter expects. Legacy callers passing `https://api.getklira.com/v1/traces`
 * keep working — we strip the suffix so `getTelemetryEndpoint()` can append
 * `/v1/traces` (or `/evals/v1/traces`) at export time without doubling it.
 */
function normalizeEndpoint(raw: string): string {
  let base = raw.replace(/\/+$/, '');
  if (base.endsWith('/v1/traces')) base = base.slice(0, -'/v1/traces'.length);
  if (base.endsWith('/evals/v1/traces')) base = base.slice(0, -'/evals/v1/traces'.length);
  return base.replace(/\/+$/, '');
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function resolveAnonymization(
  raw: PhiAnonymizationMethod | true | undefined,
  envValue: string | undefined,
): PhiAnonymizationMethod | undefined {
  const candidate = raw ?? envValue;
  if (candidate === undefined) return undefined;
  if (candidate === true) return 'redact';
  const lower = String(candidate).toLowerCase() as PhiAnonymizationMethod;
  return ALLOWED_PHI_METHODS.includes(lower) ? lower : 'redact';
}

// ---------------------------------------------------------------------------
// Config creation & validation
// ---------------------------------------------------------------------------

export function createConfig(options: KliraInitOptions): Readonly<KliraConfig> {
  const rawEndpoint =
    options.endpoint ?? process.env.KLIRA_OPENTELEMETRY_ENDPOINT ?? DEFAULT_ENDPOINT;

  const config: KliraConfig = {
    apiKey: options.apiKey ?? process.env.KLIRA_API_KEY,
    appName: options.appName,
    environment: options.environment ?? process.env.NODE_ENV ?? 'development',
    tracingEnabled: options.tracingEnabled ?? true,
    endpoint: normalizeEndpoint(rawEndpoint),
    verbose: options.verbose ?? (process.env.KLIRA_VERBOSE === 'true'),
    debugMode: options.debugMode ?? (process.env.KLIRA_DEBUG === 'true'),
    policiesPath: options.policiesPath ?? process.env.KLIRA_POLICIES_PATH,
    policyApiEndpoint: options.policyApiEndpoint,

    framework: options.framework ?? process.env.KLIRA_FRAMEWORK,
    clinicalDomain: options.clinicalDomain ?? process.env.KLIRA_CLINICAL_DOMAIN,
    evalsRun: options.evalsRun ?? process.env.KLIRA_EVALS_RUN,
    datasetId: options.datasetId ?? process.env.KLIRA_DATASET_ID,
    anonymization: resolveAnonymization(options.anonymization, process.env.KLIRA_ANONYMIZATION),
    phiExportEntityDetails:
      options.phiExportEntityDetails ?? envBool('KLIRA_PHI_EXPORT_ENTITY_DETAILS', false),
    llmFallback: Object.freeze({
      provider: (options.llmFallback?.provider ?? process.env.KLIRA_LLM_FALLBACK_PROVIDER) as
        | 'openai'
        | 'anthropic'
        | undefined,
      model: options.llmFallback?.model ?? process.env.KLIRA_LLM_FALLBACK_MODEL,
      apiKey: options.llmFallback?.apiKey ?? process.env.KLIRA_LLM_FALLBACK_API_KEY,
      onError:
        (options.llmFallback?.onError ??
          (process.env.KLIRA_LLM_FALLBACK_ON_ERROR as 'allow' | 'block' | undefined) ??
          'allow'),
    }),
    policiesEndpoint: options.policiesEndpoint ?? process.env.KLIRA_POLICIES_ENDPOINT,
    disableExternalTracing:
      options.disableExternalTracing ?? envBool('KLIRA_DISABLE_EXTERNAL_TRACING', false),
    useRemotePolicies: options.useRemotePolicies ?? envBool('KLIRA_USE_REMOTE_POLICIES', false),
    batchDelayMs: options.batchDelayMs ?? envInt('KLIRA_BATCH_DELAY_MS', 500),

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

const REDACTED = '[REDACTED]';
const SECRET_KEYS = new Set(['apikey', 'api_key', 'authorization', 'auth']);

/**
 * Walk a value (object | array | scalar) and replace any field whose key
 * matches a known-secret name with `[REDACTED]`. Mirrors Python
 * `klira/sdk/utils/sanitize.py` (PROD-477).
 */
export function redactSecrets(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactSecrets);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k.toLowerCase())) {
      out[k] = REDACTED;
    } else {
      out[k] = redactSecrets(v);
    }
  }
  return out;
}

export class SimpleLogger implements Logger {
  constructor(private readonly config: Readonly<KliraConfig>) {}

  private redactArgs(args: unknown[]): unknown[] {
    return args.map(redactSecrets);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.config.debugMode || this.config.verbose) {
      console.debug(`[Klira:DEBUG] ${message}`, ...this.redactArgs(args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.config.verbose) {
      console.info(`[Klira:INFO] ${message}`, ...this.redactArgs(args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[Klira:WARN] ${message}`, ...this.redactArgs(args));
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[Klira:ERROR] ${message}`, ...this.redactArgs(args));
  }
}

// Re-export error types
export { KliraConfigError, KliraInitializationError } from '../types/index.js';
