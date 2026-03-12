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
    const matches: FuzzyMatch[] = [];

    // Tokenize the message into words and n-grams matching domain keyword lengths.
    // Comparing the full message against a short keyword would always yield ~0% similarity.
    const tokens = this.tokenize(message);

    for (const domain of domains) {
      const normalizedDomain = domain.toLowerCase();
      const domainTokenCount = normalizedDomain.split(/\s+/).length;

      // Build n-grams from message tokens matching the domain's word count
      const ngrams = domainTokenCount > 1
        ? this.buildNgrams(tokens, domainTokenCount)
        : tokens.map((t) => t);

      for (const ngram of ngrams) {
        const distance = levenshtein.get(ngram, normalizedDomain);
        const maxLength = Math.max(ngram.length, normalizedDomain.length);
        if (maxLength === 0) continue;

        const similarity = Math.round(((maxLength - distance) / maxLength) * 100);

        if (similarity >= effectiveThreshold) {
          matches.push({ domain, matchedText: ngram, similarity });
          break; // One match per domain is sufficient
        }
      }
    }

    return matches;
  }

  private tokenize(message: string): string[] {
    return message.toLowerCase().split(/\s+/).filter(Boolean);
  }

  private buildNgrams(tokens: string[], n: number): string[] {
    const ngrams: string[] = [];
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.push(tokens.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  calculateConfidence(similarity: number): number {
    if (similarity >= 95) return 0.95;
    if (similarity >= 90) return 0.90;
    if (similarity >= 85) return 0.85;
    return 0.70;
  }
}
