/**
 * Klira SDK v2 — Fast rules engine.
 *
 * Regex + domain keywords + fuzzy matching at 85% threshold.
 * Three match types: exact (regex), domain (keyword boundary), fuzzy (Levenshtein).
 */

import type { PolicyMatch, PolicyDefinition } from '../types/index.js';
import { FuzzyMatcher } from './fuzzy-matcher.js';
import { type CompiledPolicy, compilePolicies, loadPoliciesFromYAML, loadDefaultPolicies } from './policy-loader.js';

export interface FastRulesResult {
  readonly matches: PolicyMatch[];
  readonly blocked: boolean;
  readonly allowed: boolean;
}

export class FastRulesEngine {
  private compiledPolicies: CompiledPolicy[] = [];
  private fuzzyMatcher: FuzzyMatcher;
  private initialized = false;

  constructor(fuzzyThreshold: number = 85) {
    this.fuzzyMatcher = new FuzzyMatcher(fuzzyThreshold);
  }

  initialize(policies: PolicyDefinition[]): void {
    this.compiledPolicies = compilePolicies(policies);
    this.initialized = true;
  }

  initializeFromPath(policyPath?: string): void {
    const policies = policyPath
      ? loadPoliciesFromYAML(policyPath)
      : loadDefaultPolicies();
    this.initialize(policies);
  }

  evaluate(content: string, direction: 'inbound' | 'outbound'): FastRulesResult {
    if (!this.initialized || this.compiledPolicies.length === 0) {
      return { matches: [], blocked: false, allowed: true };
    }

    const matches: PolicyMatch[] = [];
    let blocked = false;

    // Filter policies by direction
    const applicablePolicies = this.compiledPolicies.filter(
      (cp) => cp.definition.direction === 'both' || cp.definition.direction === direction,
    );

    for (const cp of applicablePolicies) {
      const policy = cp.definition;
      let matched = false;

      // Layer 1: Compiled regex patterns
      for (const pattern of cp.compiledPatterns) {
        pattern.lastIndex = 0; // Reset stateful regex
        const match = content.match(pattern);
        if (match) {
          const m = this.createMatch(policy, match[0], content.indexOf(match[0]));
          matches.push(m);
          if (policy.rules[0]?.action === 'block') blocked = true;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // Layer 2: Domain keyword boundary matching
      for (const domainPattern of cp.domainPatterns) {
        domainPattern.lastIndex = 0;
        const match = content.match(domainPattern);
        if (match) {
          const m = this.createMatch(policy, match[0], content.indexOf(match[0]));
          matches.push(m);
          if (policy.rules[0]?.action === 'block') blocked = true;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // Layer 3: Fuzzy matching at 85% threshold
      if (this.fuzzyMatcher.isEnabled() && cp.domains.length > 0) {
        const fuzzyMatches = this.fuzzyMatcher.checkFuzzyMatch(content, cp.domains);
        if (fuzzyMatches.length > 0) {
          const best = fuzzyMatches.reduce((a, b) => (a.similarity > b.similarity ? a : b));
          const confidence = this.fuzzyMatcher.calculateConfidence(best.similarity);
          const m: PolicyMatch = {
            ruleId: policy.name,
            message: `Fuzzy match: "${best.domain}" (${best.similarity}% similarity)`,
            blocked: policy.rules[0]?.action === 'block' && confidence >= 0.85,
            matched: best.matchedText,
            metadata: { similarity: best.similarity, confidence, matchType: 'fuzzy' },
            direction: direction === 'inbound' ? 'input' : 'output',
          };
          matches.push(m);
          if (m.blocked) blocked = true;
        }
      }
    }

    return { matches, blocked, allowed: !blocked };
  }

  private createMatch(policy: PolicyDefinition, matchedText: string, position: number): PolicyMatch {
    return {
      ruleId: policy.name,
      message: policy.description ?? `Policy ${policy.name} matched`,
      blocked: policy.rules[0]?.action === 'block',
      matched: matchedText,
      policyName: policy.name,
      direction: policy.direction === 'inbound' ? 'input' : 'output',
      position: { start: position, end: position + matchedText.length },
    };
  }

  getPolicyCount(): number {
    return this.compiledPolicies.length;
  }
}
