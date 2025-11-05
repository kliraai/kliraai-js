import { describe, it, expect, beforeAll, vi } from 'vitest';
import { KliraAI } from '../../src';
import { wrapGenerateText, wrapStreamText } from '../../src/adapters/vercel-ai';

describe('Vercel AI Performance Integration', () => {
  beforeAll(async () => {
    await KliraAI.init({
      appName: 'vercel-test',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: true,
        policies: [
          {
            policyId: 'pii-policy',
            name: 'PII Detection',
            direction: 'input',
            mustMatch: ['email', 'ssn'],
            action: 'log',
            guidelines: [
              'Do not process sensitive PII',
              'Protect user privacy',
            ],
          },
        ],
      },
    });
  });

  it('should apply augmentation with minimal overhead', async () => {
    // Mock generateText
    const mockGenerateText = vi.fn().mockResolvedValue({
      text: 'Mock response',
      usage: { totalTokens: 50 },
    });

    const wrappedGenerateText = wrapGenerateText(mockGenerateText as any);

    const start = performance.now();

    // This will trigger augmentation due to email PII
    await wrappedGenerateText({
      model: {} as any,
      prompt: 'My email is test@example.com',
    });

    const duration = performance.now() - start;

    // ✅ Total time should be minimal (guardrails + mock call)
    expect(duration).toBeLessThan(100);

    // Verify the mock was called
    expect(mockGenerateText).toHaveBeenCalled();
  });

  it('should handle non-augmented calls efficiently', async () => {
    // Mock generateText
    const mockGenerateText = vi.fn().mockResolvedValue({
      text: 'Mock response',
      usage: { totalTokens: 50 },
    });

    const wrappedGenerateText = wrapGenerateText(mockGenerateText as any);

    const start = performance.now();

    // This will NOT trigger augmentation
    await wrappedGenerateText({
      model: {} as any,
      prompt: 'Hello world',
    });

    const duration = performance.now() - start;

    // ✅ Total time should be minimal
    expect(duration).toBeLessThan(50);

    // Verify the mock was called
    expect(mockGenerateText).toHaveBeenCalled();
  });

  it('should handle streaming with correct performance', async () => {
    // Mock streamText
    async function* mockStream() {
      yield { textDelta: 'Hello' };
      yield { textDelta: ' world' };
    }

    const mockStreamText = vi.fn().mockResolvedValue({
      textStream: mockStream(),
    });

    const wrappedStreamText = wrapStreamText(mockStreamText as any);

    const start = performance.now();

    const result = await wrappedStreamText({
      model: {} as any,
      prompt: 'Count to 3',
    });

    // Consume the stream
    const chunks = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    const duration = performance.now() - start;

    // ✅ Streaming should work with reasonable performance
    expect(duration).toBeLessThan(100);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should not double-execute with augmentation', async () => {
    let callCount = 0;
    const mockGenerateText = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        text: 'Mock response',
        usage: { totalTokens: 50 },
      };
    });

    const wrappedGenerateText = wrapGenerateText(mockGenerateText as any);

    await wrappedGenerateText({
      model: {} as any,
      prompt: 'My email is test@example.com',
    });

    // ✅ Should only call the underlying function once
    expect(callCount).toBe(1);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });
});
