/**
 * Main guardrails engine orchestrating all policy evaluation components
 */

import type { 
  PolicyViolation, 
  GuardrailResult, 
  GuardrailOptions, 
  Logger 
} from '../types/index.js';
import { getLogger } from '../config/index.js';
import { FastRulesEngine } from './fast-rules.js';
import { PolicyAugmentation } from './policy-augmentation.js';
import { LLMFallbackService, type LLMService } from './llm-fallback.js';

export interface GuardrailsEngineConfig {
  fastRulesEnabled?: boolean;
  augmentationEnabled?: boolean;
  llmFallbackEnabled?: boolean;
  llmService?: LLMService;
  failureMode?: 'open' | 'closed'; // fail open (allow) or closed (block) on errors
}

export class GuardrailsEngine {
  private static instance: GuardrailsEngine | null = null;
  
  private fastRules: FastRulesEngine;
  private augmentation: PolicyAugmentation;
  private llmFallback: LLMFallbackService;
  private config: GuardrailsEngineConfig;
  private logger: Logger;
  private initialized: boolean = false;

  private constructor(config: GuardrailsEngineConfig = {}) {
    this.config = {
      fastRulesEnabled: true,
      augmentationEnabled: true,
      llmFallbackEnabled: false,
      failureMode: 'open',
      ...config,
    };

    this.logger = getLogger();
    this.fastRules = new FastRulesEngine();
    this.augmentation = new PolicyAugmentation();
    this.llmFallback = new LLMFallbackService();

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
   * Initialize the engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info('Initializing Guardrails Engine...');
      
      // Load any custom rules or configurations here
      // await this.loadCustomPolicies();
      
      this.initialized = true;
      this.logger.info('Guardrails Engine initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Guardrails Engine: ${error}`);
      throw error;
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

    try {
      const violations: PolicyViolation[] = [];
      let transformedContent = content;
      let blocked = false;

      // Layer 1: Fast Rules (pattern matching)
      if (this.config.fastRulesEnabled) {
        const fastResult = this.fastRules.evaluate(content);
        violations.push(...fastResult.violations);
        transformedContent = fastResult.transformedContent;
        blocked = blocked || fastResult.blocked;

        this.logger.debug(`Fast rules found ${fastResult.violations.length} violations`);
      }

      // Layer 2: LLM Fallback (for complex evaluation)
      if (this.config.llmFallbackEnabled && !blocked) {
        const llmResult = await this.llmFallback.evaluateWithLLM(
          transformedContent,
          violations,
          { options }
        );

        if (llmResult) {
          violations.push(...llmResult.violations);
          blocked = blocked || !llmResult.safe;
          
          if (llmResult.modifiedContent) {
            transformedContent = llmResult.modifiedContent;
          }

          this.logger.debug(`LLM fallback evaluation: safe=${llmResult.safe}, confidence=${llmResult.confidence}`);
        }
      }

      // Layer 3: Generate augmentation guidelines
      let guidelines: string[] = [];
      if (this.config.augmentationEnabled && violations.length > 0) {
        guidelines = this.augmentation.generateGuidelines(violations);
        this.logger.debug(`Generated ${guidelines.length} augmentation guidelines`);
      }

      return {
        allowed: !blocked,
        blocked,
        violations,
        transformedInput: transformedContent !== content ? transformedContent : undefined,
        guidelines,
        reason: this.createReasonMessage(violations, blocked),
      };

    } catch (error) {
      this.logger.error(`Guardrails evaluation failed: ${error}`);
      
      // Handle failure based on failure mode
      if (this.config.failureMode === 'closed') {
        return {
          allowed: false,
          blocked: true,
          violations: [{
            ruleId: 'system-error',
            message: 'Guardrails evaluation failed',
            severity: 'high',
            blocked: true,
            metadata: { error: String(error) },
          }],
          reason: 'System error - blocking for safety',
        };
      } else {
        return {
          allowed: true,
          blocked: false,
          violations: [],
          reason: 'System error - allowing with warning',
        };
      }
    }
  }

  /**
   * Evaluate output content
   */
  async evaluateOutput(
    content: string,
    options: GuardrailOptions = {}
  ): Promise<GuardrailResult> {
    // For now, use the same evaluation logic as input
    // In the future, we might have different rules for output
    return this.evaluateInput(content, options);
  }

  /**
   * Augment prompt with policy guidelines
   */
  augmentPrompt(prompt: string, violations: PolicyViolation[]): string {
    if (!this.config.augmentationEnabled) {
      return prompt;
    }

    return this.augmentation.augmentPrompt(prompt, violations);
  }

  /**
   * Create system message with guidelines
   */
  createSystemMessage(violations: PolicyViolation[]): string {
    if (!this.config.augmentationEnabled) {
      return '';
    }

    return this.augmentation.createSystemMessage(violations);
  }

  /**
   * Create reason message from violations
   */
  private createReasonMessage(violations: PolicyViolation[], blocked: boolean): string {
    if (violations.length === 0) {
      return 'No policy violations detected';
    }

    const criticalViolations = violations.filter(v => v.severity === 'critical');
    const highViolations = violations.filter(v => v.severity === 'high');

    if (blocked) {
      if (criticalViolations.length > 0) {
        return `Critical policy violations detected: ${criticalViolations.map(v => v.message).join(', ')}`;
      } else if (highViolations.length > 0) {
        return `High-severity policy violations detected: ${highViolations.map(v => v.message).join(', ')}`;
      } else {
        return `Policy violations detected: ${violations.map(v => v.message).join(', ')}`;
      }
    } else {
      return `Policy warnings: ${violations.map(v => v.message).join(', ')}`;
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
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    GuardrailsEngine.instance = null;
  }
}