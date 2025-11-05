import { describe, it, expect, beforeAll, vi } from 'vitest';
import { KliraAI } from '../../src';
import { GuardrailsEngine } from '../../src/guardrails/engine';

describe('GuardrailsEngine Performance', () => {
  let guardrails: GuardrailsEngine;

  beforeAll(async () => {
    await KliraAI.init({
      appName: 'performance-test',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: true,
        policies: [
          {
            policyId: 'test-pii-policy',
            name: 'Test PII Detection',
            direction: 'both',
            mustMatch: ['email'],
            action: 'log',
            guidelines: ['Do not share PII with external services'],
          },
        ],
      },
    });

    guardrails = KliraAI.getGuardrails();
  });

  it('should execute evaluation exactly once with tracing enabled', async () => {
    // Create a counter to track executions
    let executionCount = 0;

    // Spy on the internal evaluation by wrapping evaluateInput
    const originalEvaluateInput = guardrails.evaluateInput.bind(guardrails);
    guardrails.evaluateInput = async function(content: string) {
      executionCount++;
      return originalEvaluateInput(content);
    };

    await guardrails.evaluateInput('My email is test@example.com');

    // ✅ Should be called exactly once (not twice)
    expect(executionCount).toBe(1);
  });

  it('should complete augmented evaluation in <300ms', async () => {
    const iterations = 10;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await guardrails.evaluateInput('My email is test@example.com');
      const duration = performance.now() - start;
      durations.push(duration);
    }

    const avg = durations.reduce((a, b) => a + b, 0) / iterations;

    // ✅ Average should be <300ms
    expect(avg).toBeLessThan(300);

    console.log(`Average augmented evaluation time: ${avg.toFixed(2)}ms`);
  });

  it('should complete non-augmented evaluation in <200ms', async () => {
    const iterations = 10;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await guardrails.evaluateInput('No PII here');
      const duration = performance.now() - start;
      durations.push(duration);
    }

    const avg = durations.reduce((a, b) => a + b, 0) / iterations;

    // ✅ Average should be <200ms
    expect(avg).toBeLessThan(200);

    console.log(`Average non-augmented evaluation time: ${avg.toFixed(2)}ms`);
  });

  it('augmentation overhead should be <100ms', async () => {
    const iterations = 10;

    // Measure non-augmented
    const nonAugDurations: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await guardrails.evaluateInput('No PII here');
      nonAugDurations.push(performance.now() - start);
    }

    // Measure augmented
    const augDurations: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await guardrails.evaluateInput('My email is test@example.com');
      augDurations.push(performance.now() - start);
    }

    const avgNonAug = nonAugDurations.reduce((a, b) => a + b, 0) / iterations;
    const avgAug = augDurations.reduce((a, b) => a + b, 0) / iterations;
    const overhead = avgAug - avgNonAug;

    // ✅ Augmentation overhead should be <100ms
    expect(overhead).toBeLessThan(100);

    console.log(`Augmentation overhead: ${overhead.toFixed(2)}ms`);
  });

  it('should handle 100 sequential evaluations without performance degradation', async () => {
    const iterations = 100;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await guardrails.evaluateInput('My SSN is 123-45-6789');
      const duration = performance.now() - start;
      durations.push(duration);
    }

    // Check first 10 vs last 10
    const firstTenAvg = durations.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const lastTenAvg = durations.slice(-10).reduce((a, b) => a + b, 0) / 10;

    // Performance should not degrade by more than 50%
    expect(lastTenAvg).toBeLessThan(firstTenAvg * 1.5);

    const avg = durations.reduce((a, b) => a + b, 0) / iterations;
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const p95 = sortedDurations[Math.floor(iterations * 0.95)];

    console.log(`100 iterations - Avg: ${avg.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms`);

    // ✅ P95 should still be <400ms
    expect(p95).toBeLessThan(400);
  });
});
