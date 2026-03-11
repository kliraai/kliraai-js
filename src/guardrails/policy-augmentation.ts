/**
 * Klira SDK v2 — Policy augmentation.
 *
 * Generates guidelines from matched policies. Guidelines are passed
 * explicitly in the result (Learning #7: never via OTel context).
 */

import type { PolicyDefinition, PolicyMatch } from '../types/index.js';

const MAX_GUIDELINES = 10;

export class PolicyAugmentation {
  private policyGuidelines = new Map<string, string[]>();

  initialize(policies: PolicyDefinition[]): void {
    this.policyGuidelines.clear();
    for (const policy of policies) {
      const guidelines: string[] = [];
      if (policy.description) {
        guidelines.push(policy.description);
      }
      for (const rule of policy.rules ?? []) {
        if (rule.message) guidelines.push(rule.message);
      }
      if (guidelines.length > 0) {
        this.policyGuidelines.set(policy.name, guidelines);
      }
    }
  }

  /**
   * Generate guidelines from matches. Returns explicit string[] (never via OTel context).
   */
  generateGuidelines(
    matches: readonly PolicyMatch[],
    triggeredPolicies: readonly string[],
  ): string[] {
    const guidelines: string[] = [];
    const processed = new Set<string>();

    // First pass: triggered policy IDs
    for (const policyId of triggeredPolicies) {
      if (processed.has(policyId)) continue;
      processed.add(policyId);
      const policyGuidelines = this.policyGuidelines.get(policyId);
      if (policyGuidelines) {
        guidelines.push(...policyGuidelines);
      }
    }

    // Second pass: match rule IDs
    for (const match of matches) {
      if (processed.has(match.ruleId)) continue;
      processed.add(match.ruleId);
      const policyGuidelines = this.policyGuidelines.get(match.ruleId);
      if (policyGuidelines) {
        guidelines.push(...policyGuidelines);
      }
    }

    // Fallback if no guidelines found
    if (guidelines.length === 0 && matches.length > 0) {
      guidelines.push(
        'Follow applicable safety and compliance guidelines.',
        'Ensure responses are appropriate and compliant.',
        'Adhere to organizational policies in your response.',
      );
    }

    // Deduplicate and cap
    const unique = [...new Set(guidelines)];
    return unique.slice(0, MAX_GUIDELINES);
  }

  /**
   * Augment a prompt with guidelines (append instructions).
   */
  augmentPrompt(originalPrompt: string, guidelines: readonly string[]): string {
    if (guidelines.length === 0) return originalPrompt;

    const numbered = guidelines.map((g, i) => `${i + 1}. ${g}`).join('\n');
    return `${originalPrompt}\n\nIMPORTANT GUIDELINES:\n${numbered}\n\nPlease follow these guidelines in your response.`;
  }
}
