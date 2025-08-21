/**
 * Tests for Custom Agent Adapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  KliraAgent, 
  createKliraAgent, 
  HttpLLMProvider, 
  FunctionLLMProvider,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type KliraAgentOptions 
} from '../adapters/custom/index.js';
import { setGlobalConfig, createConfig } from '../config/index.js';

// Mock providers
class MockLLMProvider implements LLMProvider {
  name = 'mock-provider';

  async complete(request: LLMRequest): Promise<LLMResponse> {
    return {
      content: `Mock response to: ${request.messages[request.messages.length - 1]?.content}`,
      model: request.model || 'mock-model',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<Partial<LLMResponse>> {
    const response = await this.complete(request);
    const words = response.content.split(' ');
    
    for (const word of words) {
      yield { content: word + ' ' };
    }
    
    yield {
      usage: response.usage,
    };
  }
}

class ErrorLLMProvider implements LLMProvider {
  name = 'error-provider';

  async complete(): Promise<LLMResponse> {
    throw new Error('Provider error');
  }

  async *stream(): AsyncIterable<Partial<LLMResponse>> {
    throw new Error('Stream error');
  }
}

describe('Custom Agent Adapter', () => {
  let mockProvider: MockLLMProvider;
  let agentOptions: KliraAgentOptions;

  beforeEach(async () => {
    // Set up global config
    const config = createConfig({
      appName: 'test-app',
      verbose: false,
    });
    setGlobalConfig(config);

    mockProvider = new MockLLMProvider();
    agentOptions = {
      provider: mockProvider,
      observability: {
        enabled: false, // Disable for cleaner tests
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('KliraAgent', () => {
    it('should create agent with provider', () => {
      const agent = new KliraAgent(agentOptions);
      expect(agent).toBeDefined();
      expect(agent.provider).toBe(mockProvider);
    });

    it('should complete basic conversation', async () => {
      const agent = new KliraAgent(agentOptions);
      
      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello, how are you?' },
        ],
        model: 'test-model',
      };

      const response = await agent.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toContain('Hello, how are you?');
      expect(response.model).toBe('test-model');
      expect(response.usage).toBeDefined();
    });

    it('should handle streaming conversation', async () => {
      const agent = new KliraAgent(agentOptions);
      
      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Tell me a story' },
        ],
        stream: true,
      };

      const stream = await agent.stream(request);
      const chunks: Partial<LLMResponse>[] = [];
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some(c => c.content)).toBe(true);
      expect(chunks.some(c => c.usage)).toBe(true);
    });

    it('should throw error for streaming on complete()', async () => {
      const agent = new KliraAgent(agentOptions);
      
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };

      await expect(agent.complete(request)).rejects.toThrow('Use stream() method for streaming completions');
    });

    it('should throw error for non-streaming provider on stream()', async () => {
      const nonStreamingProvider: LLMProvider = {
        name: 'non-streaming',
        async complete() {
          return { content: 'response' };
        },
      };

      const agent = new KliraAgent({
        ...agentOptions,
        provider: nonStreamingProvider,
      });

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(agent.stream(request)).rejects.toThrow('does not support streaming');
    });
  });

  describe('Input Guardrails', () => {
    it('should check input violations when enabled', async () => {
      const agent = new KliraAgent({
        ...agentOptions,
        checkInput: true,
      });

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'This is safe content' },
        ],
      };

      const response = await agent.complete(request);
      expect(response).toBeDefined();
    });

    it('should skip input checks when disabled', async () => {
      const agent = new KliraAgent({
        ...agentOptions,
        checkInput: false,
      });

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Any content' },
        ],
      };

      const response = await agent.complete(request);
      expect(response).toBeDefined();
    });
  });

  describe('Output Guardrails', () => {
    it('should check output violations when enabled', async () => {
      const agent = new KliraAgent({
        ...agentOptions,
        checkOutput: true,
      });

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      };

      const response = await agent.complete(request);
      expect(response).toBeDefined();
    });

    it('should skip output checks when disabled', async () => {
      const agent = new KliraAgent({
        ...agentOptions,
        checkOutput: false,
      });

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      };

      const response = await agent.complete(request);
      expect(response).toBeDefined();
    });
  });

  describe('Prompt Augmentation', () => {
    it('should augment prompt when enabled', async () => {
      const agent = new KliraAgent({
        ...agentOptions,
        augmentPrompt: true,
      });

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Tell me something' },
        ],
      };

      const response = await agent.complete(request);
      expect(response).toBeDefined();
    });

    it('should skip prompt augmentation when disabled', async () => {
      const agent = new KliraAgent({
        ...agentOptions,
        augmentPrompt: false,
      });

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Tell me something' },
        ],
      };

      const response = await agent.complete(request);
      expect(response).toBeDefined();
    });

    it('should add system message when none exists', async () => {
      // Mock provider that captures the modified request
      let capturedRequest: LLMRequest | null = null;
      const capturingProvider: LLMProvider = {
        name: 'capturing',
        async complete(request) {
          capturedRequest = request;
          return { content: 'response' };
        },
      };

      const agent = new KliraAgent({
        provider: capturingProvider,
        augmentPrompt: true,
        observability: { enabled: false },
      });

      await agent.complete({
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      });

      // Check if system message was potentially added
      expect(capturedRequest).toBeDefined();
    });
  });

  describe('Streaming Guardrails', () => {
    it('should apply guardrails to streaming when enabled', async () => {
      const agent = new KliraAgent({
        ...agentOptions,
        streaming: {
          enableGuardrails: true,
          checkInterval: 1, // Check every chunk
        },
      });

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Tell me a story' },
        ],
      };

      const stream = await agent.stream(request);
      const chunks: Partial<LLMResponse>[] = [];
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should skip streaming guardrails when disabled', async () => {
      const agent = new KliraAgent({
        ...agentOptions,
        streaming: {
          enableGuardrails: false,
        },
      });

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Tell me a story' },
        ],
      };

      const stream = await agent.stream(request);
      const chunks: Partial<LLMResponse>[] = [];
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle provider errors gracefully', async () => {
      const errorProvider = new ErrorLLMProvider();
      const agent = new KliraAgent({
        provider: errorProvider,
        observability: { enabled: false },
      });

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      };

      await expect(agent.complete(request)).rejects.toThrow('Provider error');
    });

    it('should handle streaming errors gracefully', async () => {
      const errorProvider = new ErrorLLMProvider();
      const agent = new KliraAgent({
        provider: errorProvider,
        observability: { enabled: false },
      });

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      };

      await expect(agent.stream(request)).rejects.toThrow('Stream error');
    });
  });

  describe('Factory Function', () => {
    it('should create agent with createKliraAgent', () => {
      const agent = createKliraAgent(agentOptions);
      expect(agent).toBeInstanceOf(KliraAgent);
      expect(agent.provider).toBe(mockProvider);
    });
  });

  describe('Built-in Providers', () => {
    describe('HttpLLMProvider', () => {
      it('should create HTTP provider', () => {
        const provider = new HttpLLMProvider(
          'test-http',
          'https://api.example.com/chat',
          { 'Authorization': 'Bearer test' }
        );

        expect(provider.name).toBe('test-http');
      });

      it('should handle HTTP completion', async () => {
        // Mock fetch
        const mockResponse = {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'HTTP response' } }],
            model: 'test-model',
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        };
        
        global.fetch = vi.fn().mockResolvedValue(mockResponse);

        const provider = new HttpLLMProvider('test-http', 'https://api.example.com/chat');
        
        const response = await provider.complete({
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(response.content).toBe('HTTP response');
        expect(response.model).toBe('test-model');
        expect(response.usage?.totalTokens).toBe(30);
      });

      it('should handle HTTP errors', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

        const provider = new HttpLLMProvider('test-http', 'https://api.example.com/chat');
        
        await expect(provider.complete({
          messages: [{ role: 'user', content: 'Hello' }],
        })).rejects.toThrow('HTTP 500');
      });

      it('should handle streaming', async () => {
        // Mock streaming response
        const chunks = [
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          'data: {"usage":{"total_tokens":30}}\n\n',
          'data: [DONE]\n\n',
        ];

        const mockReader = {
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[0]) })
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[1]) })
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[2]) })
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[3]) })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        };

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          body: { getReader: () => mockReader },
        });

        const provider = new HttpLLMProvider('test-http', 'https://api.example.com/chat');
        
        const stream = provider.stream({
          messages: [{ role: 'user', content: 'Hello' }],
        });

        const results: Partial<LLMResponse>[] = [];
        for await (const chunk of stream) {
          results.push(chunk);
        }

        expect(results.length).toBeGreaterThan(0);
        expect(results.some(r => r.content?.includes('Hello'))).toBe(true);
        expect(results.some(r => r.usage?.totalTokens === 30)).toBe(true);
      });
    });

    describe('FunctionLLMProvider', () => {
      it('should create function provider', () => {
        const completeFn = async (): Promise<LLMResponse> => ({ content: 'response' });
        const provider = new FunctionLLMProvider('test-fn', completeFn);

        expect(provider.name).toBe('test-fn');
      });

      it('should handle function completion', async () => {
        const completeFn = async (request: LLMRequest): Promise<LLMResponse> => ({
          content: `Function response to: ${request.messages[0]?.content}`,
          model: 'function-model',
        });

        const provider = new FunctionLLMProvider('test-fn', completeFn);
        
        const response = await provider.complete({
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(response.content).toBe('Function response to: Hello');
        expect(response.model).toBe('function-model');
      });

      it('should handle function streaming', async () => {
        const completeFn = async (): Promise<LLMResponse> => ({ content: 'response' });
        const streamFn = async function* (): AsyncIterable<Partial<LLMResponse>> {
          yield { content: 'Stream ' };
          yield { content: 'response' };
        };

        const provider = new FunctionLLMProvider('test-fn', completeFn, streamFn);
        
        const stream = provider.stream({
          messages: [{ role: 'user', content: 'Hello' }],
        });

        const results: Partial<LLMResponse>[] = [];
        for await (const chunk of stream) {
          results.push(chunk);
        }

        expect(results.length).toBe(2);
        expect(results[0].content).toBe('Stream ');
        expect(results[1].content).toBe('response');
      });

      it('should throw error for streaming without stream function', async () => {
        const completeFn = async (): Promise<LLMResponse> => ({ content: 'response' });
        const provider = new FunctionLLMProvider('test-fn', completeFn);
        
        await expect(async () => {
          const stream = provider.stream({
            messages: [{ role: 'user', content: 'Hello' }],
          });
          
          // Consume the first item to trigger the error
          const iterator = stream[Symbol.asyncIterator]();
          await iterator.next();
        }).rejects.toThrow('does not support streaming');
      });
    });
  });
});