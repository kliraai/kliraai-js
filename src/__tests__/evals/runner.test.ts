/**
 * Tests for evaluation runner functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { evaluate } from '../../evals/runner.js';
import { KliraAI } from '../../index.js';
import { GuardrailsEngine } from '../../guardrails/engine.js';
import type { TestCase } from '../../evals/types.js';

describe('Evaluation Runner', () => {
  const tempDir = path.join(process.cwd(), 'temp-test-evals');

  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });

    // Reset SDK state
    GuardrailsEngine.resetInstance();
    (KliraAI as any).initialized = false;
    (KliraAI as any).config = null;
    (KliraAI as any).guardrails = null;
    (KliraAI as any).tracing = null;
    (KliraAI as any).metrics = null;
    (KliraAI as any).logger = null;

    // Initialize SDK for testing
    await KliraAI.init({
      appName: 'test-eval-runner',
      enableTracing: false, // Disable actual tracing for unit tests
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });

    // Clean up SDK state
    GuardrailsEngine.resetInstance();
    (KliraAI as any).initialized = false;
    (KliraAI as any).config = null;
    (KliraAI as any).guardrails = null;
    (KliraAI as any).tracing = null;
    (KliraAI as any).metrics = null;
    (KliraAI as any).logger = null;
  });

  describe('Basic Evaluation', () => {
    it('should run evaluation with in-memory test cases', async () => {
      const testCases: TestCase[] = [
        { id: 'test_1', input: 'Hello', expectedOutput: 'Hello response' },
        { id: 'test_2', input: 'World', expectedOutput: 'World response' },
      ];

      const target = vi.fn(async (input: string) => {
        return `${input} response`;
      });

      const result = await evaluate({
        target,
        data: testCases,
      });

      expect(result.totalTestCases).toBe(2);
      expect(result.passedTestCases).toBe(2);
      expect(result.failedTestCases).toBe(0);
      expect(result.passRate).toBe(1.0);
      expect(result.testCases).toHaveLength(2);
      expect(target).toHaveBeenCalledTimes(2);
    });

    it('should run evaluation with CSV dataset', async () => {
      const csvPath = path.join(tempDir, 'eval-tests.csv');
      const csvContent = `input,expected_output
"Test 1","Response 1"
"Test 2","Response 2"`;

      await fs.writeFile(csvPath, csvContent);

      const target = async (input: string) => {
        return `Response ${input.split(' ')[1]}`;
      };

      const result = await evaluate({
        target,
        data: csvPath,
      });

      expect(result.totalTestCases).toBe(2);
      expect(result.passRate).toBe(1.0);
      expect(result.datasetPath).toBe(csvPath);
    });

    it('should run evaluation with JSON dataset', async () => {
      const jsonPath = path.join(tempDir, 'eval-tests.json');
      const testData = [
        { input: 'Input 1', expected_output: 'Output 1' },
        { input: 'Input 2', expected_output: 'Output 2' },
      ];

      await fs.writeFile(jsonPath, JSON.stringify(testData, null, 2));

      const target = async (input: string) => {
        return `Output ${input.split(' ')[1]}`;
      };

      const result = await evaluate({
        target,
        data: jsonPath,
      });

      expect(result.totalTestCases).toBe(2);
      expect(result.passRate).toBe(1.0);
    });
  });

  describe('Pass/Fail Logic', () => {
    it('should mark test as passed when output matches expected', async () => {
      const testCases: TestCase[] = [
        { id: 'test_1', input: 'input', expectedOutput: 'correct output' },
      ];

      const target = async () => 'correct output';

      const result = await evaluate({
        target,
        data: testCases,
      });

      expect(result.testCases![0].passed).toBe(true);
      expect(result.passedTestCases).toBe(1);
      expect(result.failedTestCases).toBe(0);
    });

    it('should mark test as failed when output does not match expected', async () => {
      const testCases: TestCase[] = [
        { id: 'test_1', input: 'input', expectedOutput: 'expected output' },
      ];

      const target = async () => 'wrong output';

      const result = await evaluate({
        target,
        data: testCases,
      });

      expect(result.testCases![0].passed).toBe(false);
      expect(result.passedTestCases).toBe(0);
      expect(result.failedTestCases).toBe(1);
    });

    it('should mark test as passed when no expected output is provided', async () => {
      const testCases: TestCase[] = [{ id: 'test_1', input: 'input' }];

      const target = async () => 'any output';

      const result = await evaluate({
        target,
        data: testCases,
      });

      expect(result.testCases![0].passed).toBe(true);
      expect(result.passedTestCases).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should capture errors from target function', async () => {
      const testCases: TestCase[] = [{ id: 'test_1', input: 'input' }];

      const target = async () => {
        throw new Error('Target function error');
      };

      const result = await evaluate({
        target,
        data: testCases,
      });

      expect(result.testCases![0].error).toBe('Target function error');
      expect(result.testCases![0].passed).toBe(false);
      expect(result.failedTestCases).toBe(1);
    });

    it('should continue evaluation after errors', async () => {
      const testCases: TestCase[] = [
        { id: 'test_1', input: 'error', expectedOutput: 'output' },
        { id: 'test_2', input: 'success', expectedOutput: 'success output' },
      ];

      const target = async (input: string) => {
        if (input === 'error') {
          throw new Error('Intentional error');
        }
        return `${input} output`;
      };

      const result = await evaluate({
        target,
        data: testCases,
      });

      expect(result.totalTestCases).toBe(2);
      expect(result.passedTestCases).toBe(1);
      expect(result.failedTestCases).toBe(1);
      expect(result.testCases![0].error).toBe('Intentional error');
      expect(result.testCases![1].error).toBeUndefined();
    });

    it('should throw error when target is missing', async () => {
      await expect(
        evaluate({
          target: undefined as any,
          data: [],
        })
      ).rejects.toThrow('target function is required');
    });

    it('should throw error when data is missing', async () => {
      await expect(
        evaluate({
          target: async () => 'output',
          data: undefined as any,
        })
      ).rejects.toThrow('data is required');
    });

    it('should throw error when dataset is empty', async () => {
      await expect(
        evaluate({
          target: async () => 'output',
          data: [],
        })
      ).rejects.toThrow('No test cases found in dataset');
    });
  });

  describe('Metadata and Context', () => {
    it('should include test case metadata in results', async () => {
      const testCases: TestCase[] = [
        {
          id: 'test_1',
          input: 'input',
          metadata: { category: 'unit', priority: 'high' },
        },
      ];

      const target = async () => 'output';

      const result = await evaluate({
        target,
        data: testCases,
      });

      expect(result.testCases![0].testCaseId).toBe('test_1');
      expect(result.testCases![0].input).toBe('input');
    });

    it('should set eval run context when provided', async () => {
      const testCases: TestCase[] = [{ id: 'test_1', input: 'input' }];
      const target = async () => 'output';

      const result = await evaluate({
        target,
        data: testCases,
        evalsRun: 'eval_run_123',
        organizationId: 'org_456',
        projectId: 'proj_789',
      });

      expect(result.evalsRun).toBe('eval_run_123');
      expect(result.organizationId).toBe('org_456');
      expect(result.projectId).toBe('proj_789');
    });

    it('should include experiment ID when provided', async () => {
      const testCases: TestCase[] = [{ id: 'test_1', input: 'input' }];
      const target = async () => 'output';

      const result = await evaluate({
        target,
        data: testCases,
        experimentId: 'exp_123',
      });

      expect(result.experimentId).toBe('exp_123');
    });
  });

  describe('Performance Metrics', () => {
    it('should track latency for each test case', async () => {
      const testCases: TestCase[] = [
        { id: 'test_1', input: 'input' },
        { id: 'test_2', input: 'input' },
      ];

      const target = async (input: string) => {
        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, 10));
        return `${input} output`;
      };

      const result = await evaluate({
        target,
        data: testCases,
      });

      expect(result.testCases![0].latencyMs).toBeGreaterThan(0);
      expect(result.testCases![1].latencyMs).toBeGreaterThan(0);
    });

    it('should track total evaluation duration', async () => {
      const testCases: TestCase[] = [{ id: 'test_1', input: 'input' }];

      const target = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'output';
      };

      const result = await evaluate({
        target,
        data: testCases,
      });

      expect(result.durationSeconds).toBeGreaterThan(0);
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('Hub Upload', () => {
    it('should skip hub upload when not requested', async () => {
      const testCases: TestCase[] = [{ id: 'test_1', input: 'input' }];
      const target = async () => 'output';

      const result = await evaluate({
        target,
        data: testCases,
        uploadToHub: false,
      });

      expect(result.hubUrl).toBeUndefined();
    });

    it('should attempt hub upload when requested', async () => {
      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://dashboard.getklira.com/evals/123' }),
      });

      const testCases: TestCase[] = [{ id: 'test_1', input: 'input' }];
      const target = async () => 'output';

      const result = await evaluate({
        target,
        data: testCases,
        uploadToHub: true,
        hubApiKey: 'klira_test_api_key_12345',
        evalsRun: 'eval_123',
      });

      expect(result.hubUrl).toBe('https://dashboard.getklira.com/evals/123');
      expect(fetch).toHaveBeenCalled();

      // Cleanup
      vi.restoreAllMocks();
    });
  });

  describe('Trace Integration', () => {
    it('should call flush after evaluation', async () => {
      const flushSpy = vi.spyOn(KliraAI, 'flush');

      const testCases: TestCase[] = [{ id: 'test_1', input: 'input' }];
      const target = async () => 'output';

      await evaluate({
        target,
        data: testCases,
      });

      expect(flushSpy).toHaveBeenCalled();

      flushSpy.mockRestore();
    });
  });

  describe('Result Structure', () => {
    it('should return complete result structure', async () => {
      const testCases: TestCase[] = [
        { id: 'test_1', input: 'input1', expectedOutput: 'output1' },
        { id: 'test_2', input: 'input2', expectedOutput: 'output2' },
      ];

      const target = async (input: string) => `${input.replace('input', 'output')}`;

      const result = await evaluate({
        target,
        data: testCases,
      });

      // Check all required fields
      expect(result).toHaveProperty('totalTestCases');
      expect(result).toHaveProperty('passRate');
      expect(result).toHaveProperty('passedTestCases');
      expect(result).toHaveProperty('failedTestCases');
      expect(result).toHaveProperty('testCases');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('durationSeconds');

      // Check test case structure
      expect(result.testCases![0]).toHaveProperty('testCaseId');
      expect(result.testCases![0]).toHaveProperty('input');
      expect(result.testCases![0]).toHaveProperty('expectedOutput');
      expect(result.testCases![0]).toHaveProperty('actualOutput');
      expect(result.testCases![0]).toHaveProperty('passed');
      expect(result.testCases![0]).toHaveProperty('latencyMs');
      expect(result.testCases![0]).toHaveProperty('guardrailDecision');
      expect(result.testCases![0]).toHaveProperty('metricScores');
    });
  });
});
