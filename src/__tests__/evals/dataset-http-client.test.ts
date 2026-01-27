/**
 * Tests for DatasetHTTPClient - remote dataset fetching
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DatasetHTTPClient,
  DEFAULT_DATASET_API_URL,
} from '../../evals/dataset-http-client.js';
import type {
  DatasetAPIResponse,
  DatasetItem,
} from '../../evals/dataset-http-client.js';

describe('DatasetHTTPClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('validates API key is provided', () => {
      expect(() => {
        new DatasetHTTPClient({ apiKey: '' });
      }).toThrow('API key is required');
    });

    it('validates API key format', () => {
      expect(() => {
        new DatasetHTTPClient({ apiKey: 'invalid_key' });
      }).toThrow('Invalid API key - must start with "klira_"');
    });

    it('accepts valid API key', () => {
      const client = new DatasetHTTPClient({ apiKey: 'klira_test_key_123' });
      expect(client).toBeInstanceOf(DatasetHTTPClient);
    });

    it('uses default API URL when not provided', () => {
      const client = new DatasetHTTPClient({ apiKey: 'klira_test_key' });
      // Verify via a mocked fetch call
      expect(DEFAULT_DATASET_API_URL).toBe(
        'https://api.getklira.com/v1/evals/datasets'
      );
    });

    it('uses custom API URL when provided', async () => {
      const customUrl = 'https://custom.api.com/datasets';
      const client = new DatasetHTTPClient({
        apiKey: 'klira_test_key',
        apiUrl: customUrl,
      });

      const mockResponse: DatasetAPIResponse = {
        dataset: { id: 'ds_123', status: 'ready' },
        items: [],
        fetched_at: '2026-01-26T12:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await client.fetchDatasetItems('ds_123');

      expect(fetch).toHaveBeenCalledWith(
        `${customUrl}/ds_123`,
        expect.any(Object)
      );
    });
  });

  describe('fetchDatasetItems', () => {
    it('fetches dataset items successfully', async () => {
      const client = new DatasetHTTPClient({ apiKey: 'klira_test_key' });

      const mockItems: DatasetItem[] = [
        {
          id: 'item_1',
          messages: [{ role: 'user', content: 'Hello' }],
          metadata: { expected_output: 'Hi there' },
        },
        {
          id: 'item_2',
          messages: [{ role: 'user', content: 'Goodbye' }],
          metadata: { expected_output: 'Bye' },
        },
      ];

      const mockResponse: DatasetAPIResponse = {
        dataset: { id: 'ds_123', status: 'ready' },
        items: mockItems,
        fetched_at: '2026-01-26T12:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const items = await client.fetchDatasetItems('ds_123');

      expect(items).toEqual(mockItems);
      expect(fetch).toHaveBeenCalledWith(
        `${DEFAULT_DATASET_API_URL}/ds_123`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer klira_test_key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('requires dataset ID', async () => {
      const client = new DatasetHTTPClient({ apiKey: 'klira_test_key' });

      await expect(client.fetchDatasetItems('')).rejects.toThrow(
        'Dataset ID is required'
      );
    });

    it('handles timeout correctly', async () => {
      const client = new DatasetHTTPClient({
        apiKey: 'klira_test_key',
        timeout: 100, // Very short timeout
        retries: 1,
      });

      // Mock fetch that takes longer than timeout
      global.fetch = vi.fn().mockImplementation(
        (_url, options) =>
          new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              resolve({
                ok: true,
                status: 200,
                json: async () => ({
                  dataset: { id: 'ds_123', status: 'ready' },
                  items: [],
                  fetched_at: '2026-01-26T12:00:00Z',
                }),
              });
            }, 200);

            // Handle abort signal
            if (options.signal) {
              options.signal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                const error = new Error('Aborted');
                error.name = 'AbortError';
                reject(error);
              });
            }
          })
      );

      await expect(client.fetchDatasetItems('ds_123')).rejects.toThrow(
        'Dataset fetch timed out after 100ms'
      );
    });

    it('retries on failure with exponential backoff', async () => {
      const client = new DatasetHTTPClient({
        apiKey: 'klira_test_key',
        retries: 3,
      });

      const mockResponse: DatasetAPIResponse = {
        dataset: { id: 'ds_123', status: 'ready' },
        items: [],
        fetched_at: '2026-01-26T12:00:00Z',
      };

      // Fail twice, succeed on third attempt
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        });

      const items = await client.fetchDatasetItems('ds_123');

      expect(items).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(3);
    }, 10000); // Increase timeout for retry delays

    it('throws error for non-ready dataset', async () => {
      const client = new DatasetHTTPClient({
        apiKey: 'klira_test_key',
        retries: 1,
      });

      const mockResponse: DatasetAPIResponse = {
        dataset: { id: 'ds_123', status: 'pending' },
        items: [],
        fetched_at: '2026-01-26T12:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await expect(client.fetchDatasetItems('ds_123')).rejects.toThrow(
        'Dataset not ready: status is "pending"'
      );
    });

    it('throws error for 404 response', async () => {
      const client = new DatasetHTTPClient({
        apiKey: 'klira_test_key',
        retries: 1,
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.fetchDatasetItems('ds_nonexistent')).rejects.toThrow(
        'Dataset not found: ds_nonexistent'
      );
    });

    it('throws error for unauthorized response (401)', async () => {
      const client = new DatasetHTTPClient({
        apiKey: 'klira_test_key',
        retries: 1,
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(client.fetchDatasetItems('ds_123')).rejects.toThrow(
        'Unauthorized: invalid or expired API key'
      );
    });

    it('throws error for forbidden response (403)', async () => {
      const client = new DatasetHTTPClient({
        apiKey: 'klira_test_key',
        retries: 1,
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(client.fetchDatasetItems('ds_123')).rejects.toThrow(
        'Unauthorized: invalid or expired API key'
      );
    });

    it('throws error for server errors', async () => {
      const client = new DatasetHTTPClient({
        apiKey: 'klira_test_key',
        retries: 1,
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.fetchDatasetItems('ds_123')).rejects.toThrow(
        'API request failed: 500 Internal Server Error'
      );
    });

    it('does not retry on auth errors', async () => {
      const client = new DatasetHTTPClient({
        apiKey: 'klira_test_key',
        retries: 3,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(client.fetchDatasetItems('ds_123')).rejects.toThrow(
        'Unauthorized'
      );

      // Should only call once, no retries for auth errors
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on not found errors', async () => {
      const client = new DatasetHTTPClient({
        apiKey: 'klira_test_key',
        retries: 3,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.fetchDatasetItems('ds_123')).rejects.toThrow(
        'not found'
      );

      // Should only call once, no retries for 404
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
