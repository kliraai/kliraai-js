/**
 * PROD-764 Phase 6 — Python parity config surface.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createConfig, redactSecrets } from '../../config/index.js';

const ENV_KEYS = [
  'KLIRA_FRAMEWORK',
  'KLIRA_CLINICAL_DOMAIN',
  'KLIRA_EVALS_RUN',
  'KLIRA_DATASET_ID',
  'KLIRA_ANONYMIZATION',
  'KLIRA_PHI_EXPORT_ENTITY_DETAILS',
  'KLIRA_LLM_FALLBACK_PROVIDER',
  'KLIRA_LLM_FALLBACK_MODEL',
  'KLIRA_LLM_FALLBACK_API_KEY',
  'KLIRA_LLM_FALLBACK_ON_ERROR',
  'KLIRA_POLICIES_ENDPOINT',
  'KLIRA_DISABLE_EXTERNAL_TRACING',
  'KLIRA_USE_REMOTE_POLICIES',
  'KLIRA_BATCH_DELAY_MS',
  'KLIRA_OPENTELEMETRY_ENDPOINT',
];

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

describe('Phase 6 config surface', () => {
  it('option overrides win over env vars', () => {
    process.env.KLIRA_FRAMEWORK = 'pytest';
    const config = createConfig({ appName: 'x', framework: 'vitest' });
    expect(config.framework).toBe('vitest');
  });

  it('falls back to env vars when option is undefined', () => {
    process.env.KLIRA_FRAMEWORK = 'pytest';
    process.env.KLIRA_DATASET_ID = 'ds-1';
    process.env.KLIRA_EVALS_RUN = 'run-9';
    const config = createConfig({ appName: 'x' });
    expect(config.framework).toBe('pytest');
    expect(config.datasetId).toBe('ds-1');
    expect(config.evalsRun).toBe('run-9');
  });

  it('boolean env vars accept "true" / "1"', () => {
    process.env.KLIRA_USE_REMOTE_POLICIES = 'true';
    process.env.KLIRA_DISABLE_EXTERNAL_TRACING = '1';
    const config = createConfig({ appName: 'x' });
    expect(config.useRemotePolicies).toBe(true);
    expect(config.disableExternalTracing).toBe(true);
  });

  it('integer env var KLIRA_BATCH_DELAY_MS is parsed', () => {
    process.env.KLIRA_BATCH_DELAY_MS = '1234';
    const config = createConfig({ appName: 'x' });
    expect(config.batchDelayMs).toBe(1234);
  });

  it('default batchDelayMs is 500ms (Python parity)', () => {
    const config = createConfig({ appName: 'x' });
    expect(config.batchDelayMs).toBe(500);
  });

  it('anonymization=true normalizes to "redact"', () => {
    const config = createConfig({ appName: 'x', anonymization: true });
    expect(config.anonymization).toBe('redact');
  });

  it('KLIRA_ANONYMIZATION="mask" is honored', () => {
    process.env.KLIRA_ANONYMIZATION = 'mask';
    const config = createConfig({ appName: 'x' });
    expect(config.anonymization).toBe('mask');
  });

  it('llmFallback.onError defaults to "allow"', () => {
    const config = createConfig({ appName: 'x' });
    expect(config.llmFallback.onError).toBe('allow');
  });

  it('endpoint normalization strips legacy /v1/traces suffix', () => {
    const config = createConfig({
      appName: 'x',
      endpoint: 'https://api.getklira.com/v1/traces',
    });
    expect(config.endpoint).toBe('https://api.getklira.com');
  });

  it('endpoint normalization strips trailing slashes', () => {
    const config = createConfig({
      appName: 'x',
      endpoint: 'https://api.getklira.com//',
    });
    expect(config.endpoint).toBe('https://api.getklira.com');
  });
});

describe('redactSecrets', () => {
  it('redacts apiKey and Authorization fields anywhere in the tree', () => {
    const input = {
      level1: {
        apiKey: 'klira_secret',
        ok: 1,
        nested: {
          authorization: 'Bearer xxx',
          payload: { auth: 'token' },
        },
      },
    };
    const output = redactSecrets(input) as any;
    expect(output.level1.apiKey).toBe('[REDACTED]');
    expect(output.level1.ok).toBe(1);
    expect(output.level1.nested.authorization).toBe('[REDACTED]');
    expect(output.level1.nested.payload.auth).toBe('[REDACTED]');
  });

  it('passes scalars and arrays through', () => {
    expect(redactSecrets('plain')).toBe('plain');
    expect(redactSecrets([1, 2, 3])).toEqual([1, 2, 3]);
  });
});
