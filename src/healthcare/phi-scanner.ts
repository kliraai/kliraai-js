/**
 * Klira SDK v2 — PHI scanner.
 *
 * Regex-based PII/PHI detection for common patterns.
 * Returns PhiScanResult per contract.
 */

import type { PhiEntityResult, PhiScanResult } from '../contracts/phi-pipeline.js';

// ---------------------------------------------------------------------------
// Entity recognizers
// ---------------------------------------------------------------------------

interface EntityRecognizer {
  readonly type: string;
  readonly pattern: RegExp;
  readonly score: number;
}

const DEFAULT_RECOGNIZERS: EntityRecognizer[] = [
  {
    type: 'SSN',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    score: 0.95,
  },
  {
    type: 'MRN',
    pattern: /\b(?:MRN|mrn)[:\s#]*\d{6,10}\b/g,
    score: 0.90,
  },
  {
    type: 'PHONE',
    pattern: /\b(?:\+1\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    score: 0.85,
  },
  {
    type: 'EMAIL',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    score: 0.95,
  },
  {
    type: 'DOB',
    pattern: /\b(?:DOB|dob|date of birth)[:\s]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
    score: 0.90,
  },
  {
    type: 'DATE',
    pattern: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    score: 0.60,
  },
  {
    type: 'CREDIT_CARD',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    score: 0.95,
  },
  {
    type: 'IP_ADDRESS',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    score: 0.70,
  },
];

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export class PhiScanner {
  private recognizers: EntityRecognizer[];

  constructor(customRecognizers?: EntityRecognizer[]) {
    this.recognizers = customRecognizers
      ? [...DEFAULT_RECOGNIZERS, ...customRecognizers]
      : [...DEFAULT_RECOGNIZERS];
  }

  /**
   * Scan text for PII/PHI entities.
   */
  scan(text: string): PhiScanResult {
    if (!text) {
      return { detected: false, entityCount: 0, entityTypes: [] };
    }

    const entities: PhiEntityResult[] = [];
    const entityTypes = new Set<string>();

    for (const recognizer of this.recognizers) {
      // Reset regex state
      recognizer.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = recognizer.pattern.exec(text)) !== null) {
        entities.push({
          entityType: recognizer.type,
          start: match.index,
          end: match.index + match[0].length,
          score: recognizer.score,
        });
        entityTypes.add(recognizer.type);
      }
    }

    return {
      detected: entities.length > 0,
      entityCount: entities.length,
      entityTypes: [...entityTypes],
      entities,
    };
  }

  /**
   * Add a custom entity recognizer.
   */
  addRecognizer(recognizer: EntityRecognizer): void {
    this.recognizers.push(recognizer);
  }
}
