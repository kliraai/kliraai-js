/**
 * Fuzzy String Matching for Guardrails
 *
 * Provides fuzzy string matching capabilities to catch typos, character substitutions,
 * and variations that bypass exact pattern matching.
 * Matches Python SDK implementation at fast_rules.py:680-726
 */

import levenshtein from 'fast-levenshtein';
import type { Logger } from '../types/index.js';
import { getLogger } from '../config/index.js';

export interface FuzzyMatch {
  domain: string;
  matchedText: string;
  similarity: number; // 0-100 percentage
}

export interface FuzzyMatcherConfig {
  threshold?: number; // Default: 70 (minimum similarity to match)
  enabled?: boolean;  // Default: true
}

export class FuzzyMatcher {
  private threshold: number;
  private enabled: boolean;
  private logger: Logger;

  constructor(config: FuzzyMatcherConfig = {}) {
    this.threshold = config.threshold ?? 70;
    this.enabled = config.enabled ?? true;
    this.logger = getLogger();

    if (this.enabled) {
      this.logger.debug(`FuzzyMatcher initialized with threshold: ${this.threshold}%`);
    }
  }

  /**
   * Check if message fuzzy matches any domain patterns
   * Matches Python SDK behavior at fast_rules.py:698-726
   */
  checkFuzzyMatch(
    message: string,
    domains: string[],
    threshold?: number
  ): FuzzyMatch[] {
    if (!this.enabled) {
      return [];
    }

    const matchThreshold = threshold ?? this.threshold;
    const matches: FuzzyMatch[] = [];

    // Normalize message to lowercase for comparison
    const normalizedMessage = message.toLowerCase();

    for (const domain of domains) {
      const normalizedDomain = domain.toLowerCase();

      // Calculate similarity percentage
      const distance = levenshtein.get(normalizedMessage, normalizedDomain);
      const maxLength = Math.max(normalizedMessage.length, normalizedDomain.length);
      const similarity = ((maxLength - distance) / maxLength) * 100;

      if (similarity >= matchThreshold) {
        matches.push({
          domain,
          matchedText: message,
          similarity: Math.round(similarity),
        });

        this.logger.debug(
          `Fuzzy match: "${message}" ~= "${domain}" (${similarity.toFixed(1)}% similarity)`
        );
      }
    }

    return matches;
  }

  /**
   * Calculate confidence score based on similarity
   * Matches Python SDK tiers at fast_rules.py:719-725
   */
  calculateConfidence(similarity: number): number {
    if (similarity >= 90) {
      return 0.55; // Above blocking threshold
    } else if (similarity >= 80) {
      return 0.45; // Below blocking threshold
    } else {
      return 0.35; // Low confidence (70-79% similarity)
    }
  }

  /**
   * Enable/disable fuzzy matching
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger.debug(`FuzzyMatcher ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Update threshold
   */
  setThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }
    this.threshold = threshold;
    this.logger.debug(`FuzzyMatcher threshold updated to ${threshold}%`);
  }

  /**
   * Check if fuzzy matching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
