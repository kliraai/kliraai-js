/**
 * Tests for Vercel AI SDK adapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VercelAIAdapter, createKliraVercelAI } from '../adapters/vercel-ai/index.js';
import { GuardrailsEngine } from '../guardrails/engine.js';
import { setGlobalConfig, createConfig } from '../config/index.js';

// Mock Vercel AI SDK types for testing
interface MockAIResult {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

describe('Vercel AI Adapter', () => {
  let adapter: VercelAIAdapter;

  beforeEach(() => {
    // Set up global config for tests
    const config = createConfig({
      appName: 'test-app',
      verbose: false,
      tracingEnabled: false, // Disable tracing for simpler tests
    });
    setGlobalConfig(config);

    adapter = new VercelAIAdapter();
  });

  afterEach(() => {
    // Reset singleton instances
    GuardrailsEngine.resetInstance();
  });

  describe('Content Extraction', () => {
    it('should extract content from string parameters', async () => {
      const result = await adapter.applyGuardrails('Hello world');
      
      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('should extract content from prompt parameter', async () => {
      const params = {
        model: { provider: 'openai', modelId: 'gpt-4' },
        prompt: 'Tell me about AI safety',
      };

      const result = await adapter.applyGuardrails(params);
      
      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('should extract content from messages array', async () => {
      const params = {
        model: { provider: 'openai', modelId: 'gpt-4' },
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'What is machine learning?' },
        ],
      };

      const result = await adapter.applyGuardrails(params);
      
      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
    });
  });

  describe('Guardrails Integration', () => {
    it('should block content with toxic hate speech', async () => {
      const content = 'kill all jews';
      const result = await adapter.applyGuardrails(content);

      expect(result.blocked).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some(v => v.ruleId === 'toxicity_001')).toBe(true);
    });

    it('should allow safe content', async () => {
      const content = 'Tell me about renewable energy';
      const result = await adapter.applyGuardrails(content);
      
      expect(result.blocked).toBe(false);
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should handle toxic content attempts', async () => {
      const content = 'kill all muslims'; // Toxic content (toxicity_001 in YAML)
      const result = await adapter.applyGuardrails(content);

      expect(result.blocked).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some(v => v.ruleId === 'toxicity_001')).toBe(true);
    });
  });

  describe('Function Wrapping', () => {
    it('should wrap generateText with guardrails', async () => {
      const mockGenerateText = vi.fn().mockResolvedValue({
        text: 'This is a safe response about renewable energy.',
        usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
      });

      const wrappedFunction = adapter.wrap({ generateText: mockGenerateText });
      
      const result = await wrappedFunction.generateText({
        model: { provider: 'openai', modelId: 'gpt-4' },
        prompt: 'Tell me about solar panels',
      });

      expect(mockGenerateText).toHaveBeenCalled();
      expect(result.text).toContain('renewable energy');
    });

    it('should block unsafe input in generateText', async () => {
      const mockGenerateText = vi.fn();
      const wrappedFunction = adapter.wrap({ generateText: mockGenerateText });

      const result = await wrappedFunction.generateText({
        model: { provider: 'openai', modelId: 'gpt-4' },
        prompt: 'kill all jews', // Toxic content that triggers blocking
      });

      expect(mockGenerateText).not.toHaveBeenCalled();
      expect(result.text).toContain('blocked due to policy violation');
    });

    it('should pass safe input through without transformation', async () => {
      const mockGenerateText = vi.fn().mockResolvedValue({
        text: 'Response about privacy',
      });

      const wrappedFunction = adapter.wrap({ generateText: mockGenerateText });

      await wrappedFunction.generateText({
        model: { provider: 'openai', modelId: 'gpt-4' },
        prompt: 'Tell me about data privacy best practices',
      });

      // Content is passed as-is, NOT transformed
      expect(mockGenerateText).toHaveBeenCalled();
      const calledArgs = mockGenerateText.mock.calls[0][0];
      expect(calledArgs.prompt).toBe('Tell me about data privacy best practices');
    });

    it('should handle streaming with guardrails', async () => {
      async function* mockStreamText() {
        yield { type: 'text-delta', textDelta: 'This is ' };
        yield { type: 'text-delta', textDelta: 'a safe ' };
        yield { type: 'text-delta', textDelta: 'response.' };
      }

      const wrappedFunction = adapter.wrap({ streamText: mockStreamText });
      
      const chunks = [];
      for await (const chunk of wrappedFunction.streamText({
        model: { provider: 'openai', modelId: 'gpt-4' },
        prompt: 'Tell me about AI safety',
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(3);
      expect(chunks[0].textDelta).toBe('This is ');
      expect(chunks[1].textDelta).toBe('a safe ');
      expect(chunks[2].textDelta).toBe('response.');
    });
  });

  describe('createKliraVercelAI', () => {
    it('should create adapter wrapper with options', () => {
      const wrapper = createKliraVercelAI({
        checkInput: true,
        checkOutput: true,
        enableStreamingGuardrails: true,
      });

      expect(wrapper.adapter).toBeInstanceOf(VercelAIAdapter);
      expect(typeof wrapper.wrapAI).toBe('function');
      expect(typeof wrapper.wrapGenerateText).toBe('function');
      expect(typeof wrapper.wrapStreamText).toBe('function');
    });

    it('should wrap AI module functions', () => {
      const wrapper = createKliraVercelAI();
      const mockAI = {
        generateText: vi.fn(),
        streamText: vi.fn(),
      };

      const wrappedAI = wrapper.wrapAI(mockAI);
      
      expect(typeof wrappedAI.generateText).toBe('function');
      expect(typeof wrappedAI.streamText).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully in generateText', async () => {
      const mockGenerateText = vi.fn().mockRejectedValue(new Error('API Error'));
      const wrappedFunction = adapter.wrap({ generateText: mockGenerateText });
      
      await expect(wrappedFunction.generateText({
        model: { provider: 'openai', modelId: 'gpt-4' },
        prompt: 'Test prompt',
      })).rejects.toThrow('API Error');
    });

    it('should handle missing content gracefully', async () => {
      const result = await adapter.applyGuardrails({});
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('No content to evaluate');
    });
  });
});