/**
 * Main guardrails engine orchestrating all policy evaluation components
 */

import type { 
  PolicyViolation, 
  GuardrailResult, 
  GuardrailOptions, 
  Logger,
  PolicyUsageInfo
} from '../types/index.js';
import { getLogger } from '../config/index.js';
import { FastRulesEngine } from './fast-rules.js';
import { PolicyAugmentation } from './policy-augmentation.js';
import { LLMFallbackService, type LLMService } from './llm-fallback.js';
import { PolicyLoader } from './policy-loader.js';
import { PolicyDefinition } from '../types/policies.js';

export interface GuardrailsEngineConfig {
  fastRulesEnabled?: boolean;
  augmentationEnabled?: boolean;
  llmFallbackEnabled?: boolean;
  llmService?: LLMService;
  failureMode?: 'open' | 'closed'; // fail open (allow) or closed (block) on errors
  policyPath?: string; // Path to YAML policy file
  apiEndpoint?: string; // API endpoint for dynamic policy loading
  apiKey?: string; // API key for policy loading
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
      const violations: PolicyViolation[] = [];
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
        const violatedPolicies = fastResult.violations.map(v => v.ruleId);
        triggeredPolicies.push(...violatedPolicies);
        
        violations.push(...fastResult.violations.map(v => ({
          ...v,
          direction: 'input',
          timestamp: Date.now(),
        })));
        
        transformedContent = 'transformedContent' in fastResult 
          ? fastResult.transformedContent 
          : content;
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
          const llmPolicies = ['llm-content-safety', 'llm-policy-check'];
          evaluatedPolicies.push(...llmPolicies);
          
          const llmTriggeredPolicies = llmResult.violations.map(v => v.ruleId);
          triggeredPolicies.push(...llmTriggeredPolicies);
          
          violations.push(...llmResult.violations.map(v => ({
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
      let guidelines: string[] = [];
      if (this.config.augmentationEnabled && violations.length > 0) {
        guidelines = this.augmentation.generateGuidelines(violations);
        this.logger.debug(`Generated ${guidelines.length} augmentation guidelines`);
      }

      const duration = Date.now() - startTime;
      const uniqueTriggeredPolicies = [...new Set(triggeredPolicies)];
      const uniqueEvaluatedPolicies = [...new Set(evaluatedPolicies)];

      return {
        allowed: !blocked,
        blocked,
        violations,
        transformedInput: transformedContent !== content ? transformedContent : undefined,
        guidelines,
        reason: this.createReasonMessage(violations, blocked),
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
          violations: [{
            ruleId: 'system-error',
            message: 'Guardrails evaluation failed',
            severity: 'high',
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
          violations: [],
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
      const violations: PolicyViolation[] = [];
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
        const violatedPolicies = fastResult.violations.map(v => v.ruleId);
        triggeredPolicies.push(...violatedPolicies);
        
        violations.push(...fastResult.violations.map(v => ({
          ...v,
          direction: 'output',
          timestamp: Date.now(),
        })));
        
        transformedContent = 'transformedContent' in fastResult 
          ? fastResult.transformedContent 
          : content;
        blocked = blocked || fastResult.blocked;

        this.logger.debug(`Fast rules (output) found ${fastResult.violations.length} violations`);
      }

      // Layer 2: LLM Fallback (for complex evaluation)
      if (this.config.llmFallbackEnabled && !blocked) {
        const llmResult = await this.llmFallback.evaluateWithLLM(
          transformedContent,
          violations,
          { options, direction: 'outbound' }
        );

        if (llmResult) {
          const llmPolicies = ['llm-content-safety', 'llm-policy-check'];
          evaluatedPolicies.push(...llmPolicies);
          
          const llmTriggeredPolicies = llmResult.violations.map(v => v.ruleId);
          triggeredPolicies.push(...llmTriggeredPolicies);
          
          violations.push(...llmResult.violations.map(v => ({
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
      let guidelines: string[] = [];
      if (this.config.augmentationEnabled && violations.length > 0) {
        guidelines = this.augmentation.generateGuidelines(violations);
        this.logger.debug(`Generated ${guidelines.length} augmentation guidelines`);
      }

      const duration = Date.now() - startTime;
      const uniqueTriggeredPolicies = [...new Set(triggeredPolicies)];
      const uniqueEvaluatedPolicies = [...new Set(evaluatedPolicies)];

      return {
        allowed: !blocked,
        blocked,
        violations,
        transformedInput: transformedContent !== content ? transformedContent : undefined,
        guidelines,
        reason: this.createReasonMessage(violations, blocked),
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
          violations: [{
            ruleId: 'system-error',
            message: 'Output guardrails evaluation failed',
            severity: 'high',
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
          violations: [],
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