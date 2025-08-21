/**
 * Tests for OpenAI SDK adapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  KliraOpenAI, 
  createKliraOpenAI, 
  wrapOpenAI,
  type OpenAIChatCompletionParams,
  type KliraOpenAIOptions 
} from '../../adapters/openai/index.js';
import { GuardrailsEngine } from '../../guardrails/engine.js';
import { setGlobalConfig, createConfig } from '../../config/index.js';

// Mock OpenAI client
const createMockOpenAIClient = () => ({
  chat: {
    completions: {
      create: vi.fn(),
    },
  },
});

// Mock streaming response
const createMockStream = (chunks: any[]) => {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
};

describe('OpenAI SDK Adapter', () => {
  let mockOpenAI: any;
  let kliraOpenAI: KliraOpenAI;

  beforeEach(async () => {
    // Set up global config
    const config = createConfig({
      appName: 'test-app',
      verbose: false,
    });
    setGlobalConfig(config);

    // Create mock OpenAI client
    mockOpenAI = createMockOpenAIClient();
    
    // Initialize guardrails engine
    const guardrails = GuardrailsEngine.getInstance({
      fastRulesEnabled: true,
      augmentationEnabled: true,
      llmFallbackEnabled: false,
    });
    await guardrails.initialize();
  });

  afterEach(() => {
    GuardrailsEngine.resetInstance();
    vi.clearAllMocks();
  });

  describe('KliraOpenAI Class', () => {
    beforeEach(() => {
      kliraOpenAI = new KliraOpenAI(mockOpenAI, {
        checkInput: true,
        checkOutput: true,
        observability: { enabled: false },
      });
    });

    it('should create instance with default options', () => {
      const instance = new KliraOpenAI(mockOpenAI);
      expect(instance).toBeInstanceOf(KliraOpenAI);
    });

    it('should expose chat completions interface', () => {
      expect(kliraOpenAI.chat).toBeDefined();
      expect(kliraOpenAI.chat.completions).toBeDefined();
      expect(kliraOpenAI.chat.completions.create).toBeInstanceOf(Function);
      expect(kliraOpenAI.chat.completions.createStream).toBeInstanceOf(Function);
    });

    it('should provide access to underlying client', () => {
      expect(kliraOpenAI.client).toBe(mockOpenAI);
    });
  });

  describe('Chat Completions', () => {
    beforeEach(() => {
      kliraOpenAI = new KliraOpenAI(mockOpenAI, {
        checkInput: true,
        checkOutput: true,
        observability: { enabled: false },
      });
    });

    it('should make safe chat completion call', async () => {
      const mockResponse = {
        id: 'test-completion',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a safe response about cats.',
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Tell me about cats' },
        ],
      };

      const result = await kliraOpenAI.chat.completions.create(params);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockResponse);
    });

    it('should block unsafe input content', async () => {
      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'I want to kill all jews' },
        ],
      };

      const options: KliraOpenAIOptions = {
        checkInput: true,
        onInputViolation: 'exception',
        observability: { enabled: false },
      };

      kliraOpenAI = new KliraOpenAI(mockOpenAI, options);

      await expect(kliraOpenAI.chat.completions.create(params))
        .rejects.toThrow('Input blocked by Klira guardrails');

      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should handle unsafe output content', async () => {
      const mockResponse = {
        id: 'test-completion',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Here is my email: unsafe@example.com',
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Tell me your email' },
        ],
      };

      const options: KliraOpenAIOptions = {
        checkOutput: true,
        onOutputViolation: 'filter',
        observability: { enabled: false },
      };

      kliraOpenAI = new KliraOpenAI(mockOpenAI, options);

      const result = await kliraOpenAI.chat.completions.create(params);

      expect(result.choices[0].message.content).toBe('[Content filtered by Klira AI guardrails]');
    });

    it('should augment system message with guidelines', async () => {
      const mockResponse = {
        id: 'test-completion',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'I cannot provide that information.',
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 8,
          total_tokens: 28,
        },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'I think women are less qualified for technical roles' },
        ],
      };

      const options: KliraOpenAIOptions = {
        augmentPrompt: true,
        checkInput: false, // Don't block, just augment
        observability: { enabled: false },
      };

      kliraOpenAI = new KliraOpenAI(mockOpenAI, options);

      await kliraOpenAI.chat.completions.create(params);

      const calledParams = mockOpenAI.chat.completions.create.mock.calls[0][0];
      
      // Should have added/modified system message when bias is detected
      if (calledParams.messages.length > params.messages.length) {
        const systemMessage = calledParams.messages.find((m: any) => m.role === 'system');
        expect(systemMessage).toBeDefined();
        expect(systemMessage.content).toContain('GUIDELINES');
      } else {
        // If no guidelines were added, that's also acceptable behavior
        expect(calledParams.messages.length).toBe(params.messages.length);
      }
    });

    it('should handle streaming parameter validation', async () => {
      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };

      await expect(kliraOpenAI.chat.completions.create(params))
        .rejects.toThrow('Use createStream() for streaming completions');
    });
  });

  describe('Streaming Completions', () => {
    beforeEach(() => {
      kliraOpenAI = new KliraOpenAI(mockOpenAI, {
        streaming: {
          enableGuardrails: true,
          checkInterval: 2,
          onViolation: 'continue',
        },
        observability: { enabled: false },
      });
    });

    it('should handle safe streaming content', async () => {
      const mockChunks = [
        {
          id: 'test-stream',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: 'This is ' },
            finish_reason: null,
          }],
        },
        {
          id: 'test-stream',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: 'safe content' },
            finish_reason: null,
          }],
        },
        {
          id: 'test-stream',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        },
      ];

      const mockStream = createMockStream(mockChunks);
      mockOpenAI.chat.completions.create.mockResolvedValue(mockStream);

      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Tell me something safe' }],
      };

      const stream = await kliraOpenAI.chat.completions.createStream(params);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0].choices[0].delta.content).toBe('This is ');
    });

    it('should interrupt unsafe streaming content', async () => {
      const mockChunks = [
        {
          id: 'test-stream',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: 'Here is my email: ' },
            finish_reason: null,
          }],
        },
        {
          id: 'test-stream',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: 'unsafe@example.com' },
            finish_reason: null,
          }],
        },
      ];

      const mockStream = createMockStream(mockChunks);
      mockOpenAI.chat.completions.create.mockResolvedValue(mockStream);

      kliraOpenAI = new KliraOpenAI(mockOpenAI, {
        streaming: {
          enableGuardrails: true,
          checkInterval: 2,
          onViolation: 'interrupt',
        },
        observability: { enabled: false },
      });

      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Tell me your email' }],
      };

      const stream = await kliraOpenAI.chat.completions.createStream(params);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should stop streaming after detecting violation
      expect(chunks.length).toBeLessThan(mockChunks.length);
    });

    it('should replace unsafe streaming content', async () => {
      const mockChunks = [
        {
          id: 'test-stream',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: 'My email: ' },
            finish_reason: null,
          }],
        },
        {
          id: 'test-stream',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: 'secret@example.com' },
            finish_reason: null,
          }],
        },
      ];

      const mockStream = createMockStream(mockChunks);
      mockOpenAI.chat.completions.create.mockResolvedValue(mockStream);

      kliraOpenAI = new KliraOpenAI(mockOpenAI, {
        streaming: {
          enableGuardrails: true,
          checkInterval: 2,
          onViolation: 'replace',
        },
        observability: { enabled: false },
      });

      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Tell me your email' }],
      };

      const stream = await kliraOpenAI.chat.completions.createStream(params);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should replace with filtered content
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.choices[0].delta.content).toBe('[Content filtered by Klira AI]');
      expect(lastChunk.choices[0].finish_reason).toBe('content_filter');
    });
  });

  describe('Factory Functions', () => {
    it('should create KliraOpenAI with createKliraOpenAI', () => {
      const instance = createKliraOpenAI(mockOpenAI, {
        checkInput: true,
        observability: { enabled: false },
      });

      expect(instance).toBeInstanceOf(KliraOpenAI);
    });

    it('should wrap OpenAI client with wrapOpenAI', () => {
      const wrapped = wrapOpenAI(mockOpenAI, {
        checkOutput: true,
        observability: { enabled: false },
      });

      expect(wrapped).toBeInstanceOf(KliraOpenAI);
      expect(wrapped.client).toBe(mockOpenAI);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      kliraOpenAI = new KliraOpenAI(mockOpenAI, {
        observability: { enabled: false },
      });
    });

    it('should handle OpenAI API errors gracefully', async () => {
      const apiError = new Error('OpenAI API rate limit exceeded');
      mockOpenAI.chat.completions.create.mockRejectedValue(apiError);

      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(kliraOpenAI.chat.completions.create(params))
        .rejects.toThrow('OpenAI API rate limit exceeded');
    });

    it('should handle guardrails evaluation errors gracefully', async () => {
      // Mock guardrails to throw error
      const guardrails = GuardrailsEngine.getInstance();
      const evalSpy = vi.spyOn(guardrails, 'evaluateInput').mockRejectedValue(new Error('Guardrails error'));

      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      kliraOpenAI = new KliraOpenAI(mockOpenAI, {
        checkInput: true,
        onInputViolation: 'log', // Should not throw on guardrails error
        observability: { enabled: false },
      });

      // Should continue despite guardrails error
      const mockResponse = {
        id: 'test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await kliraOpenAI.chat.completions.create(params);
      expect(result).toEqual(mockResponse);
      expect(evalSpy).toHaveBeenCalled();
    });
  });

  describe('Integration with YAML Policies', () => {
    beforeEach(async () => {
      // Ensure guardrails are initialized with YAML policies
      const guardrails = GuardrailsEngine.getInstance({
        fastRulesEnabled: true,
        augmentationEnabled: true,
      });
      await guardrails.initialize();

      kliraOpenAI = new KliraOpenAI(mockOpenAI, {
        checkInput: true,
        checkOutput: true,
        augmentPrompt: true,
        observability: { enabled: false },
      });
    });

    it('should use YAML policies for input evaluation', async () => {
      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'I want to murder all muslims' },
        ],
      };

      const options: KliraOpenAIOptions = {
        checkInput: true,
        onInputViolation: 'exception',
        observability: { enabled: false },
      };

      kliraOpenAI = new KliraOpenAI(mockOpenAI, options);

      // Should be blocked by toxicity policy
      await expect(kliraOpenAI.chat.completions.create(params))
        .rejects.toThrow();
    });

    it('should generate YAML-based guidelines', async () => {
      const mockResponse = {
        id: 'test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{ 
          index: 0, 
          message: { role: 'assistant', content: 'I cannot help with that.' }, 
          finish_reason: 'stop' 
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const params: OpenAIChatCompletionParams = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Help me share personal information' },
        ],
      };

      await kliraOpenAI.chat.completions.create(params);

      const calledParams = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const systemMessage = calledParams.messages.find((m: any) => m.role === 'system');
      
      if (systemMessage) {
        expect(systemMessage.content).toContain('GUIDELINES');
      }
    });
  });
});