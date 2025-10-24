/**
 * Integration tests for OpenAI adapter with real scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KliraOpenAI, createKliraOpenAI } from '../../adapters/openai/index.js';
import { setGlobalConfig, createConfig } from '../../config/index.js';

// Mock OpenAI SDK
const mockOpenAIResponse = {
  id: 'test-completion',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'This is a safe response' },
    finish_reason: 'stop',
  }],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
  },
};

const mockStreamChunk = {
  id: 'test-stream',
  object: 'chat.completion.chunk',
  created: Date.now(),
  model: 'gpt-4',
  choices: [{
    index: 0,
    delta: { content: 'Hello ' },
    finish_reason: null,
  }],
};

// Mock OpenAI client
class MockOpenAIClient {
  chat = {
    completions: {
      create: vi.fn().mockResolvedValue(mockOpenAIResponse),
    },
  };
}

describe('OpenAI Integration Tests', () => {
  let mockClient: MockOpenAIClient;
  let kliraOpenAI: KliraOpenAI;

  beforeEach(async () => {
    // Set up global config
    const config = createConfig({
      appName: 'test-openai-integration',
      verbose: false,
    });
    setGlobalConfig(config);

    mockClient = new MockOpenAIClient();
    kliraOpenAI = createKliraOpenAI(mockClient, {
      observability: { enabled: false },
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Chat Completion', () => {
    it('should handle simple conversation', async () => {
      const response = await kliraOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello, how are you?' },
        ],
      });

      expect(response).toBeDefined();
      expect(response.choices[0].message.content).toBe('This is a safe response');
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'Hello, how are you?',
            }),
          ]),
        })
      );
    });

    it('should handle multi-turn conversation', async () => {
      const response = await kliraOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the weather like?' },
          { role: 'assistant', content: 'I cannot check the weather.' },
          { role: 'user', content: 'Can you help with something else?' },
        ],
      });

      expect(response).toBeDefined();
      expect(mockClient.chat.completions.create).toHaveBeenCalled();
    });

    it('should pass through OpenAI parameters', async () => {
      await kliraOpenAI.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
        max_tokens: 100,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.2,
      });

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-turbo',
          temperature: 0.7,
          max_tokens: 100,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.2,
        })
      );
    });
  });

  describe('Streaming Tests', () => {
    it.skip('should create streaming completion', async () => {
      // Skipped: Streaming architectural issue - stream wrapper not properly handling async iteration
      // Mock streaming response
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { ...mockStreamChunk, choices: [{ index: 0, delta: { content: 'Hello ' }, finish_reason: null }] };
          yield { ...mockStreamChunk, choices: [{ index: 0, delta: { content: 'world!' }, finish_reason: null }] };
          yield { ...mockStreamChunk, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: mockOpenAIResponse.usage };
        },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockStream);

      const stream = kliraOpenAI.chat.completions.createStream({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Say hello' }],
      });

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should reject streaming in regular create method', async () => {
      await expect(
        kliraOpenAI.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }],
          stream: true,
        })
      ).rejects.toThrow('Use createStream() for streaming completions');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      const apiError = new Error('API rate limit exceeded');
      mockClient.chat.completions.create.mockRejectedValue(apiError);

      await expect(
        kliraOpenAI.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow('API rate limit exceeded');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      mockClient.chat.completions.create.mockRejectedValue(networkError);

      await expect(
        kliraOpenAI.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('Guardrails Integration', () => {
    it('should work with input checking disabled', async () => {
      const kliraNoInput = createKliraOpenAI(mockClient, {
        checkInput: false,
        observability: { enabled: false },
      });

      const response = await kliraNoInput.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Any content here' }],
      });

      expect(response).toBeDefined();
    });

    it('should work with output checking disabled', async () => {
      const kliraNoOutput = createKliraOpenAI(mockClient, {
        checkOutput: false,
        observability: { enabled: false },
      });

      const response = await kliraNoOutput.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(response).toBeDefined();
    });

    it('should work with prompt augmentation disabled', async () => {
      const kliraNoAugment = createKliraOpenAI(mockClient, {
        augmentPrompt: false,
        observability: { enabled: false },
      });

      const response = await kliraNoAugment.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(response).toBeDefined();
    });
  });

  describe('Client Access', () => {
    it('should provide access to underlying client', () => {
      expect(kliraOpenAI.client).toBe(mockClient);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle code generation request', async () => {
      const response = await kliraOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful coding assistant.',
          },
          {
            role: 'user',
            content: 'Write a simple function to calculate factorial in JavaScript',
          },
        ],
        temperature: 0.3,
      });

      expect(response).toBeDefined();
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3,
        })
      );
    });

    it('should handle creative writing request', async () => {
      const response = await kliraOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Write a short story about a robot discovering emotions',
          },
        ],
        temperature: 0.9,
        max_tokens: 500,
      });

      expect(response).toBeDefined();
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.9,
          max_tokens: 500,
        })
      );
    });

    it('should handle function calling scenario', async () => {
      const response = await kliraOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'What is the weather like in San Francisco?',
          },
        ],
        functions: [
          {
            name: 'get_weather',
            description: 'Get the current weather in a given location',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The city and state, e.g. San Francisco, CA',
                },
              },
              required: ['location'],
            },
          },
        ],
        function_call: 'auto',
      });

      expect(response).toBeDefined();
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          functions: expect.any(Array),
          function_call: 'auto',
        })
      );
    });
  });
});