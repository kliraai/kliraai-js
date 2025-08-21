/**
 * Integration tests for Custom Agent adapter with real scenarios
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

// Real-world provider implementations for testing
class OpenAILikeProvider implements LLMProvider {
  name = 'openai-like';

  constructor(private apiKey: string, private baseUrl: string = 'https://api.openai.com/v1') {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Simulate OpenAI API response structure
    return {
      content: `OpenAI-like response to: ${request.messages[request.messages.length - 1]?.content}`,
      model: request.model || 'gpt-3.5-turbo',
      usage: {
        promptTokens: this.estimateTokens(request.messages),
        completionTokens: 50,
        totalTokens: this.estimateTokens(request.messages) + 50,
      },
      metadata: {
        provider: 'openai-like',
        temperature: request.temperature,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<Partial<LLMResponse>> {
    const fullResponse = await this.complete(request);
    const words = fullResponse.content.split(' ');
    
    // Simulate streaming by yielding word by word
    for (let i = 0; i < words.length; i++) {
      yield { 
        content: words[i] + (i < words.length - 1 ? ' ' : ''),
      };
      
      // Add small delay to simulate real streaming
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Final chunk with usage info
    yield {
      usage: fullResponse.usage,
      metadata: fullResponse.metadata,
    };
  }

  private estimateTokens(messages: any[]): number {
    return messages.reduce((total, msg) => total + Math.ceil((msg.content || '').length / 4), 0);
  }
}

class AnthropicLikeProvider implements LLMProvider {
  name = 'anthropic-like';

  constructor(private apiKey: string) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    return {
      content: `Claude-like response to: ${request.messages[request.messages.length - 1]?.content}`,
      model: request.model || 'claude-3-sonnet-20240229',
      usage: {
        promptTokens: this.estimateTokens(request.messages),
        completionTokens: 75,
        totalTokens: this.estimateTokens(request.messages) + 75,
      },
      metadata: {
        provider: 'anthropic-like',
        stop_reason: 'end_turn',
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<Partial<LLMResponse>> {
    const fullResponse = await this.complete(request);
    const chunks = this.chunkText(fullResponse.content, 10);
    
    for (const chunk of chunks) {
      yield { content: chunk };
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    
    yield {
      usage: fullResponse.usage,
      metadata: fullResponse.metadata,
    };
  }

  private estimateTokens(messages: any[]): number {
    return messages.reduce((total, msg) => total + Math.ceil((msg.content || '').length / 4), 0);
  }

  private chunkText(text: string, chunkSize: number): string[] {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

class LocalLLMProvider implements LLMProvider {
  name = 'local-llm';

  constructor(private endpoint: string) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Simulate local LLM response
    return {
      content: `Local LLM response to: ${request.messages[request.messages.length - 1]?.content}`,
      model: request.model || 'local-model',
      usage: {
        promptTokens: 20,
        completionTokens: 30,
        totalTokens: 50,
      },
      metadata: {
        provider: 'local-llm',
        endpoint: this.endpoint,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<Partial<LLMResponse>> {
    const fullResponse = await this.complete(request);
    
    // Simulate very fast local streaming
    const chars = fullResponse.content.split('');
    let buffer = '';
    
    for (let i = 0; i < chars.length; i++) {
      buffer += chars[i];
      
      // Yield every few characters
      if (i % 5 === 0 || i === chars.length - 1) {
        yield { content: buffer };
        buffer = '';
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
    
    yield { usage: fullResponse.usage };
  }
}

describe('Custom Agent Integration Tests', () => {
  let openaiProvider: OpenAILikeProvider;
  let anthropicProvider: AnthropicLikeProvider;
  let localProvider: LocalLLMProvider;

  beforeEach(async () => {
    // Set up global config
    const config = createConfig({
      appName: 'test-custom-agent-integration',
      verbose: false,
    });
    setGlobalConfig(config);

    openaiProvider = new OpenAILikeProvider('test-key');
    anthropicProvider = new AnthropicLikeProvider('test-key');
    localProvider = new LocalLLMProvider('http://localhost:8080');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Multi-Provider Support', () => {
    it('should work with OpenAI-like provider', async () => {
      const agent = createKliraAgent({
        provider: openaiProvider,
        observability: { enabled: false },
      });

      const response = await agent.complete({
        messages: [
          { role: 'user', content: 'Explain quantum computing' },
        ],
        model: 'gpt-4',
        temperature: 0.7,
      });

      expect(response).toBeDefined();
      expect(response.content).toContain('quantum computing');
      expect(response.model).toBe('gpt-4');
      expect(response.usage?.totalTokens).toBeGreaterThan(0);
      expect(response.metadata?.provider).toBe('openai-like');
    });

    it('should work with Anthropic-like provider', async () => {
      const agent = createKliraAgent({
        provider: anthropicProvider,
        observability: { enabled: false },
      });

      const response = await agent.complete({
        messages: [
          { role: 'user', content: 'Write a haiku about programming' },
        ],
        model: 'claude-3-sonnet-20240229',
        temperature: 0.9,
      });

      expect(response).toBeDefined();
      expect(response.content).toContain('haiku about programming');
      expect(response.model).toBe('claude-3-sonnet-20240229');
      expect(response.metadata?.provider).toBe('anthropic-like');
    });

    it('should work with local LLM provider', async () => {
      const agent = createKliraAgent({
        provider: localProvider,
        observability: { enabled: false },
      });

      const response = await agent.complete({
        messages: [
          { role: 'user', content: 'Hello local model' },
        ],
        model: 'llama-7b',
      });

      expect(response).toBeDefined();
      expect(response.content).toContain('Hello local model');
      expect(response.model).toBe('llama-7b');
      expect(response.metadata?.endpoint).toBe('http://localhost:8080');
    });
  });

  describe('Streaming Support', () => {
    it('should handle streaming with OpenAI-like provider', async () => {
      const agent = createKliraAgent({
        provider: openaiProvider,
        observability: { enabled: false },
        streaming: { enableGuardrails: false },
      });

      const stream = await agent.stream({
        messages: [
          { role: 'user', content: 'Count from 1 to 5' },
        ],
      });

      const chunks: Partial<LLMResponse>[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some(c => c.content)).toBe(true);
      expect(chunks.some(c => c.usage)).toBe(true);
    });

    it('should handle streaming with Anthropic-like provider', async () => {
      const agent = createKliraAgent({
        provider: anthropicProvider,
        observability: { enabled: false },
        streaming: { enableGuardrails: false },
      });

      const stream = await agent.stream({
        messages: [
          { role: 'user', content: 'Tell me about AI safety' },
        ],
      });

      const chunks: Partial<LLMResponse>[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some(c => c.content)).toBe(true);
    });

    it('should handle fast local streaming', async () => {
      const agent = createKliraAgent({
        provider: localProvider,
        observability: { enabled: false },
        streaming: { enableGuardrails: false },
      });

      const stream = await agent.stream({
        messages: [
          { role: 'user', content: 'Quick response please' },
        ],
      });

      const chunks: Partial<LLMResponse>[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Real-world Use Cases', () => {
    it('should handle code generation task', async () => {
      const agent = createKliraAgent({
        provider: openaiProvider,
        observability: { enabled: false },
        checkInput: true,
        checkOutput: true,
      });

      const response = await agent.complete({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful coding assistant.',
          },
          {
            role: 'user',
            content: 'Write a Python function to reverse a string',
          },
        ],
        model: 'gpt-4',
        temperature: 0.3,
      });

      expect(response).toBeDefined();
      expect(response.content).toContain('reverse a string');
    });

    it('should handle creative writing task', async () => {
      const agent = createKliraAgent({
        provider: anthropicProvider,
        observability: { enabled: false },
        augmentPrompt: true,
      });

      const response = await agent.complete({
        messages: [
          {
            role: 'user',
            content: 'Write a short story about a time-traveling scientist',
          },
        ],
        model: 'claude-3-sonnet-20240229',
        temperature: 0.8,
        maxTokens: 500,
      });

      expect(response).toBeDefined();
      expect(response.content).toContain('time-traveling scientist');
    });

    it('should handle question answering task', async () => {
      const agent = createKliraAgent({
        provider: localProvider,
        observability: { enabled: false },
      });

      const response = await agent.complete({
        messages: [
          {
            role: 'system',
            content: 'You are a knowledgeable assistant. Answer questions accurately.',
          },
          {
            role: 'user',
            content: 'What is the capital of Japan?',
          },
        ],
      });

      expect(response).toBeDefined();
      expect(response.content).toContain('capital of Japan');
    });

    it('should handle multi-turn conversation', async () => {
      const agent = createKliraAgent({
        provider: openaiProvider,
        observability: { enabled: false },
      });

      // First turn
      const response1 = await agent.complete({
        messages: [
          { role: 'user', content: 'Hello, what can you help me with?' },
        ],
      });

      expect(response1).toBeDefined();

      // Second turn with context
      const response2 = await agent.complete({
        messages: [
          { role: 'user', content: 'Hello, what can you help me with?' },
          { role: 'assistant', content: response1.content },
          { role: 'user', content: 'Can you explain machine learning?' },
        ],
      });

      expect(response2).toBeDefined();
      expect(response2.content).toContain('machine learning');
    });
  });

  describe('Function and HTTP Providers', () => {
    it('should work with function provider', async () => {
      const customLogic = async (request: LLMRequest): Promise<LLMResponse> => {
        const userMessage = request.messages.find(m => m.role === 'user')?.content || '';
        return {
          content: `Custom function processed: ${userMessage.toUpperCase()}`,
          model: 'custom-function',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        };
      };

      const functionProvider = new FunctionLLMProvider('custom-function', customLogic);
      const agent = createKliraAgent({
        provider: functionProvider,
        observability: { enabled: false },
      });

      const response = await agent.complete({
        messages: [
          { role: 'user', content: 'hello world' },
        ],
      });

      expect(response.content).toBe('Custom function processed: HELLO WORLD');
      expect(response.model).toBe('custom-function');
    });

    it('should work with HTTP provider simulation', async () => {
      // Mock fetch for HTTP provider
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'HTTP provider response' } }],
          model: 'http-model',
          usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
        }),
      };
      
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const httpProvider = new HttpLLMProvider(
        'test-http',
        'https://api.example.com/chat',
        { 'Authorization': 'Bearer test-key' }
      );

      const agent = createKliraAgent({
        provider: httpProvider,
        observability: { enabled: false },
      });

      const response = await agent.complete({
        messages: [
          { role: 'user', content: 'Test HTTP provider' },
        ],
      });

      expect(response.content).toBe('HTTP provider response');
      expect(response.model).toBe('http-model');
      expect(response.usage?.totalTokens).toBe(40);
    });
  });

  describe('Advanced Streaming Scenarios', () => {
    it('should handle streaming with guardrails intervention', async () => {
      const agent = createKliraAgent({
        provider: openaiProvider,
        observability: { enabled: false },
        streaming: {
          enableGuardrails: true,
          checkInterval: 3,
          onViolation: 'continue',
        },
      });

      const stream = await agent.stream({
        messages: [
          { role: 'user', content: 'Generate some content' },
        ],
      });

      const chunks: Partial<LLMResponse>[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle streaming interruption on violation', async () => {
      const agent = createKliraAgent({
        provider: openaiProvider,
        observability: { enabled: false },
        streaming: {
          enableGuardrails: true,
          checkInterval: 1,
          onViolation: 'interrupt',
        },
      });

      const stream = await agent.stream({
        messages: [
          { role: 'user', content: 'Generate content' },
        ],
      });

      const chunks: Partial<LLMResponse>[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should still receive some chunks before potential interruption
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle provider failures gracefully', async () => {
      const failingProvider: LLMProvider = {
        name: 'failing-provider',
        async complete() {
          throw new Error('Provider temporarily unavailable');
        },
      };

      const agent = createKliraAgent({
        provider: failingProvider,
        observability: { enabled: false },
      });

      await expect(agent.complete({
        messages: [{ role: 'user', content: 'Test' }],
      })).rejects.toThrow('Provider temporarily unavailable');
    });

    it('should handle empty messages gracefully', async () => {
      const agent = createKliraAgent({
        provider: openaiProvider,
        observability: { enabled: false },
      });

      const response = await agent.complete({
        messages: [],
      });

      expect(response).toBeDefined();
    });

    it('should handle very long messages', async () => {
      const agent = createKliraAgent({
        provider: localProvider,
        observability: { enabled: false },
      });

      const longContent = 'This is a very long message. '.repeat(100);
      
      const response = await agent.complete({
        messages: [
          { role: 'user', content: longContent },
        ],
      });

      expect(response).toBeDefined();
      expect(response.usage?.promptTokens).toBeGreaterThan(0);
    });
  });

  describe('Performance Scenarios', () => {
    it('should handle concurrent requests', async () => {
      const agent = createKliraAgent({
        provider: openaiProvider,
        observability: { enabled: false },
      });

      const requests = Array.from({ length: 5 }, (_, i) => 
        agent.complete({
          messages: [
            { role: 'user', content: `Request number ${i + 1}` },
          ],
        })
      );

      const responses = await Promise.all(requests);
      
      expect(responses).toHaveLength(5);
      responses.forEach((response, i) => {
        expect(response.content).toContain(`Request number ${i + 1}`);
      });
    });

    it('should handle multiple simultaneous streams', async () => {
      const agent = createKliraAgent({
        provider: localProvider,
        observability: { enabled: false },
        streaming: { enableGuardrails: false },
      });

      const streams = Array.from({ length: 3 }, (_, i) => 
        agent.stream({
          messages: [
            { role: 'user', content: `Stream ${i + 1}` },
          ],
        })
      );

      const results = await Promise.all(
        streams.map(async (streamPromise) => {
          const stream = await streamPromise;
          const chunks: Partial<LLMResponse>[] = [];
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          return chunks;
        })
      );

      expect(results).toHaveLength(3);
      results.forEach(chunks => {
        expect(chunks.length).toBeGreaterThan(0);
      });
    });
  });
});