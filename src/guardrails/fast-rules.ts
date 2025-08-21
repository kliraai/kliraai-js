/**
 * Fast rules engine for pattern-based policy evaluation
 */

import type { PolicyRule, PolicyViolation, Logger } from '../types/index.js';
import { getLogger } from '../config/index.js';

export interface FastRulePattern {
  id: string;
  pattern: RegExp;
  action: 'block' | 'warn' | 'transform';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  replacement?: string;
}

export class FastRulesEngine {
  private rules: FastRulePattern[] = [];
  private logger: Logger;

  constructor() {
    this.logger = getLogger();
    this.initializeDefaultRules();
  }

  /**
   * Initialize with default security and compliance rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: FastRulePattern[] = [
      // PII Detection
      {
        id: 'pii-email',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        action: 'block',
        severity: 'high',
        description: 'Email address detected',
        replacement: '[EMAIL_REDACTED]',
      },
      {
        id: 'pii-ssn',
        pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
        action: 'block',
        severity: 'critical',
        description: 'Social Security Number pattern detected',
        replacement: '[SSN_REDACTED]',
      },
      {
        id: 'pii-phone',
        pattern: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
        action: 'warn',
        severity: 'medium',
        description: 'Phone number pattern detected',
        replacement: '[PHONE_REDACTED]',
      },
      {
        id: 'pii-credit-card',
        pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
        action: 'block',
        severity: 'critical',
        description: 'Credit card number pattern detected',
        replacement: '[CARD_REDACTED]',
      },

      // Content Safety
      {
        id: 'harmful-violence',
        pattern: /\b(kill|murder|assault|violence|harm|hurt|attack)\b/gi,
        action: 'warn',
        severity: 'high',
        description: 'Potentially violent content detected',
      },
      {
        id: 'harmful-illegal',
        pattern: /\b(drugs|illegal|hack|exploit|malware|virus)\b/gi,
        action: 'warn',
        severity: 'medium',
        description: 'Potentially illegal content detected',
      },

      // Prompt Injection
      {
        id: 'prompt-injection-ignore',
        pattern: /ignore\s+(previous|all|the)\s+(instructions?|prompts?|rules?)/gi,
        action: 'block',
        severity: 'high',
        description: 'Prompt injection attempt detected',
      },
      {
        id: 'prompt-injection-system',
        pattern: /\b(system|assistant|user):\s*$/gim,
        action: 'warn',
        severity: 'medium',
        description: 'Potential system prompt manipulation',
      },

      // API Keys and Secrets
      {
        id: 'secret-api-key',
        pattern: /\b[A-Za-z0-9]{32,}\b/g,
        action: 'block',
        severity: 'critical',
        description: 'Potential API key or secret detected',
        replacement: '[SECRET_REDACTED]',
      },
    ];

    this.rules = defaultRules;
    this.logger.debug(`Initialized ${defaultRules.length} default fast rules`);
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
   * Evaluate content against all rules
   */
  evaluate(content: string): {
    violations: PolicyViolation[];
    transformedContent: string;
    blocked: boolean;
  } {
    const violations: PolicyViolation[] = [];
    let transformedContent = content;
    let blocked = false;

    for (const rule of this.rules) {
      const matches = content.match(rule.pattern);
      
      if (matches) {
        this.logger.debug(`Rule ${rule.id} triggered with ${matches.length} matches`);

        // Create violation
        const violation: PolicyViolation = {
          ruleId: rule.id,
          message: rule.description,
          severity: rule.severity,
          blocked: rule.action === 'block',
          metadata: {
            matches: matches.length,
            matchedText: matches.slice(0, 3), // First 3 matches for logging
          },
        };

        violations.push(violation);

        // Apply action
        if (rule.action === 'block') {
          blocked = true;
        } else if (rule.action === 'transform' && rule.replacement) {
          transformedContent = transformedContent.replace(rule.pattern, rule.replacement);
          violation.transformedContent = transformedContent;
        }
      }
    }

    return {
      violations,
      transformedContent,
      blocked,
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
            severity: rule.severity,
            description: rule.description,
          };
          this.addRule(fastRule);
        } catch (error) {
          this.logger.error(`Failed to load rule ${rule.id}: ${error}`);
        }
      }
    }
  }
}