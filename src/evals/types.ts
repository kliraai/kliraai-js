/**
 * Klira SDK v2 — Evaluation types.
 */

export interface KliraTestCase {
  readonly id?: string;
  readonly input: string;
  readonly expectedOutput?: string;
  readonly metadata?: Record<string, unknown>;
  readonly tags?: readonly string[];
}

export interface KliraEvalResult {
  readonly testCase: KliraTestCase;
  readonly output: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface KliraEvalSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly errorCount: number;
  readonly avgDurationMs: number;
  readonly results: readonly KliraEvalResult[];
}

export interface KliraDataset {
  readonly id: string;
  readonly name: string;
  readonly testCases: readonly KliraTestCase[];
}
