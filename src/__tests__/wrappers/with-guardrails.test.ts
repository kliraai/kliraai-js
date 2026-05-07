/**
 * PROD-764 Phase 5 — withGuardrails HOF.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { withGuardrails } from '../../wrappers/guardrails.js';
import { GuardrailsEngine } from '../../guardrails/engine.js';
import type { PolicyDefinition } from '../../types/index.js';
import { KliraPolicyViolation } from '../../types/index.js';

const blockSSN: PolicyDefinition[] = [
  {
    name: 'block-ssn',
    description: 'Block SSN',
    direction: 'both',
    rules: [
      {
        id: 'ssn',
        name: 'SSN',
        pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
        action: 'block',
        message: 'SSN detected',
      },
    ],
  },
];

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  context.setGlobalContextManager(new AsyncLocalStorageContextManager());
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  GuardrailsEngine.reset();
});

afterEach(async () => {
  await provider.shutdown();
  context.disable();
  trace.disable();
  GuardrailsEngine.reset();
});

describe('withGuardrails', () => {
  it('passes through when neither input nor output is blocked', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(blockSSN);
    engine['initialized'] = true;
    GuardrailsEngine.setInstance(engine);

    const fn = withGuardrails('safe-flow', async (input: string) => `echo:${input}`);
    const result = await fn('hello');
    expect(result).toBe('echo:hello');

    const spans = exporter.getFinishedSpans();
    expect(spans.find((s) => s.name === 'klira.guardrails.input')).toBeDefined();
    expect(spans.find((s) => s.name === 'klira.guardrails.output')).toBeDefined();
  });

  it('throws KliraPolicyViolation when input is blocked', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(blockSSN);
    engine['initialized'] = true;
    GuardrailsEngine.setInstance(engine);

    const fn = withGuardrails('blocked-flow', async (_x: string) => 'never-runs');
    await expect(fn('My SSN is 123-45-6789')).rejects.toBeInstanceOf(KliraPolicyViolation);

    const spans = exporter.getFinishedSpans();
    expect(spans.find((s) => s.name === 'klira.compliance.blocked')).toBeDefined();
  });

  it('throws KliraPolicyViolation when output is blocked', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(blockSSN);
    engine['initialized'] = true;
    GuardrailsEngine.setInstance(engine);

    const fn = withGuardrails('leak-flow', async () => 'My SSN is 123-45-6789');
    await expect(fn()).rejects.toBeInstanceOf(KliraPolicyViolation);
  });
});

describe('GuardrailsEngine.getInstance', () => {
  it('returns the same instance on subsequent calls', () => {
    GuardrailsEngine.reset();
    const a = GuardrailsEngine.getInstance();
    const b = GuardrailsEngine.getInstance();
    expect(a).toBe(b);
  });
});
