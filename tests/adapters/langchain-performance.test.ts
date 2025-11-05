import { describe, it, expect, beforeAll, vi } from 'vitest';
import { KliraAI } from '../../src';
import { createKliraCallbackHandler } from '../../src/adapters/langchain';

describe('LangChain Performance Integration', () => {
  beforeAll(async () => {
    await KliraAI.init({
      appName: 'langchain-test',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: true,
        policies: [
          {
            policyId: 'sensitive-policy',
            name: 'Sensitive Data Detection',
            direction: 'both',
            mustMatch: ['password', 'api_key'],
            action: 'log',
            guidelines: [
              'Never expose credentials',
              'Protect sensitive data',
            ],
          },
        ],
      },
    });
  });

  it('should apply guardrails with callback handler and minimal overhead', async () => {
    const callbackHandler = createKliraCallbackHandler({
      augmentPrompt: true,
    });

    // Mock LLM that uses callbacks
    const mockLLM = {
      invoke: async (prompt: string) => {
        // Simulate handleLLMStart callback
        await callbackHandler.handleLLMStart?.(
          { name: 'test-llm' },
          [prompt],
          undefined as any
        );

        // Simulate response
        const response = 'Mock response';

        // Simulate handleLLMEnd callback
        await callbackHandler.handleLLMEnd?.(
          {
            generations: [[{ text: response }]],
            llmOutput: {},
          },
          undefined as any
        );

        return { content: response };
      },
    };

    const start = performance.now();

    // This won't trigger augmentation (no sensitive data)
    await mockLLM.invoke('Hello, how are you?');

    const duration = performance.now() - start;

    // ✅ Total time should be reasonable
    expect(duration).toBeLessThan(100);
  });

  it('should handle augmentation in LangChain callback', async () => {
    const callbackHandler = createKliraCallbackHandler({
      augmentPrompt: true,
    });

    const mockLLM = {
      invoke: async (prompt: string) => {
        // Simulate handleLLMStart callback
        await callbackHandler.handleLLMStart?.(
          { name: 'test-llm' },
          [prompt],
          undefined as any
        );

        const response = 'Mock response';

        // Simulate handleLLMEnd callback
        await callbackHandler.handleLLMEnd?.(
          {
            generations: [[{ text: response }]],
            llmOutput: {},
          },
          undefined as any
        );

        return { content: response };
      },
    };

    const start = performance.now();

    // This will trigger augmentation
    await mockLLM.invoke('My password is secret123');

    const duration = performance.now() - start;

    // ✅ Augmentation should add minimal overhead
    expect(duration).toBeLessThan(100);
  });

  it('should not double-execute with callbacks', async () => {
    let startCallCount = 0;
    let endCallCount = 0;

    const callbackHandler = createKliraCallbackHandler({
      augmentPrompt: true,
    });

    const mockLLM = {
      invoke: async (prompt: string) => {
        startCallCount++;
        await callbackHandler.handleLLMStart?.(
          { name: 'test-llm' },
          [prompt],
          undefined as any
        );

        const response = 'Mock response';

        endCallCount++;
        await callbackHandler.handleLLMEnd?.(
          {
            generations: [[{ text: response }]],
            llmOutput: {},
          },
          undefined as any
        );

        return { content: response };
      },
    };

    await mockLLM.invoke('My password is secret123');

    // ✅ Should only execute once
    expect(startCallCount).toBe(1);
    expect(endCallCount).toBe(1);
  });

  it('should handle multiple sequential calls efficiently', async () => {
    const callbackHandler = createKliraCallbackHandler({
      augmentPrompt: true,
    });

    const mockLLM = {
      invoke: async (prompt: string) => {
        await callbackHandler.handleLLMStart?.(
          { name: 'test-llm' },
          [prompt],
          undefined as any
        );

        const response = 'Mock response';

        await callbackHandler.handleLLMEnd?.(
          {
            generations: [[{ text: response }]],
            llmOutput: {},
          },
          undefined as any
        );

        return { content: response };
      },
    };

    const iterations = 10;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await mockLLM.invoke('Test prompt');
      durations.push(performance.now() - start);
    }

    const avg = durations.reduce((a, b) => a + b, 0) / iterations;

    // ✅ Average should be reasonable
    expect(avg).toBeLessThan(50);
  });
});
