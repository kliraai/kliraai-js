/**
 * Klira SDK v2 — Main entry point.
 *
 * Ground-up rewrite following Python SDK v2 contracts.
 * Public API: Klira.init(), Klira.shutdown(), plus HOF wrappers.
 */

import type { KliraConfig, KliraInitOptions } from './types/index.js';
import { KliraConfigError, KliraInitializationError } from './types/index.js';
import {
  createConfig,
  setGlobalConfig,
  validateConfig,
  resetGlobalConfig,
  SimpleLogger,
} from './config/index.js';
import { initPipeline, shutdownPipeline, resetPipeline } from './observability/pipeline.js';
import { autoPatchInstalledLLMs } from './adapters/auto-patch.js';

// ---------------------------------------------------------------------------
// Klira — static class (renamed from KliraAI)
// ---------------------------------------------------------------------------

export class Klira {
  private static _initialized = false;
  private static _config: Readonly<KliraConfig> | null = null;

  private constructor() {} // Prevent instantiation

  /**
   * Initialize the Klira SDK.
   *
   * Config is frozen after this call — no mutation allowed.
   * Policy loading is synchronous (YAML via fs.readFileSync).
   */
  static async init(options: KliraInitOptions): Promise<Readonly<KliraConfig>> {
    if (Klira._initialized) {
      return Klira._config!;
    }

    try {
      // Create and validate immutable config
      const config = createConfig(options);
      const errors = validateConfig(config);
      if (errors.length > 0) {
        throw new KliraConfigError(`Config validation failed: ${errors.join(', ')}`);
      }

      // Store globally
      setGlobalConfig(config);
      Klira._config = config;

      const logger = new SimpleLogger(config);
      logger.info('Initializing Klira SDK v2...');

      // Initialize OTel pipeline (direct TracerProvider, no NodeSDK)
      if (config.tracingEnabled) {
        initPipeline(config);
        logger.debug('OTel pipeline initialized');
      }

      // Best-effort auto-patch installed LLM SDKs (Python parity).
      await autoPatchInstalledLLMs();

      Klira._initialized = true;
      logger.info('Klira SDK v2 initialized');

      return config;
    } catch (error) {
      if (error instanceof KliraConfigError) throw error;
      throw new KliraInitializationError(
        `Failed to initialize Klira SDK: ${error}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /** Get the frozen config. Throws if not initialized. */
  static getConfig(): Readonly<KliraConfig> {
    if (!Klira._initialized || !Klira._config) {
      throw new KliraConfigError('Klira SDK not initialized. Call Klira.init() first.');
    }
    return Klira._config;
  }

  static isInitialized(): boolean {
    return Klira._initialized;
  }

  /** Flush pending spans and shut down the SDK. */
  static async shutdown(): Promise<void> {
    if (!Klira._initialized) return;

    await shutdownPipeline();

    Klira._initialized = false;
    Klira._config = null;
    resetGlobalConfig();
    resetPipeline();
  }
}

// Re-export types
export type {
  KliraConfig,
  KliraInitOptions,
  GuardrailResult,
  GuardrailOptions,
  PolicyMatch,
  UserMessageOptions,
  ToolOptions,
  LLMCallOptions,
  LLMCallResult,
  Logger,
  PolicyDefinition,
  PolicyRule,
} from './types/index.js';

export {
  KliraConfigError,
  KliraInitializationError,
  KliraPolicyViolation,
} from './types/index.js';

// Re-export contracts
export {
  SCHEMA_VERSION,
  AttributeType,
  ATTRIBUTE_REGISTRY,
  SPAN_DEFINITIONS,
  validateSpan,
} from './contracts/trace-schema.js';

export {
  GuardrailState,
  GuardrailLifecycle,
  VALID_TRANSITIONS,
} from './contracts/guardrails-lifecycle.js';

export {
  PhiMethod,
  PHI_SCANNABLE_ATTRIBUTES,
  PHI_SCANNABLE_PATTERNS,
} from './contracts/phi-pipeline.js';

export {
  PROMPT_TRUNCATION_LIMIT,
  OUTPUT_TRUNCATION_LIMIT,
} from './contracts/adapter-interfaces.js';

// Re-export observability
export { getTracer } from './observability/pipeline.js';

// Re-export wrappers
export { workflow, agent, task, tool, userMessage } from './wrappers/index.js';

// Default export
export default Klira;
