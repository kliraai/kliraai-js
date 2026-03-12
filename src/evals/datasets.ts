/**
 * Klira SDK v2 — Dataset fetching.
 *
 * Fetch datasets from Klira API by ID.
 */

import type { KliraDataset, KliraTestCase } from './types.js';

/**
 * Fetch a dataset from the Klira API.
 */
export async function fetchDataset(
  datasetId: string,
  options?: { endpoint?: string; apiKey?: string },
): Promise<KliraDataset> {
  const endpoint = options?.endpoint ?? 'https://api.getklira.com/v1';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options?.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }

  const response = await fetch(`${endpoint}/datasets/${datasetId}`, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset ${datasetId}: ${response.status}`);
  }

  const data = (await response.json()) as KliraDataset;
  return data;
}

/**
 * Create a dataset from a local array of test cases.
 */
export function createLocalDataset(
  name: string,
  testCases: KliraTestCase[],
): KliraDataset {
  return {
    id: `local-${Date.now()}`,
    name,
    testCases,
  };
}
