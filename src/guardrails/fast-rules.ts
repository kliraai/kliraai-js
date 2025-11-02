/**
 * Fast rules engine for pattern-based policy evaluation
 */

import type { PolicyRule, PolicyMatch, Logger } from '../types/index.js';
import { getLogger } from '../config/index.js';
import { PolicyLoader, PolicyCache } from './policy-loader.js';
import { CompiledPolicy, PolicyEvaluationResult } from '../types/policies.js';
import { FuzzyMatcher } from './fuzzy-matcher.js';

export interface FastRulePattern {
  id: string;
  pattern: RegExp;
  action: 'block' | 'warn' | 'allow';
  description: string;
}

export class FastRulesEngine {
  private rules: FastRulePattern[] = [];
  private policies: CompiledPolicy[] = [];
  private policyLoader: PolicyLoader;
  private policyCache: PolicyCache;
  private logger: Logger;
  private initialized: boolean = false;
  private fuzzyMatcher: FuzzyMatcher;

  constructor() {
    this.logger = getLogger();
    this.policyLoader = new PolicyLoader();
    this.policyCache = new PolicyCache();
    this.fuzzyMatcher = new FuzzyMatcher();
    this.initializeDefaultRules();
  }

  /**
   * Initialize with default security and compliance rules
   */
  private initializeDefaultRules(): void {
    // Hardcoded fallback rules have been removed - YAML policies are now required
    this.rules = [];
    this.logger.debug('FastRulesEngine initialized without hardcoded rules - YAML policies required');
  }

  /**
   * Add a custom rule
   */
  addRule(rule: FastRulePattern): void {
    this.rules.push(rule);
    this.logger.debug(`Added custom rule: ${rule.id}`);
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId: string): void {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(rule => rule.id !== ruleId);
    
    if (this.rules.length < initialLength) {
      this.logger.debug(`Removed rule: ${ruleId}`);
    }
  }

  /**
   * Initialize with YAML policies
   */
  async initialize(configPath?: string): Promise<void> {
    try {
      const policyFile = configPath
        ? await this.policyLoader.loadFromYAML(configPath)
        : await this.policyLoader.loadDefault();

      this.policies = this.policyLoader.compilePolicies(policyFile.policies);
      this.initialized = true;

      this.logger.info(`Initialized FastRulesEngine with ${this.policies.length} YAML policies`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to load YAML policies: ${errorMessage}`);
      throw new Error(
        `FastRulesEngine initialization failed - YAML policy files are required but could not be loaded. ` +
        `Error: ${errorMessage}. ` +
        `Please ensure the SDK is properly built and distributed with policy files.`
      );
    }
  }

  /**
   * Evaluate content with direction awareness (inbound/outbound)
   */
  evaluateWithDirection(content: string, direction: 'inbound' | 'outbound'): PolicyEvaluationResult {
    const startTime = Date.now();
    
    // If YAML policies are loaded, use them
    if (this.initialized && this.policies.length > 0) {
      return this.evaluateYAMLPolicies(content, direction, startTime);
    }
    
    // Fallback to legacy hardcoded rules
    return this.evaluateLegacyRules(content, startTime);
  }

  /**
   * Evaluate content against YAML policies
   */
  private evaluateYAMLPolicies(content: string, direction: 'inbound' | 'outbound', startTime: number): PolicyEvaluationResult {
    const matches: PolicyMatch[] = [];
    let transformedContent = content;
    let blocked = false;
    const matchedPolicies: string[] = [];

    // Filter policies by direction
    const applicablePolicies = this.policies.filter(policy =>
      policy.direction === 'both' || policy.direction === direction
    );

    for (const policy of applicablePolicies) {
      let policyMatched = false;

      // Check compiled regex patterns
      if (policy.compiledPatterns) {
        for (const pattern of policy.compiledPatterns) {
          const matchResults = content.match(pattern);
          if (matchResults) {
            policyMatched = true;
            this.addPolicyMatch(matches, policy, matchResults, 'pattern');

            if (policy.action === 'block') {
              blocked = true;
            }
            break;
          }
        }
      }

      // Check domain patterns
      if (!policyMatched && policy.domainPatterns) {
        for (const domainPattern of policy.domainPatterns) {
          const matchResults = content.match(domainPattern);
          if (matchResults) {
            policyMatched = true;
            this.addPolicyMatch(matches, policy, matchResults, 'domain');

            if (policy.action === 'block') {
              blocked = true;
            }
            break;
          }
        }
      }

      // NEW: Fuzzy matching layer (only if no regex/domain match)
      if (!policyMatched && policy.domains && this.fuzzyMatcher.isEnabled()) {
        const fuzzyMatches = this.fuzzyMatcher.checkFuzzyMatch(
          content,
          policy.domains,
          70 // Threshold: 70% minimum
        );

        if (fuzzyMatches.length > 0) {
          policyMatched = true;

          // Get highest similarity match
          const bestMatch = fuzzyMatches.reduce((prev, current) =>
            current.similarity > prev.similarity ? current : prev
          );

          // Calculate confidence based on similarity
          const confidence = this.fuzzyMatcher.calculateConfidence(bestMatch.similarity);

          // Create match with fuzzy match metadata
          const match: PolicyMatch = {
            ruleId: policy.id,
            message: `${policy.description} (fuzzy match: ${bestMatch.similarity}% similar to "${bestMatch.domain}")`,
            blocked: policy.action === 'block',
            matched: bestMatch.matchedText,
            metadata: {
              matchType: 'fuzzy',
              similarity: bestMatch.similarity,
              confidence,
              matchedDomain: bestMatch.domain,
            },
          };

          matches.push(match);
          this.logger.debug(
            `Policy ${policy.id} triggered via fuzzy matching (${bestMatch.similarity}% similarity)`
          );

          // Only block if confidence is high enough (≥90% similarity = 0.55 confidence)
          if (policy.action === 'block' && confidence >= 0.55) {
            blocked = true;
          }
        }
      }

      if (policyMatched) {
        matchedPolicies.push(policy.id);
      }
    }

    return {
      matches,
      blocked,
      allowed: !blocked,
      transformedContent,
      matchedPolicies,
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Add policy match from YAML policy match
   */
  private addPolicyMatch(
    matches: PolicyMatch[],
    policy: CompiledPolicy,
    matchResults: RegExpMatchArray,
    matchType: 'pattern' | 'domain'
  ): void {
    const match: PolicyMatch = {
      ruleId: policy.id,
      message: policy.description,
      blocked: policy.action === 'block',
      matched: matchResults[0],
    };

    if (matchResults.index !== undefined) {
      match.position = {
        start: matchResults.index,
        end: matchResults.index + matchResults[0].length,
      };
    }

    matches.push(match);
    this.logger.debug(`Policy ${policy.id} triggered (${matchType}): ${matchResults[0]}`);
  }

  /**
   * Evaluate content against legacy hardcoded rules
   */
  private evaluateLegacyRules(content: string, startTime: number): PolicyEvaluationResult {
    const legacyResult = this.evaluate(content);

    return {
      matches: legacyResult.matches,
      blocked: legacyResult.blocked,
      allowed: !legacyResult.blocked,
      transformedContent: legacyResult.transformedContent,
      matchedPolicies: legacyResult.matches.map(v => v.ruleId),
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Evaluate content against all rules (legacy method)
   */
  evaluate(content: string): {
    matches: PolicyMatch[];
    transformedContent: string;
    blocked: boolean;
    allowed: boolean;
  } {
    const matches: PolicyMatch[] = [];
    const transformedContent = content; // Never modified - content is unchanged
    let blocked = false;

    for (const rule of this.rules) {
      const matchResults = content.match(rule.pattern);

      if (matchResults) {
        this.logger.debug(`Rule ${rule.id} triggered with ${matchResults.length} matches`);

        // Create match
        const match: PolicyMatch = {
          ruleId: rule.id,
          message: rule.description,
          blocked: rule.action === 'block',
          metadata: {
            matches: matchResults.length,
            matchedText: matchResults.slice(0, 3), // First 3 matches for logging
          },
        };

        matches.push(match);

        // Apply action (simplified - only track blocking)
        if (rule.action === 'block') {
          blocked = true;
        }
        // 'warn' and 'allow' actions just create matches, don't block
      }
    }

    return {
      matches,
      transformedContent, // Always equals input content
      blocked,
      allowed: !blocked,
    };
  }

  /**
   * Get all rule IDs
   */
  getRuleIds(): string[] {
    return this.rules.map(rule => rule.id);
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): FastRulePattern | undefined {
    return this.rules.find(rule => rule.id === ruleId);
  }

  /**
   * Enable/disable specific rules
   */
  toggleRule(ruleId: string, enabled: boolean): void {
    // For now, we remove/add rules to toggle them
    // In a more sophisticated implementation, we'd have an enabled flag
    if (!enabled) {
      this.removeRule(ruleId);
    }
  }

  /**
   * Load rules from configuration
   */
  loadRules(rules: PolicyRule[]): void {
    for (const rule of rules) {
      if (rule.pattern) {
        try {
          const fastRule: FastRulePattern = {
            id: rule.id,
            pattern: new RegExp(rule.pattern, 'gi'),
            action: rule.action,
            description: rule.description,
          };
          this.addRule(fastRule);
        } catch (error) {
          this.logger.error(`Failed to load rule ${rule.id}: ${error}`);
        }
      }
    }
  }

  /**
   * Reload policies from YAML (for dynamic updates)
   */
  async reloadPolicies(configPath?: string): Promise<void> {
    this.policyCache.clear();
    await this.initialize(configPath);
  }

  /**
   * Get loaded policy count
   */
  getPolicyCount(): { yaml: number; legacy: number } {
    return {
      yaml: this.policies.length,
      legacy: 0, // Hardcoded rules have been removed
    };
  }

  /**
   * Get all policy IDs (for compliance tracking)
   */
  getPolicyIds(): string[] {
    const yamlPolicyIds = this.policies.map(policy => policy.id);
    const legacyRuleIds = this.rules.map(rule => rule.id);
    return [...yamlPolicyIds, ...legacyRuleIds];
  }

  /**
   * Check if YAML policies are loaded
   */
  isYAMLInitialized(): boolean {
    return this.initialized && this.policies.length > 0;
  }

  /**
   * Get fuzzy matcher instance
   */
  getFuzzyMatcher(): FuzzyMatcher {
    return this.fuzzyMatcher;
  }
}