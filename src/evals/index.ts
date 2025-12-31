/**
 * Klira SDK Evaluation System
 *
 * Provides evaluation capabilities for testing AI applications with
 * standard LLM metrics and Klira's unique compliance-focused metrics.
 *
 * @example
 * ```typescript
 * import { evaluate } from '@kliraai/sdk/evals';
 *
 * const result = await evaluate({
 *   target: async (input) => {
 *     const response = await myAgent.chat(input);
 *     return response.text;
 *   },
 *   data: 'dataset.csv',
 *   evalsRun: 'eval_run_123',
 * });
 *
 * console.log(`Pass rate: ${result.passRate}`);
 * console.log(`Total cases: ${result.totalTestCases}`);
 * ```
 */

export { evaluate } from './runner.js';
export { loadDataset } from './dataset-loader.js';
export type {
  KliraEvalResult,
  ComplianceReport,
  TestCase,
  TestCaseResult,
  EvaluateOptions,
  Evaluator,
  DatasetLoaderOptions,
} from './types.js';
