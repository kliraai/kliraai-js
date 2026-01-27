/**
 * HTTP client for fetching evaluation datasets from Klira API
 *
 * Provides Python SDK parity for remote dataset fetching functionality.
 */

/**
 * Response format from the Klira Dataset API
 */
export interface DatasetAPIResponse {
  dataset: {
    id: string;
    status: 'ready' | 'pending' | 'error';
  };
  items: DatasetItem[];
  fetched_at: string;
}

/**
 * Individual dataset item from the API
 */
export interface DatasetItem {
  id: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  metadata?: {
    expected_output?: string;
    expected_guardrail_decision?: 'ALLOW' | 'BLOCK';
    category?: string;
    [key: string]: any;
  };
}

/**
 * Options for DatasetHTTPClient constructor
 */
export interface DatasetHTTPClientOptions {
  apiKey: string;
  apiUrl?: string;
  timeout?: number;
  retries?: number;
}

/**
 * Default API URL for dataset fetching
 */
export const DEFAULT_DATASET_API_URL =
  'https://api.getklira.com/v1/evals/datasets';

/**
 * HTTP client for fetching evaluation datasets from the Klira platform API
 *
 * @example
 * ```typescript
 * const client = new DatasetHTTPClient({
 *   apiKey: 'klira_xxx',
 *   timeout: 10000,
 *   retries: 3,
 * });
 *
 * const items = await client.fetchDatasetItems('ds_123');
 * ```
 */
export class DatasetHTTPClient {
  private readonly apiUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(options: DatasetHTTPClientOptions) {
    if (!options.apiKey) {
      throw new Error('API key is required for DatasetHTTPClient');
    }

    if (!options.apiKey.startsWith('klira_')) {
      throw new Error('Invalid API key - must start with "klira_"');
    }

    this.apiUrl = options.apiUrl || DEFAULT_DATASET_API_URL;
    this.headers = {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    };
    this.timeout = options.timeout || 10000;
    this.retries = options.retries ?? 3;
  }

  /**
   * Fetch dataset items from the API
   *
   * @param datasetId - The dataset ID to fetch (e.g., 'ds_123')
   * @returns Array of dataset items
   * @throws Error if fetch fails after all retries
   */
  async fetchDatasetItems(datasetId: string): Promise<DatasetItem[]> {
    if (!datasetId) {
      throw new Error('Dataset ID is required');
    }

    const url = `${this.apiUrl}/${datasetId}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method: 'GET',
          headers: this.headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `Unauthorized: invalid or expired API key (status: ${response.status})`
          );
        }

        if (response.status === 404) {
          throw new Error(`Dataset not found: ${datasetId}`);
        }

        if (!response.ok) {
          throw new Error(
            `API request failed: ${response.status} ${response.statusText}`
          );
        }

        const data: DatasetAPIResponse = await response.json();

        if (data.dataset.status !== 'ready') {
          throw new Error(
            `Dataset not ready: status is "${data.dataset.status}"`
          );
        }

        return data.items;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on abort (timeout)
        if (lastError.name === 'AbortError') {
          throw new Error(`Dataset fetch timed out after ${this.timeout}ms`);
        }

        // Don't retry on auth errors or not found
        if (
          lastError.message.includes('Unauthorized') ||
          lastError.message.includes('not found')
        ) {
          throw lastError;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.retries - 1) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Failed to fetch dataset');
  }
}
