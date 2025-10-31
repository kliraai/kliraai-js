/**
 * Klira AI JavaScript/TypeScript SDK
 * Main entry point for the SDK
 */

import type { 
  KliraConfig, 
  GuardrailOptions, 
  TraceMetadata,
  HierarchyContext,
  Logger 
} from './types/index.js';
import { 
  createConfig, 
  setGlobalConfig, 
  validateConfig,
  getLogger,
  KliraConfigError,
  KliraInitializationError 
} from './config/index.js';
import { GuardrailsEngine, type GuardrailsEngineConfig } from './guardrails/engine.js';
import { LLMFallbackService } from './guardrails/llm-fallback.js';
import { KliraTracing } from './observability/tracing.js';
import { KliraMetrics } from './observability/metrics.js';

export class KliraAI {
  private static initialized = false;
  private static config: KliraConfig | null = null;
  private static guardrails: GuardrailsEngine | null = null;
  private static tracing: KliraTracing | null = null;
  private static metrics: KliraMetrics | null = null;
  private static logger: Logger | null = null;

  /**
   * Initialize the Klira AI SDK
   */
  static async init(options: Partial<KliraConfig> = {}): Promise<void> {
    if (KliraAI.initialized) {
      KliraAI.logger?.warn('Klira AI SDK already initialized');
      return;
    }

    try {
      // Create and validate configuration
      const config = createConfig(options);
      const validationErrors = validateConfig(config);
      
      if (validationErrors.length > 0) {
        throw new KliraConfigError(`Configuration validation failed: ${validationErrors.join(', ')}`);
      }

      // Set global configuration
      setGlobalConfig(config);
      KliraAI.config = config;
      KliraAI.logger = getLogger();

      KliraAI.logger.info('Initializing Klira AI SDK...');

      // Initialize observability
      if (config.tracingEnabled) {
        KliraAI.tracing = KliraTracing.fromKliraConfig(config);
        await KliraAI.tracing.initialize();
        
        KliraAI.metrics = KliraMetrics.fromKliraConfig(config);
        await KliraAI.metrics.initialize();
        KliraAI.logger.debug('Observability initialized');
      }

      // Initialize guardrails engine with config options
      const guardrailsConfig: GuardrailsEngineConfig = {
        // Default values
        fastRulesEnabled: true,
        augmentationEnabled: true,
        llmFallbackEnabled: false,
        failureMode: 'open',

        // Override with user-provided guardrails config
        ...config.guardrails,

        // Map top-level policiesPath to policyPath if not already set in guardrails config
        policyPath: config.guardrails?.policyPath || config.policiesPath,
      };

      // Setup LLM service for fallback if enabled
      // Only auto-enable if OPENAI_API_KEY is set AND user hasn't explicitly disabled it
      const shouldEnableLLMFallback =
        config.guardrails?.llmFallbackEnabled === true ||
        (config.guardrails?.llmFallbackEnabled !== false && process.env.OPENAI_API_KEY);

      if (shouldEnableLLMFallback) {
        try {
          const llmService = LLMFallbackService.createOpenAIService({
            apiKey: process.env.OPENAI_API_KEY || '',
          });
          guardrailsConfig.llmService = llmService;
          guardrailsConfig.llmFallbackEnabled = true;
          KliraAI.logger.debug('LLM fallback service enabled with OpenAI');
        } catch (error) {
          KliraAI.logger.warn('Failed to initialize LLM fallback service, continuing without it');
        }
      }

      KliraAI.guardrails = GuardrailsEngine.getInstance(guardrailsConfig);
      await KliraAI.guardrails.initialize();

      KliraAI.initialized = true;
      KliraAI.logger.info('Klira AI SDK initialized successfully');

    } catch (error) {
      const message = `Failed to initialize Klira AI SDK: ${error}`;
      console.error(message);
      throw new KliraInitializationError(message, error as Error);
    }
  }

  /**
   * Get the current configuration
   */
  static getConfig(): KliraConfig {
    if (!KliraAI.initialized) {
      throw new Error('Klira AI SDK not initialized. Call KliraAI.init() first.');
    }
    return KliraAI.config!;
  }

  /**
   * Get the guardrails engine
   */
  static getGuardrails(): GuardrailsEngine {
    if (!KliraAI.initialized) {
      throw new Error('Klira AI SDK not initialized. Call KliraAI.init() first.');
    }
    return KliraAI.guardrails!;
  }

  /**
   * Get the tracing instance
   */
  static getTracing(): KliraTracing | null {
    return KliraAI.tracing;
  }

  /**
   * Get the metrics instance
   */
  static getMetrics(): KliraMetrics | null {
    return KliraAI.metrics;
  }

  /**
   * Check if SDK is initialized
   */
  static isInitialized(): boolean {
    return KliraAI.initialized;
  }

  /**
   * Set association properties for current trace (enhanced version)
   */
  static setTraceMetadata(metadata: TraceMetadata): void {
    if (KliraAI.tracing) {
      const attributes: Record<string, any> = {};
      
      // Hierarchy context
      if (metadata.organizationId) attributes['klira.organization_id'] = metadata.organizationId;
      if (metadata.projectId) attributes['klira.project_id'] = metadata.projectId;
      if (metadata.agentId) attributes['klira.agent_id'] = metadata.agentId;
      if (metadata.taskId) attributes['klira.task_id'] = metadata.taskId;
      if (metadata.toolId) attributes['klira.tool_id'] = metadata.toolId;
      
      // Conversation context
      if (metadata.conversationId) attributes['klira.conversation_id'] = metadata.conversationId;
      if (metadata.userId) attributes['klira.user_id'] = metadata.userId;
      if (metadata.sessionId) attributes['klira.session_id'] = metadata.sessionId;
      
      // Request context
      if (metadata.requestId) attributes['klira.request_id'] = metadata.requestId;
      
      // LLM context
      if (metadata.model) attributes['llm.model'] = metadata.model;
      if (metadata.provider) attributes['llm.provider'] = metadata.provider;
      if (metadata.framework) attributes['llm.framework'] = metadata.framework;
      
      // Backward compatibility attributes
      if (metadata.userId) attributes['user.id'] = metadata.userId;
      if (metadata.sessionId) attributes['session.id'] = metadata.sessionId;
      if (metadata.requestId) attributes['request.id'] = metadata.requestId;
      
      KliraAI.tracing.addAttributes(attributes);
    }
  }

  /**
   * Set organization context (matching Python SDK)
   */
  static setOrganization(organizationId: string): void {
    if (KliraAI.tracing) {
      KliraAI.tracing.setOrganization(organizationId);
    }
  }

  /**
   * Set project context (matching Python SDK)
   */
  static setProject(projectId: string): void {
    if (KliraAI.tracing) {
      KliraAI.tracing.setProject(projectId);
    }
  }

  /**
   * Set conversation context (matching Python SDK)
   */
  static setConversationContext(conversationId: string, userId?: string): void {
    if (KliraAI.tracing) {
      KliraAI.tracing.setConversationContext(conversationId, userId);
    }
  }

  /**
   * Set complete hierarchy context (matching Python SDK)
   */
  static setHierarchyContext(context: HierarchyContext): void {
    if (KliraAI.tracing) {
      KliraAI.tracing.setHierarchyContext(context);
    }
  }

  /**
   * Get current context (matching Python SDK)
   */
  static getCurrentContext(): Partial<TraceMetadata> {
    if (KliraAI.tracing) {
      return KliraAI.tracing.getCurrentContext();
    }
    return {};
  }

  /**
   * Set external prompt tracing context (matching Python SDK)
   */
  static setExternalPromptContext(promptId: string, model: string, parameters?: Record<string, any>): void {
    if (KliraAI.tracing) {
      KliraAI.tracing.setExternalPromptContext(promptId, model, parameters);
    }
  }

  /**
   * Evaluate content with guardrails
   */
  static async evaluateContent(
    content: string,
    options: GuardrailOptions = {}
  ) {
    if (!KliraAI.initialized) {
      throw new Error('Klira AI SDK not initialized. Call KliraAI.init() first.');
    }

    return KliraAI.guardrails!.evaluateInput(content, options);
  }

  /**
   * Shutdown the SDK
   */
  static async shutdown(): Promise<void> {
    if (!KliraAI.initialized) {
      return;
    }

    try {
      if (KliraAI.tracing) {
        await KliraAI.tracing.shutdown();
      }

      if (KliraAI.metrics) {
        await KliraAI.metrics.shutdown();
      }

      KliraAI.initialized = false;
      KliraAI.config = null;
      KliraAI.guardrails = null;
      KliraAI.tracing = null;
      KliraAI.metrics = null;
      KliraAI.logger = null;

      // Reset singletons
      GuardrailsEngine.resetInstance();
      KliraTracing.resetInstance();
      KliraMetrics.resetInstance();

      console.log('Klira AI SDK shut down successfully');
    } catch (error) {
      console.error(`Error during SDK shutdown: ${error}`);
    }
  }
}

// Re-export types and utilities
export type {
  KliraConfig,
  GuardrailOptions,
  TraceMetadata,
  HierarchyContext,
  PolicyMatch,
  GuardrailResult,
  SpanAttributes,
  FrameworkAdapter,
  StreamChunk,
  StreamProcessor,
  Logger,
} from './types/index.js';

export {
  KliraPolicyViolation,
  KliraConfigError,
  KliraInitializationError,
} from './types/index.js';

export { guardrails } from './decorators/guardrails.js';
export { GuardrailsEngine } from './guardrails/engine.js';
export { KliraTracing } from './observability/tracing.js';
export { KliraMetrics } from './observability/metrics.js';

// Default export
export default KliraAI;