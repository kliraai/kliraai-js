import { describe, it, expect, beforeAll, vi } from 'vitest';
import { KliraAI } from '../../src';
import { wrapOpenAI } from '../../src/adapters/openai';

describe('OpenAI SDK Performance Integration', () => {
  beforeAll(async () => {
    await KliraAI.init({
      appName: 'openai-test',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: true,
        policies: [
          {
            policyId: 'pii-policy',
            name: 'PII Detection',
            direction: 'input',
            mustMatch: ['email', 'phone'],
            action: 'log',
            guidelines: [
              'Do not share personal contact information',
              'Protect user privacy',
            ],
          },
        ],
      },
    });
  });

  it('should apply augmentation with minimal overhead in OpenAI call', async () => {
    // Mock OpenAI client
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-3.5-turbo',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Mock response',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
        },
      },
    };

    const wrappedClient = wrapOpenAI(mockClient as any);

    const start = performance.now();

    // This will trigger augmentation due to email PII
    await wrappedClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'user', content: 'My email is test@example.com' },
      ],
      max_tokens: 50,
    });

    const duration = performance.now() - start;

    // ✅ Total time should be reasonable (guardrails + mock call)
    expect(duration).toBeLessThan(100);
  });

  it('should handle non-augmented calls efficiently', async () => {
    // Mock OpenAI client
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-3.5-turbo',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Mock response',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
        },
      },
    };

    const wrappedClient = wrapOpenAI(mockClient as any);

    const start = performance.now();

    // No PII in this message
    await wrappedClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello world' }],
      max_tokens: 50,
    });

    const duration = performance.now() - start;

    // ✅ Should be even faster without augmentation
    expect(duration).toBeLessThan(50);
  });

  it('should handle streaming with correct performance', async () => {
    // Mock streaming response
    async function* mockStream() {
      yield {
        id: 'test-id',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            delta: { content: 'Hello' },
            finish_reason: null,
          },
        ],
      };
      yield {
        id: 'test-id',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            delta: { content: ' world' },
            finish_reason: null,
          },
        ],
      };
      yield {
        id: 'test-id',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      };
    }

    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(mockStream()),
        },
      },
    };

    const wrappedClient = wrapOpenAI(mockClient as any);

    const start = performance.now();

    const stream = await wrappedClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Count to 3' }],
      stream: true,
      max_tokens: 20,
    });

    let chunks = 0;
    for await (const chunk of stream) {
      chunks++;
    }

    const duration = performance.now() - start;

    // ✅ Streaming should work with reasonable performance
    expect(duration).toBeLessThan(100);
    expect(chunks).toBeGreaterThan(0);
  });

  it('should not double-execute evaluation', async () => {
    let callCount = 0;
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async () => {
            callCount++;
            return {
              id: 'test-id',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: 'Mock response',
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            };
          }),
        },
      },
    };

    const wrappedClient = wrapOpenAI(mockClient as any);

    await wrappedClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'My email is test@example.com' }],
      max_tokens: 50,
    });

    // ✅ Should only call once
    expect(callCount).toBe(1);
  });
});
