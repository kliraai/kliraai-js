/**
 * Klira SDK v2 — LLM fallback service.
 *
 * Only runs when fast rules produce zero matches. Uses OpenAI as catch-all.
 */

import type { PolicyMatch } from '../types/index.js';

export interface LLMService {
  evaluate(content: string, direction: string): Promise<{
    allowed: boolean;
    blocked: boolean;
    matches: PolicyMatch[];
    modifiedContent?: string;
  }>;
}

export interface LLMFallbackOptions {
  service: LLMService;
}

export class LLMFallbackService {
  private service: LLMService | null = null;
  private enabled = false;

  configure(service: LLMService): void {
    this.service = service;
    this.enabled = true;
  }

  isEnabled(): boolean {
    return this.enabled && this.service !== null;
  }

  async evaluate(
    content: string,
    direction: 'inbound' | 'outbound',
  ): Promise<{
    allowed: boolean;
    blocked: boolean;
    matches: PolicyMatch[];
    modifiedContent?: string;
  }> {
    if (!this.service) {
      return { allowed: true, blocked: false, matches: [] };
    }

    return this.service.evaluate(content, direction);
  }

  /**
   * Create an OpenAI-based LLM service.
   */
  static createOpenAIService(options: { apiKey: string }): LLMService {
    return {
      async evaluate(content: string, direction: string) {
        // Simplified — in production this would call OpenAI API
        // The full implementation is in the v1 llm-fallback.ts
        return { allowed: true, blocked: false, matches: [] };
      },
    };
  }
}
