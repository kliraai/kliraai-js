/**
 * Tests for dataset loader functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadDataset, loadFromApi } from '../../evals/dataset-loader.js';
import type { TestCase } from '../../evals/types.js';
import type { DatasetItem } from '../../evals/dataset-http-client.js';

describe('Dataset Loader', () => {
  const tempDir = path.join(process.cwd(), 'temp-test-datasets');

  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('In-Memory Arrays', () => {
    it('should load test cases from array', async () => {
      const testCases: TestCase[] = [
        {
          id: 'test_1',
          input: 'Hello world',
          expectedOutput: 'Hello response',
        },
        {
          id: 'test_2',
          input: 'Another test',
        },
      ];

      const result = await loadDataset(testCases);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('test_1');
      expect(result[0].input).toBe('Hello world');
      expect(result[0].expectedOutput).toBe('Hello response');
      expect(result[1].id).toBe('test_2');
      expect(result[1].input).toBe('Another test');
    });

    it('should generate IDs for test cases without IDs', async () => {
      const testCases: TestCase[] = [
        { input: 'Test 1' },
        { input: 'Test 2' },
      ];

      const result = await loadDataset(testCases);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('test_0');
      expect(result[1].id).toBe('test_1');
    });
  });

  describe('JSON Format', () => {
    it('should load test cases from JSON file', async () => {
      const jsonPath = path.join(tempDir, 'tests.json');
      const testData = [
        {
          id: 'json_test_1',
          input: 'JSON test input',
          expected_output: 'JSON test output',
        },
        {
          test_id: 'json_test_2',
          query: 'Alternative input field',
        },
      ];

      await fs.writeFile(jsonPath, JSON.stringify(testData, null, 2));

      const result = await loadDataset(jsonPath);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('json_test_1');
      expect(result[0].input).toBe('JSON test input');
      expect(result[0].expectedOutput).toBe('JSON test output');
      expect(result[1].id).toBe('json_test_2');
      expect(result[1].input).toBe('Alternative input field');
    });

    it('should handle alternative JSON field names', async () => {
      const jsonPath = path.join(tempDir, 'alternative.json');
      const testData = [
        {
          test_id: 'alt_1',
          message: 'Message field',
          expected: 'Expected field',
        },
      ];

      await fs.writeFile(jsonPath, JSON.stringify(testData, null, 2));

      const result = await loadDataset(jsonPath);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('alt_1');
      expect(result[0].input).toBe('Message field');
      expect(result[0].expectedOutput).toBe('Expected field');
    });

    it('should throw error for non-array JSON', async () => {
      const jsonPath = path.join(tempDir, 'invalid.json');
      await fs.writeFile(jsonPath, JSON.stringify({ not: 'an array' }));

      await expect(loadDataset(jsonPath)).rejects.toThrow(
        'JSON dataset must be an array of test cases'
      );
    });
  });

  describe('CSV Format', () => {
    it('should load test cases from CSV file', async () => {
      const csvPath = path.join(tempDir, 'tests.csv');
      const csvContent = `id,input,expected_output
test_1,"Hello, world","Hello, response"
test_2,"Second test","Second response"`;

      await fs.writeFile(csvPath, csvContent);

      const result = await loadDataset(csvPath);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('test_1');
      expect(result[0].input).toBe('Hello, world');
      expect(result[0].expectedOutput).toBe('Hello, response');
    });

    it('should handle CSV without IDs', async () => {
      const csvPath = path.join(tempDir, 'no-ids.csv');
      const csvContent = `input,expected_output
"First input","First output"
"Second input","Second output"`;

      await fs.writeFile(csvPath, csvContent);

      const result = await loadDataset(csvPath);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('test_0');
      expect(result[1].id).toBe('test_1');
    });

    it('should handle CSV without expected outputs', async () => {
      const csvPath = path.join(tempDir, 'input-only.csv');
      const csvContent = `input
"Input 1"
"Input 2"`;

      await fs.writeFile(csvPath, csvContent);

      const result = await loadDataset(csvPath);

      expect(result).toHaveLength(2);
      expect(result[0].input).toBe('Input 1');
      expect(result[0].expectedOutput).toBeUndefined();
      expect(result[1].input).toBe('Input 2');
      expect(result[1].expectedOutput).toBeUndefined();
    });

    it('should use custom column names', async () => {
      const csvPath = path.join(tempDir, 'custom-columns.csv');
      const csvContent = `query,answer
"Question 1","Answer 1"
"Question 2","Answer 2"`;

      await fs.writeFile(csvPath, csvContent);

      const result = await loadDataset(csvPath, {
        inputColumn: 'query',
        expectedOutputColumn: 'answer',
      });

      expect(result).toHaveLength(2);
      expect(result[0].input).toBe('Question 1');
      expect(result[0].expectedOutput).toBe('Answer 1');
    });

    it('should throw error for missing input column', async () => {
      const csvPath = path.join(tempDir, 'missing-input.csv');
      const csvContent = `output
"Output only"`;

      await fs.writeFile(csvPath, csvContent);

      await expect(loadDataset(csvPath)).rejects.toThrow(
        "Input column 'input' not found in CSV"
      );
    });

    it('should throw error for empty CSV', async () => {
      const csvPath = path.join(tempDir, 'empty.csv');
      await fs.writeFile(csvPath, '');

      await expect(loadDataset(csvPath)).rejects.toThrow(
        'CSV must have at least a header row and one data row'
      );
    });
  });

  describe('Format Detection', () => {
    it('should detect JSON format from extension', async () => {
      const jsonPath = path.join(tempDir, 'auto.json');
      await fs.writeFile(jsonPath, JSON.stringify([{ input: 'test' }]));

      const result = await loadDataset(jsonPath);

      expect(result).toHaveLength(1);
    });

    it('should detect CSV format from extension', async () => {
      const csvPath = path.join(tempDir, 'auto.csv');
      await fs.writeFile(csvPath, 'input\n"test"');

      const result = await loadDataset(csvPath);

      expect(result).toHaveLength(1);
    });

    it('should throw error for unknown format', async () => {
      const txtPath = path.join(tempDir, 'unknown.txt');
      await fs.writeFile(txtPath, 'some content');

      await expect(loadDataset(txtPath)).rejects.toThrow(
        'Cannot detect format for file'
      );
    });

    it('should respect explicit format option', async () => {
      const jsonPath = path.join(tempDir, 'data.json');
      await fs.writeFile(jsonPath, JSON.stringify([{ input: 'test' }]));

      const result = await loadDataset(jsonPath, { format: 'json' });

      expect(result).toHaveLength(1);
    });
  });

  describe('loadFromApi()', () => {
    it('extracts user message from messages array', () => {
      const items: DatasetItem[] = [
        {
          id: 'item_1',
          messages: [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hello world' },
          ],
          metadata: {
            expected_output: 'Hi there',
          },
        },
      ];

      const result = loadFromApi(items);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('item_1');
      expect(result[0].input).toBe('Hello world');
      expect(result[0].expectedOutput).toBe('Hi there');
    });

    it('maps metadata fields correctly', () => {
      const items: DatasetItem[] = [
        {
          id: 'item_1',
          messages: [{ role: 'user', content: 'Test input' }],
          metadata: {
            expected_output: 'Expected response',
            expected_guardrail_decision: 'ALLOW',
            category: 'safety',
            custom_field: 'custom_value',
          },
        },
      ];

      const result = loadFromApi(items);

      expect(result[0].expectedOutput).toBe('Expected response');
      expect(result[0].expectedGuardrailDecision).toBe('ALLOW');
      expect(result[0].metadata?.category).toBe('safety');
      expect(result[0].metadata?.custom_field).toBe('custom_value');
    });

    it('throws error when no user message found', () => {
      const items: DatasetItem[] = [
        {
          id: 'item_1',
          messages: [{ role: 'assistant', content: 'Response only' }],
        },
      ];

      expect(() => loadFromApi(items)).toThrow('Item 0: no user message found');
    });

    it('throws error when messages array is empty', () => {
      const items: DatasetItem[] = [
        {
          id: 'item_1',
          messages: [],
        },
      ];

      expect(() => loadFromApi(items)).toThrow('Item 0: no user message found');
    });

    it('handles empty metadata', () => {
      const items: DatasetItem[] = [
        {
          id: 'item_1',
          messages: [{ role: 'user', content: 'Test' }],
        },
      ];

      const result = loadFromApi(items);

      expect(result[0].expectedOutput).toBeUndefined();
      expect(result[0].expectedGuardrailDecision).toBeUndefined();
      expect(result[0].metadata).toEqual({
        category: undefined,
      });
    });

    it('preserves custom metadata fields', () => {
      const items: DatasetItem[] = [
        {
          id: 'item_1',
          messages: [{ role: 'user', content: 'Test' }],
          metadata: {
            custom1: 'value1',
            custom2: 123,
            nested: { key: 'value' },
          },
        },
      ];

      const result = loadFromApi(items);

      expect(result[0].metadata?.custom1).toBe('value1');
      expect(result[0].metadata?.custom2).toBe(123);
      expect(result[0].metadata?.nested).toEqual({ key: 'value' });
    });

    it('generates IDs when not provided', () => {
      const items: DatasetItem[] = [
        {
          id: '',
          messages: [{ role: 'user', content: 'Test 1' }],
        },
        {
          id: '',
          messages: [{ role: 'user', content: 'Test 2' }],
        },
      ];

      const result = loadFromApi(items);

      expect(result[0].id).toBe('test_0');
      expect(result[1].id).toBe('test_1');
    });

    it('handles multiple user messages by using first one', () => {
      const items: DatasetItem[] = [
        {
          id: 'item_1',
          messages: [
            { role: 'user', content: 'First message' },
            { role: 'assistant', content: 'Response' },
            { role: 'user', content: 'Second message' },
          ],
        },
      ];

      const result = loadFromApi(items);

      expect(result[0].input).toBe('First message');
    });

    it('handles BLOCK guardrail decision', () => {
      const items: DatasetItem[] = [
        {
          id: 'item_1',
          messages: [{ role: 'user', content: 'Harmful content' }],
          metadata: {
            expected_guardrail_decision: 'BLOCK',
          },
        },
      ];

      const result = loadFromApi(items);

      expect(result[0].expectedGuardrailDecision).toBe('BLOCK');
    });
  });
});
