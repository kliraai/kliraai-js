/**
 * Dataset loader for evaluation test cases
 *
 * Supports loading from CSV, JSON files, or in-memory arrays
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { TestCase, DatasetLoaderOptions } from './types.js';

/**
 * Load test cases from various formats
 */
export async function loadDataset(
  data: string | TestCase[],
  options: DatasetLoaderOptions = {}
): Promise<TestCase[]> {
  // If already an array of test cases, return as-is
  if (Array.isArray(data)) {
    return data.map((tc, idx) => ({
      id: tc.id || `test_${idx}`,
      ...tc,
    }));
  }

  // Otherwise, treat as file path
  const filePath = data;
  const format = options.format || detectFormat(filePath);

  const content = await fs.readFile(filePath, 'utf-8');

  switch (format) {
    case 'json':
      return loadJSON(content, options);
    case 'csv':
      return loadCSV(content, options);
    default:
      throw new Error(`Unsupported dataset format: ${format}`);
  }
}

/**
 * Detect format from file extension
 */
function detectFormat(filePath: string): 'json' | 'csv' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.csv') return 'csv';
  throw new Error(`Cannot detect format for file: ${filePath}`);
}

/**
 * Load test cases from JSON
 */
function loadJSON(content: string, _options: DatasetLoaderOptions): TestCase[] {
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error('JSON dataset must be an array of test cases');
  }

  return data.map((item, idx) => ({
    id: String(item.id || item.test_id || `test_${idx}`),
    input: String(item.input || item.query || item.message || ''),
    expectedOutput: item.expected_output || item.expected || item.output,
    metadata: item.metadata || {},
  }));
}

/**
 * Load test cases from CSV
 *
 * Simple CSV parser (for production, consider using a library like papaparse)
 */
function loadCSV(content: string, options: DatasetLoaderOptions): TestCase[] {
  const lines = content.split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  // Parse header
  const header = parseCSVLine(lines[0] || '');
  const inputColumn = options.inputColumn || 'input';
  const expectedOutputColumn = options.expectedOutputColumn || 'expected_output';

  const inputIdx = header.indexOf(inputColumn);
  const expectedOutputIdx = header.indexOf(expectedOutputColumn);
  const idIdx = header.indexOf('id');

  if (inputIdx === -1) {
    throw new Error(`Input column '${inputColumn}' not found in CSV`);
  }

  // Parse data rows
  const testCases: TestCase[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i] || '');
    if (row.length === 0) continue;

    testCases.push({
      id: idIdx !== -1 && row[idIdx] ? row[idIdx] : `test_${i - 1}`,
      input: row[inputIdx] || '',
      expectedOutput:
        expectedOutputIdx !== -1 && row[expectedOutputIdx]
          ? row[expectedOutputIdx]
          : undefined,
      metadata: {},
    });
  }

  return testCases;
}

/**
 * Parse a CSV line (simple implementation)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result.map((val) => val.replace(/^"|"$/g, '')); // Remove surrounding quotes
}
