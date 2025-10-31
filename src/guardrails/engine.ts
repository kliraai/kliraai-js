/**
 * Main guardrails engine orchestrating all policy evaluation components
 */

import type {
  PolicyMatch,
  GuardrailResult,
  GuardrailOptions,
  Logger
} from '../types/index.js';
import { getLogger } from '../config/index.js';
import { FastRulesEngine } from './fast-rules.js';
import { PolicyAugmentation } from './policy-augmentation.js';
import { LLMFallbackService, type LLMService } from './llm-fallback.js';
import { PolicyLoader } from './policy-loader.js';
import { PolicyDefinition } from '../types/policies.js';
import type { KliraTracing } from '../observability/tracing.js';

export interface GuardrailsEngineConfig {
  fastRulesEnabled?: boolean;
  augmentationEnabled?: boolean;
  llmFallbackEnabled?: boolean;
  llmService?: LLMService;
  failureMode?: 'open' | 'closed'; // fail open (allow) or closed (block) on errors
  policyPath?: string; // Path to YAML policy file
  apiEndpoint?: string; // API endpoint for dynamic policy loading
  apiKey?: string; // API key for policy loading
  tracing?: KliraTracing; // Tracing instance for observability
}

export class GuardrailsEngine {
  private static instance: GuardrailsEngine | null = null;

  private fastRules: FastRulesEngine;
  private augmentation: PolicyAugmentation;
  private llmFallback: LLMFallbackService;
  private policyLoader: PolicyLoader;
  private config: GuardrailsEngineConfig;
  private logger: Logger;
  private initialized: boolean = false;
  private policies: PolicyDefinition[] = [];
  private tracing?: KliraTracing;

  private constructor(config: GuardrailsEngineConfig = {}) {
    this.config = {
      fastRulesEnabled: true,
      augmentationEnabled: true,
      llmFallbackEnabled: false,
      failureMode: 'open',
      ...config,
    };

    this.logger = getLogger();
    this.tracing = config.tracing;
    this.fastRules = new FastRulesEngine();
    this.augmentation = new PolicyAugmentation();
    this.llmFallback = new LLMFallbackService();
    this.policyLoader = new PolicyLoader({
      endpoint: config.apiEndpoint || '',
      apiKey: config.apiKey || '',
    });

    if (config.llmService) {
      this.llmFallback.setLLMService(config.llmService);
      this.llmFallback.setEnabled(this.config.llmFallbackEnabled || false);
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: GuardrailsEngineConfig): GuardrailsEngine {
    if (!GuardrailsEngine.instance) {
      GuardrailsEngine.instance = new GuardrailsEngine(config);
    }
    return GuardrailsEngine.instance;
  }

  /**
   * Initialize the engine with YAML policies
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info('Initializing Guardrails Engine...');
      
      // Load policies from YAML
      await this.loadPolicies();
      
      // Initialize sub-components with policies
      await this.fastRules.initialize(this.config.policyPath);
      await this.augmentation.initialize(this.policies);
      
      // Initialize LLM fallback if enabled
      if (this.config.llmFallbackEnabled) {
        await this.llmFallback.initialize(this.policies);
      }
      
      this.initialized = true;
      this.logger.info(
        `Guardrails Engine initialized successfully with ${this.policies.length} policies`
      );
    } catch (error) {
      this.logger.error(`Failed to initialize Guardrails Engine: ${error}`);
      
      // If YAML loading fails, continue with hardcoded rules
      this.logger.warn('Falling back to hardcoded rules');
      this.initialized = true;
    }
  }

  /**
   * Evaluate input content with all guardrail layers
   */
  async evaluateInput(
    content: string,
    options: GuardrailOptions = {}
  ): Promise<GuardrailResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const evaluatedPolicies: string[] = [];
    const triggeredPolicies: string[] = [];

    try {
      const matches: PolicyMatch[] = [];
      let transformedContent = content;
      let blocked = false;

      // Layer 1: Fast Rules (pattern matching with direction awareness)
      if (this.config.fastRulesEnabled) {
        const fastResult = this.fastRules.isYAMLInitialized()
          ? this.fastRules.evaluateWithDirection(content, 'inbound')
          : this.fastRules.evaluate(content);

        // Track which policies were evaluated
        const fastPolicies = this.fastRules.getPolicyIds();
        evaluatedPolicies.push(...fastPolicies);

        // Track triggered policies
        const matchedPolicies = fastResult.matches.map(v => v.ruleId);
        triggeredPolicies.push(...matchedPolicies);

        matches.push(...fastResult.matches.map(v => ({
          ...v,
          direction: 'input',
          timestamp: Date.now(),
        })));

        // transformedContent always equals original content in new model
        transformedContent = content;
        blocked = blocked || fastResult.blocked;

        this.logger.debug(`Fast rules found ${fastResult.matches.length} matches`);
      }

      // Layer 2: LLM Fallback (for complex evaluation)
      // Only run when NO policies matched - acts as catch-all safety layer
      if (this.config.llmFallbackEnabled && matches.length === 0) {
        this.logger.debug('No policies matched, running LLM fallback for safety check');

        const llmResult = await this.llmFallback.evaluateWithLLM(
          transformedContent,
          matches,
          { options }
        );

        if (llmResult) {
          const llmPolicies = ['llm-content-safety', 'llm-policy-check'];
          evaluatedPolicies.push(...llmPolicies);

          const llmTriggeredPolicies = llmResult.matches.map(v => v.ruleId);
          triggeredPolicies.push(...llmTriggeredPolicies);

          matches.push(...llmResult.matches.map(v => ({
            ...v,
            direction: 'input',
            timestamp: Date.now(),
          })));

          blocked = blocked || !llmResult.safe;

          if (llmResult.modifiedContent) {
            transformedContent = llmResult.modifiedContent;
          }

          this.logger.debug(`LLM fallback evaluation: safe=${llmResult.safe}, confidence=${llmResult.confidence}`);
        }
      }

      // Layer 3: Generate augmentation guidelines
      // Only generate when not blocked and for non-blocking matches (action: warn/allow)
      let guidelines: string[] = [];
      if (this.config.augmentationEnabled && !blocked && matches.length > 0) {
        // Filter to only non-blocking matches
        const nonBlockingMatches = matches.filter(m => !m.blocked);

        if (nonBlockingMatches.length > 0) {
          const nonBlockingPolicyIds = nonBlockingMatches.map(m => m.ruleId);
          guidelines = this.augmentation.generateGuidelines(
            nonBlockingMatches,
            nonBlockingPolicyIds
          );
          this.logger.debug(
            `Generated ${guidelines.length} augmentation guidelines from ${nonBlockingMatches.length} non-blocking matches`
          );

          // Record augmentation data in traces
          if (this.tracing && guidelines.length > 0) {
            this.tracing.recordAugmentation(guidelines, nonBlockingMatches, nonBlockingPolicyIds);
          }
        }
      }

      const duration = Date.now() - startTime;
      const uniqueTriggeredPolicies = [...new Set(triggeredPolicies)];
      const uniqueEvaluatedPolicies = [...new Set(evaluatedPolicies)];

      return {
        allowed: !blocked,
        blocked,
        matches,
        transformedInput: transformedContent !== content ? transformedContent : undefined,
        guidelines,
        reason: this.createReasonMessage(matches, blocked),
        evaluationDuration: duration,
        triggeredPolicies: uniqueTriggeredPolicies,
        direction: 'input',
        policyUsage: {
          evaluatedPolicies: uniqueEvaluatedPolicies,
          triggeredPolicies: uniqueTriggeredPolicies,
          evaluationCount: uniqueEvaluatedPolicies.length,
          direction: 'input',
          duration,
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Guardrails evaluation failed: ${error}`);
      
      // Handle failure based on failure mode
      if (this.config.failureMode === 'closed') {
        return {
          allowed: false,
          blocked: true,
          matches: [{
            ruleId: 'system-error',
            message: 'Guardrails evaluation failed',
            blocked: true,
            direction: 'input',
            timestamp: Date.now(),
            metadata: { error: String(error) },
          }],
          reason: 'System error - blocking for safety',
          evaluationDuration: duration,
          triggeredPolicies: ['system-error'],
          direction: 'input',
        };
      } else {
        return {
          allowed: true,
          blocked: false,
          matches: [],
          reason: 'System error - allowing with warning',
          evaluationDuration: duration,
          triggeredPolicies: [],
          direction: 'input',
        };
      }
    }
  }

  /**
   * Evaluate output content with direction awareness
   */
  async evaluateOutput(
    content: string,
    options: GuardrailOptions = {}
  ): Promise<GuardrailResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const evaluatedPolicies: string[] = [];
    const triggeredPolicies: string[] = [];

    try {
      const matches: PolicyMatch[] = [];
      let transformedContent = content;
      let blocked = false;

      // Layer 1: Fast Rules (pattern matching for outbound)
      if (this.config.fastRulesEnabled) {
        const fastResult = this.fastRules.isYAMLInitialized()
          ? this.fastRules.evaluateWithDirection(content, 'outbound')
          : this.fastRules.evaluate(content);

        // Track which policies were evaluated
        const fastPolicies = this.fastRules.getPolicyIds();
        evaluatedPolicies.push(...fastPolicies);

        // Track triggered policies
        const matchedPolicies = fastResult.matches.map(v => v.ruleId);
        triggeredPolicies.push(...matchedPolicies);

        matches.push(...fastResult.matches.map(v => ({
          ...v,
          direction: 'output',
          timestamp: Date.now(),
        })));

        // transformedContent always equals original content in new model
        transformedContent = content;
        blocked = blocked || fastResult.blocked;

        this.logger.debug(`Fast rules (output) found ${fastResult.matches.length} matches`);
      }

      // Layer 2: LLM Fallback (for complex evaluation)
      // Only run when NO policies matched - acts as catch-all safety layer
      if (this.config.llmFallbackEnabled && matches.length === 0) {
        this.logger.debug('No policies matched, running LLM fallback for safety check');

        const llmResult = await this.llmFallback.evaluateWithLLM(
          transformedContent,
          matches,
          { options, direction: 'outbound' }
        );

        if (llmResult) {
          const llmPolicies = ['llm-content-safety', 'llm-policy-check'];
          evaluatedPolicies.push(...llmPolicies);

          const llmTriggeredPolicies = llmResult.matches.map(v => v.ruleId);
          triggeredPolicies.push(...llmTriggeredPolicies);

          matches.push(...llmResult.matches.map(v => ({
            ...v,
            direction: 'output',
            timestamp: Date.now(),
          })));

          blocked = blocked || !llmResult.safe;

          if (llmResult.modifiedContent) {
            transformedContent = llmResult.modifiedContent;
          }

          this.logger.debug(`LLM fallback (output): safe=${llmResult.safe}`);
        }
      }

      // Layer 3: Generate augmentation guidelines
      // Only generate when not blocked and for non-blocking matches (action: warn/allow)
      let guidelines: string[] = [];
      if (this.config.augmentationEnabled && !blocked && matches.length > 0) {
        // Filter to only non-blocking matches
        const nonBlockingMatches = matches.filter(m => !m.blocked);

        if (nonBlockingMatches.length > 0) {
          const nonBlockingPolicyIds = nonBlockingMatches.map(m => m.ruleId);
          guidelines = this.augmentation.generateGuidelines(
            nonBlockingMatches,
            nonBlockingPolicyIds
          );
          this.logger.debug(
            `Generated ${guidelines.length} augmentation guidelines from ${nonBlockingMatches.length} non-blocking matches`
          );

          // Record augmentation data in traces
          if (this.tracing && guidelines.length > 0) {
            this.tracing.recordAugmentation(guidelines, nonBlockingMatches, nonBlockingPolicyIds);
          }
        }
      }

      const duration = Date.now() - startTime;
      const uniqueTriggeredPolicies = [...new Set(triggeredPolicies)];
      const uniqueEvaluatedPolicies = [...new Set(evaluatedPolicies)];

      return {
        allowed: !blocked,
        blocked,
        matches,
        transformedInput: transformedContent !== content ? transformedContent : undefined,
        guidelines,
        reason: this.createReasonMessage(matches, blocked),
        evaluationDuration: duration,
        triggeredPolicies: uniqueTriggeredPolicies,
        direction: 'output',
        policyUsage: {
          evaluatedPolicies: uniqueEvaluatedPolicies,
          triggeredPolicies: uniqueTriggeredPolicies,
          evaluationCount: uniqueEvaluatedPolicies.length,
          direction: 'output',
          duration,
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Output guardrails evaluation failed: ${error}`);

      // Handle failure based on failure mode
      if (this.config.failureMode === 'closed') {
        return {
          allowed: false,
          blocked: true,
          matches: [{
            ruleId: 'system-error',
            message: 'Output guardrails evaluation failed',
            blocked: true,
            direction: 'output',
            timestamp: Date.now(),
            metadata: { error: String(error) },
          }],
          reason: 'System error - blocking for safety',
          evaluationDuration: duration,
          triggeredPolicies: ['system-error'],
          direction: 'output',
        };
      } else {
        return {
          allowed: true,
          blocked: false,
          matches: [],
          reason: 'System error - allowing with warning',
          evaluationDuration: duration,
          triggeredPolicies: [],
          direction: 'output',
        };
      }
    }
  }

  /**
   * Augment prompt with policy guidelines
   */
  augmentPrompt(prompt: string, matches: PolicyMatch[]): string {
    if (!this.config.augmentationEnabled) {
      return prompt;
    }

    return this.augmentation.augmentPrompt(prompt, matches);
  }

  /**
   * Create system message with guidelines
   */
  createSystemMessage(matches: PolicyMatch[]): string {
    if (!this.config.augmentationEnabled) {
      return '';
    }

    return this.augmentation.createSystemMessage(matches);
  }

  /**
   * Create reason message from matches
   */
  private createReasonMessage(matches: PolicyMatch[], blocked: boolean): string {
    if (matches.length === 0) {
      return 'No policy matches detected';
    }

    if (blocked) {
      return `Policy matches detected: ${matches.map(v => v.message).join(', ')}`;
    } else {
      return `Policy warnings: ${matches.map(v => v.message).join(', ')}`;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GuardrailsEngineConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.llmService) {
      this.llmFallback.setLLMService(config.llmService);
    }
    
    if (config.llmFallbackEnabled !== undefined) {
      this.llmFallback.setEnabled(config.llmFallbackEnabled);
    }

    this.logger.debug('Guardrails engine configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): GuardrailsEngineConfig {
    return { ...this.config };
  }

  /**
   * Get fast rules engine
   */
  getFastRules(): FastRulesEngine {
    return this.fastRules;
  }

  /**
   * Get policy augmentation engine
   */
  getAugmentation(): PolicyAugmentation {
    return this.augmentation;
  }

  /**
   * Get LLM fallback service
   */
  getLLMFallback(): LLMFallbackService {
    return this.llmFallback;
  }

  /**
   * Load policies from YAML file or API
   */
  private async loadPolicies(): Promise<void> {
    try {
      let policyFile;
      
      if (this.config.apiEndpoint) {
        // Load from API if endpoint is configured
        policyFile = await this.policyLoader.loadFromAPI();
        this.logger.info('Loaded policies from API');
      } else {
        // Load from YAML file
        policyFile = this.config.policyPath 
          ? await this.policyLoader.loadFromYAML(this.config.policyPath)
          : await this.policyLoader.loadDefault();
        this.logger.info('Loaded policies from YAML file');
      }
      
      this.policies = policyFile.policies;
      this.logger.debug(`Loaded ${this.policies.length} policies from ${policyFile.version}`);
    } catch (error) {
      this.logger.warn(`Failed to load policies: ${error}`);
      this.policies = [];
    }
  }

  /**
   * Reload policies dynamically
   */
  async reloadPolicies(): Promise<void> {
    this.logger.info('Reloading policies...');
    
    await this.loadPolicies();
    await this.fastRules.reloadPolicies(this.config.policyPath);
    await this.augmentation.initialize(this.policies);
    
    if (this.config.llmFallbackEnabled) {
      await this.llmFallback.initialize(this.policies);
    }
    
    this.logger.info(`Policies reloaded successfully (${this.policies.length} policies)`);
  }

  /**
   * Get loaded policies
   */
  getPolicies(): PolicyDefinition[] {
    return [...this.policies];
  }

  /**
   * Get policy statistics
   */
  getPolicyStats(): {
    totalPolicies: number;
    fastRulesStats: { yaml: number; legacy: number };
    augmentationStats: { yamlInitialized: boolean; policyCount: number };
  } {
    return {
      totalPolicies: this.policies.length,
      fastRulesStats: this.fastRules.getPolicyCount(),
      augmentationStats: {
        yamlInitialized: this.augmentation.isYAMLInitialized(),
        policyCount: this.augmentation.getPolicyGuidelinesCount(),
      },
    };
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    GuardrailsEngine.instance = null;
  }
}