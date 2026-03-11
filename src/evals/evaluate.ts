/**
 * Klira SDK v2 — Evaluate function.
 *
 * Runs a function against a dataset and collects results.
 * Creates klira.evals.test_case spans for each case.
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from '../observability/pipeline.js';
import type {
  KliraEvalResult,
  KliraEvalSummary,
  KliraDataset,
} from './types.js';

export interface EvaluateOptions {
  /** Whether to run in eval mode (may skip certain guardrails). */
  evalMode?: boolean;
  /** Custom comparator. Default: exact match on expectedOutput. */
  comparator?: (output: string, expected: string) => boolean;
  /** Concurrency limit. Default: 1 (sequential). */
  concurrency?: number;
}

/**
 * Evaluate a function against a dataset.
 *
 * @example
 * ```ts
 * const summary = await evaluate(
 *   async (input) => myLLM.generate(input),
 *   { id: 'test', name: 'test', testCases: [...] },
 * );
 * console.log(`${summary.passed}/${summary.total} passed`);
 * ```
 */
export async function evaluate(
  fn: (input: string) => Promise<string>,
  dataset: KliraDataset,
  options?: EvaluateOptions,
): Promise<KliraEvalSummary> {
  const tracer = getTracer();
  const comparator = options?.comparator ?? defaultComparator;
  const results: KliraEvalResult[] = [];

  for (const testCase of dataset.testCases) {
    const result = await tracer.startActiveSpan(
      'klira.evals.test_case',
      {
        attributes: {
          'klira.entity_type': 'eval',
          'klira.evals.dataset_id': dataset.id,
          'klira.evals.dataset_name': dataset.name,
          'klira.evals.input': testCase.input.slice(0, 500),
          ...(testCase.tags && {
            'klira.evals.tags': testCase.tags.join(','),
          }),
        },
      },
      async (span) => {
        const start = performance.now();
        try {
          const output = await fn(testCase.input);
          const durationMs = performance.now() - start;

          const passed = testCase.expectedOutput
            ? comparator(output, testCase.expectedOutput)
            : true;

          span.setAttribute('klira.evals.output', output.slice(0, 500));
          span.setAttribute('klira.evals.passed', passed);
          span.setAttribute('klira.evals.duration_ms', durationMs);
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();

          return {
            testCase,
            output,
            passed,
            durationMs,
          } satisfies KliraEvalResult;
        } catch (error) {
          const durationMs = performance.now() - start;
          const errorMsg = error instanceof Error ? error.message : String(error);

          span.setAttribute('klira.evals.passed', false);
          span.setAttribute('klira.evals.error', errorMsg);
          span.setStatus({ code: SpanStatusCode.ERROR, message: errorMsg });
          span.end();

          return {
            testCase,
            output: '',
            passed: false,
            durationMs,
            error: errorMsg,
          } satisfies KliraEvalResult;
        }
      },
    );

    results.push(result);
  }

  const passed = results.filter((r) => r.passed).length;
  const errorCount = results.filter((r) => r.error).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    errorCount,
    avgDurationMs: results.length > 0 ? totalDuration / results.length : 0,
    results,
  };
}

function defaultComparator(output: string, expected: string): boolean {
  return output.trim() === expected.trim();
}
