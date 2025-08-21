/**
 * Content Sanitization
 * Advanced content sanitization for secure LLM interactions
 */

import type { Logger } from '../types/index.js';
import { getLogger } from '../config/index.js';

export interface SanitizationConfig {
  enabled: boolean;
  strictMode: boolean;
  preserveFormatting: boolean;
  allowedTags: string[];
  blockedWords: string[];
  replaceWithPlaceholders: boolean;
  customReplacements: Record<string, string>;
}

export interface SanitizationResult {
  sanitized: string;
  wasModified: boolean;
  modifications: Array<{
    type: 'removal' | 'replacement' | 'encoding';
    original: string;
    replacement: string;
    reason: string;
  }>;
  riskScore: number;
}

/**
 * Advanced Content Sanitizer
 * Provides comprehensive content sanitization for secure LLM interactions
 */
export class ContentSanitizer {
  private logger: Logger;
  private config: SanitizationConfig;

  // Common dangerous patterns that should be sanitized
  private static readonly DANGEROUS_PATTERNS = [
    // Script injection patterns
    /<script[^>]*>.*?<\/script>/gis,
    /javascript:/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,
    
    // HTML injection patterns
    /<iframe[^>]*>.*?<\/iframe>/gis,
    /<object[^>]*>.*?<\/object>/gis,
    /<embed[^>]*>.*?<\/embed>/gis,
    /<form[^>]*>.*?<\/form>/gis,
    
    // SQL injection patterns
    /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b).*?(\bFROM\b|\bWHERE\b|\bINTO\b)/gi,
    /('|\").*?(\bOR\b|\bAND\b).*?('|\")\s*=\s*('|\")/gi,
    
    // Command injection patterns
    /[;&|`$(){}[\]\\]/g,
    /\$\([^)]*\)/g,
    /`[^`]*`/g,
    
    // Path traversal patterns
    /\.\.[\/\\]/g,
    /[\/\\]etc[\/\\]passwd/gi,
    /[\/\\]windows[\/\\]system32/gi,
    
    // Credential patterns
    /(?:api[_-]?key|secret|token|password)[\"'\s]*[:=][\"'\s]*[a-zA-Z0-9_\-]{8,}/gi,
    
    // Base64 encoded content (potentially malicious)
    /data:image\/[^;]+;base64,[A-Za-z0-9+\/]+=*/g,
    
    // URL patterns that might be suspicious
    /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|10\.|192\.168\.|172\.)/gi,
  ];

  // PII patterns that should be masked
  private static readonly PII_PATTERNS = [
    // Email addresses
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    
    // Phone numbers
    /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
    
    // SSN patterns
    /\b\d{3}-?\d{2}-?\d{4}\b/g,
    
    // Credit card patterns
    /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    
    // IP addresses
    /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
  ];

  constructor(config: Partial<SanitizationConfig> = {}) {
    this.logger = getLogger();
    this.config = {
      enabled: true,
      strictMode: false,
      preserveFormatting: true,
      allowedTags: ['b', 'i', 'strong', 'em', 'code', 'pre'],
      blockedWords: [],
      replaceWithPlaceholders: true,
      customReplacements: {},
      ...config,
    };
  }

  /**
   * Sanitize content for safe processing
   */
  sanitize(content: string): SanitizationResult {
    if (!this.config.enabled) {
      return {
        sanitized: content,
        wasModified: false,
        modifications: [],
        riskScore: 0,
      };
    }

    let sanitized = content;
    const modifications: SanitizationResult['modifications'] = [];
    let riskScore = 0;

    // Remove dangerous patterns
    for (const pattern of ContentSanitizer.DANGEROUS_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        for (const match of matches) {
          const replacement = this.config.replaceWithPlaceholders 
            ? '[SANITIZED_CONTENT]' 
            : '';
          
          sanitized = sanitized.replace(match, replacement);
          modifications.push({
            type: 'removal',
            original: match,
            replacement,
            reason: 'Dangerous pattern detected',
          });
          riskScore += 3;
        }
      }
    }

    // Mask PII data
    for (const pattern of ContentSanitizer.PII_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        for (const match of matches) {
          const replacement = this.getMaskedReplacement(match);
          sanitized = sanitized.replace(match, replacement);
          modifications.push({
            type: 'replacement',
            original: match,
            replacement,
            reason: 'PII data masked',
          });
          riskScore += 1;
        }
      }
    }

    // Apply custom replacements
    for (const [pattern, replacement] of Object.entries(this.config.customReplacements)) {
      try {
        const regex = new RegExp(pattern, 'gi');
        const matches = sanitized.match(regex);
        if (matches) {
          for (const match of matches) {
            sanitized = sanitized.replace(match, replacement);
            modifications.push({
              type: 'replacement',
              original: match,
              replacement,
              reason: 'Custom replacement rule',
            });
            riskScore += 1;
          }
        }
      } catch (error) {
        this.logger.warn(`Invalid custom replacement pattern: ${pattern}`, error);
      }
    }

    // Remove blocked words
    for (const blockedWord of this.config.blockedWords) {
      const regex = new RegExp(`\\b${blockedWord}\\b`, 'gi');
      const matches = sanitized.match(regex);
      if (matches) {
        for (const match of matches) {
          const replacement = this.config.replaceWithPlaceholders 
            ? '[BLOCKED_WORD]' 
            : '***';
          
          sanitized = sanitized.replace(match, replacement);
          modifications.push({
            type: 'replacement',
            original: match,
            replacement,
            reason: 'Blocked word removed',
          });
          riskScore += 1;
        }
      }
    }

    // Sanitize HTML if not preserving formatting
    if (!this.config.preserveFormatting) {
      const htmlSanitized = this.sanitizeHTML(sanitized);
      if (htmlSanitized !== sanitized) {
        modifications.push({
          type: 'encoding',
          original: 'HTML tags',
          replacement: 'Encoded entities',
          reason: 'HTML sanitization',
        });
        sanitized = htmlSanitized;
        riskScore += 1;
      }
    }

    // Normalize whitespace and control characters
    const normalizedWhitespace = sanitized.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalizedWhitespace !== sanitized) {
      modifications.push({
        type: 'encoding',
        original: 'Whitespace',
        replacement: 'Normalized',
        reason: 'Whitespace normalization',
      });
      sanitized = normalizedWhitespace;
    }

    // Remove control characters
    const controlCharsRemoved = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    if (controlCharsRemoved !== sanitized) {
      modifications.push({
        type: 'removal',
        original: 'Control characters',
        replacement: '',
        reason: 'Control character removal',
      });
      sanitized = controlCharsRemoved;
      riskScore += 1;
    }

    const wasModified = modifications.length > 0;

    if (wasModified) {
      this.logger.debug(`Content sanitization applied: ${modifications.length} modifications`, {
        riskScore,
        modificationsCount: modifications.length,
        originalLength: content.length,
        sanitizedLength: sanitized.length,
      });
    }

    return {
      sanitized,
      wasModified,
      modifications,
      riskScore,
    };
  }

  /**
   * Sanitize HTML content
   */
  private sanitizeHTML(html: string): string {
    // Simple HTML sanitization - in production, consider using a library like DOMPurify
    let sanitized = html;

    // Remove all HTML tags except allowed ones
    const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/gi;
    sanitized = sanitized.replace(tagPattern, (match, tagName) => {
      if (this.config.allowedTags.includes(tagName.toLowerCase())) {
        // Keep allowed tags but strip attributes for safety
        const isClosing = match.startsWith('</');
        return isClosing ? `</${tagName}>` : `<${tagName}>`;
      }
      return ''; // Remove disallowed tags
    });

    // Encode remaining < and > characters
    sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return sanitized;
  }

  /**
   * Get masked replacement for PII data
   */
  private getMaskedReplacement(original: string): string {
    if (original.includes('@')) {
      // Email
      const parts = original.split('@');
      return `${parts[0].charAt(0)}***@${parts[1]}`;
    } else if (/\d{3}-?\d{2}-?\d{4}/.test(original)) {
      // SSN
      return 'XXX-XX-XXXX';
    } else if (/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/.test(original)) {
      // Phone
      return 'XXX-XXX-XXXX';
    } else if (/(?:\d{4}[-\s]?){3}\d{4}/.test(original)) {
      // Credit card
      return 'XXXX-XXXX-XXXX-XXXX';
    } else if (/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/.test(original)) {
      // IP address
      return 'XXX.XXX.XXX.XXX';
    }
    
    // Generic masking
    return 'X'.repeat(Math.min(original.length, 10));
  }

  /**
   * Validate that content is safe after sanitization
   */
  validate(content: string): boolean {
    const result = this.sanitize(content);
    return result.riskScore < (this.config.strictMode ? 1 : 5);
  }

  /**
   * Update sanitization configuration
   */
  updateConfig(newConfig: Partial<SanitizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Content sanitizer configuration updated', this.config);
  }

  /**
   * Get sanitization statistics
   */
  getStats(): {
    config: SanitizationConfig;
    patternCounts: {
      dangerous: number;
      pii: number;
      custom: number;
    };
  } {
    return {
      config: this.config,
      patternCounts: {
        dangerous: ContentSanitizer.DANGEROUS_PATTERNS.length,
        pii: ContentSanitizer.PII_PATTERNS.length,
        custom: Object.keys(this.config.customReplacements).length,
      },
    };
  }
}

/**
 * Global content sanitizer instance
 */
let globalSanitizer: ContentSanitizer | null = null;

/**
 * Get the global content sanitizer instance
 */
export function getContentSanitizer(config?: Partial<SanitizationConfig>): ContentSanitizer {
  if (!globalSanitizer) {
    globalSanitizer = new ContentSanitizer(config);
  }
  return globalSanitizer;
}

/**
 * Reset the global sanitizer instance (for testing)
 */
export function resetContentSanitizer(): void {
  globalSanitizer = null;
}