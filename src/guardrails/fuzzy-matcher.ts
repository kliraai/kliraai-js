/**
 * Klira SDK v2 — Fuzzy matcher with 85% threshold.
 *
 * Levenshtein-based matching. Single threshold: 85% (raised from v1's 70%).
 */

import levenshtein from 'fast-levenshtein';

export interface FuzzyMatch {
  readonly domain: string;
  readonly matchedText: string;
  readonly similarity: number;
}

const DEFAULT_THRESHOLD = 85;

export class FuzzyMatcher {
  private threshold: number;
  private enabled = true;

  constructor(threshold: number = DEFAULT_THRESHOLD) {
    this.threshold = threshold;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  checkFuzzyMatch(
    message: string,
    domains: readonly string[],
    threshold?: number,
  ): FuzzyMatch[] {
    if (!this.enabled || !message || domains.length === 0) return [];

    const effectiveThreshold = threshold ?? this.threshold;
    const normalizedMessage = message.toLowerCase();
    const matches: FuzzyMatch[] = [];

    for (const domain of domains) {
      const normalizedDomain = domain.toLowerCase();
      const distance = levenshtein.get(normalizedMessage, normalizedDomain);
      const maxLength = Math.max(normalizedMessage.length, normalizedDomain.length);
      if (maxLength === 0) continue;

      const similarity = Math.round(((maxLength - distance) / maxLength) * 100);

      if (similarity >= effectiveThreshold) {
        matches.push({ domain, matchedText: message, similarity });
      }
    }

    return matches;
  }

  calculateConfidence(similarity: number): number {
    if (similarity >= 95) return 0.95;
    if (similarity >= 90) return 0.90;
    if (similarity >= 85) return 0.85;
    return 0.70;
  }
}
