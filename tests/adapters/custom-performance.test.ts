import { describe, it, expect, beforeAll } from 'vitest';
import { KliraAI } from '../../src';
import { guardrails } from '../../src/adapters/custom';

describe('Custom Adapter Performance Integration', () => {
  beforeAll(async () => {
    await KliraAI.init({
      appName: 'custom-test',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: true,
        policies: [
          {
            policyId: 'custom-policy',
            name: 'Custom Policy',
            direction: 'both',
            mustMatch: ['secret', 'confidential'],
            action: 'log',
            guidelines: [
              'Handle confidential data with care',
            ],
          },
        ],
      },
    });
  });

  it('should apply guardrails with decorator and minimal overhead', async () => {
    class TestAgent {
      @guardrails()
      async processInput(input: string): Promise<string> {
        // Simulate some processing
        await new Promise(resolve => setTimeout(resolve, 10));
        return `Processed: ${input}`;
      }
    }

    const agent = new TestAgent();

    const start = performance.now();

    // This will trigger augmentation
    const result = await agent.processInput('This is a secret document');

    const duration = performance.now() - start;

    // ✅ Total time should be reasonable (processing + guardrails)
    // Account for the 10ms simulated processing
    expect(duration).toBeLessThan(100);

    expect(result).toContain('Processed:');
  });

  it('should handle manual wrapping with correct performance', async () => {
    async function customLLMCall(prompt: string): Promise<string> {
      // Simulate LLM call
      await new Promise(resolve => setTimeout(resolve, 10));
      return `Response to: ${prompt}`;
    }

    const guardrailsEngine = KliraAI.getGuardrails();

    const start = performance.now();

    // Manual guardrails check
    const inputResult = await guardrailsEngine.evaluateInput('confidential data here');

    if (!inputResult.blocked) {
      const response = await customLLMCall('confidential data here');
      const outputResult = await guardrailsEngine.evaluateOutput(response);

      expect(outputResult).toBeDefined();
    }

    const duration = performance.now() - start;

    // ✅ Manual wrapping should be efficient
    // Account for the 10ms simulated processing
    expect(duration).toBeLessThan(100);
  });

  it('should not double-execute with decorator', async () => {
    let executionCount = 0;

    class TestAgent {
      @guardrails()
      async processInput(input: string): Promise<string> {
        executionCount++;
        return `Processed: ${input}`;
      }
    }

    const agent = new TestAgent();

    await agent.processInput('This is a secret document');

    // ✅ Should only execute once
    expect(executionCount).toBe(1);
  });

  it('should handle multiple sequential calls efficiently', async () => {
    class TestAgent {
      @guardrails()
      async processInput(input: string): Promise<string> {
        return `Processed: ${input}`;
      }
    }

    const agent = new TestAgent();
    const iterations = 10;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await agent.processInput('test input');
      durations.push(performance.now() - start);
    }

    const avg = durations.reduce((a, b) => a + b, 0) / iterations;

    // ✅ Average should be reasonable
    expect(avg).toBeLessThan(50);
  });

  it('should handle both input and output evaluation efficiently', async () => {
    const guardrailsEngine = KliraAI.getGuardrails();

    const start = performance.now();

    // Evaluate input
    const inputResult = await guardrailsEngine.evaluateInput('confidential data');
    expect(inputResult).toBeDefined();

    // Evaluate output
    const outputResult = await guardrailsEngine.evaluateOutput('Here is the response');
    expect(outputResult).toBeDefined();

    const duration = performance.now() - start;

    // ✅ Both evaluations should complete quickly
    expect(duration).toBeLessThan(100);
  });
});
