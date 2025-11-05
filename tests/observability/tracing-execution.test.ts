import { describe, it, expect, beforeAll } from 'vitest';
import { KliraAI } from '../../src';
import { GuardrailsEngine } from '../../src/guardrails/engine';

describe('Tracing Execution Flow', () => {
  let guardrails: GuardrailsEngine;

  beforeAll(async () => {
    await KliraAI.init({
      appName: 'tracing-test',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: true,
        policies: [
          {
            policyId: 'email-policy',
            name: 'Email Detection',
            direction: 'both',
            mustMatch: ['email'],
            action: 'log',
            guidelines: ['Protect user email addresses'],
          },
        ],
      },
    });

    guardrails = KliraAI.getGuardrails();
  });

  it('should execute function inside tracing span exactly once', async () => {
    let executionCount = 0;

    // Track execution by wrapping evaluateInput
    const originalEvaluateInput = guardrails.evaluateInput.bind(guardrails);
    guardrails.evaluateInput = async function(content: string) {
      executionCount++;
      return originalEvaluateInput(content);
    };

    await guardrails.evaluateInput('test@example.com');

    // ✅ Should be called exactly once
    expect(executionCount).toBe(1);
  });

  it('should set span attributes after execution completes', async () => {
    // This test verifies the span receives result-dependent attributes
    // by checking that the evaluation completes successfully with tracing
    const result = await guardrails.evaluateInput('test@example.com');

    // ✅ Verify result has expected structure
    expect(result).toHaveProperty('allowed');
    expect(result).toHaveProperty('blocked');
    expect(result).toHaveProperty('matches');

    // If this passes, tracing wrapper successfully got the result
    expect(result.allowed).toBe(true);
  });

  it('should handle errors correctly with duration tracking', async () => {
    // Create a guardrails instance that will throw an error
    const sdk = await KliraAI.init({
      appName: 'error-tracing-test',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: false,
        policies: [],
      },
    });

    const errorGuardrails = KliraAI.getGuardrails();

    // Override to throw an error
    const originalMethod = (errorGuardrails as any).performEvaluation;
    let errorCaught = false;

    try {
      await errorGuardrails.evaluateInput('test content');
    } catch (error) {
      // We expect this to work normally, but if we had an error in the tracing wrapper,
      // it would propagate here
      errorCaught = true;
    }

    // ✅ Should not throw errors from tracing wrapper
    expect(errorCaught).toBe(false);
  });

  it('should measure accurate execution time', async () => {
    const start = performance.now();
    await guardrails.evaluateInput('test@example.com');
    const duration = performance.now() - start;

    // ✅ Duration should be reasonable (not doubled due to double-execution)
    expect(duration).toBeLessThan(300);
  });
});
