/**
 * Integration tests for LangChain adapter with real scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KliraLangChainCallbacks } from '../adapters/langchain/index.js';
import { setGlobalConfig, createConfig } from '../config/index.js';

// Mock LangChain types and classes
interface LangChainBaseMessage {
  content: string;
  additional_kwargs?: Record<string, any>;
}

interface LangChainChatMessage extends LangChainBaseMessage {
  role: string;
}

interface LangChainLLMResult {
  generations: Array<{
    text: string;
    generationInfo?: Record<string, any>;
  }>;
  llmOutput?: {
    tokenUsage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    modelName?: string;
  };
}

interface LangChainChatResult {
  generations: Array<{
    message: LangChainChatMessage;
    generationInfo?: Record<string, any>;
  }>;
  llmOutput?: {
    tokenUsage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    modelName?: string;
  };
}

// Mock LangChain LLM
class MockLangChainLLM {
  async _generate(prompts: string[]): Promise<LangChainLLMResult> {
    return {
      generations: prompts.map(prompt => ({
        text: `Response to: ${prompt}`,
        generationInfo: { model: 'mock-llm' },
      })),
      llmOutput: {
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
        modelName: 'mock-llm',
      },
    };
  }

  async call(prompt: string): Promise<string> {
    const result = await this._generate([prompt]);
    return result.generations[0].text;
  }
}

// Mock LangChain Chat Model
class MockLangChainChatModel {
  async _generate(messages: LangChainChatMessage[][]): Promise<LangChainChatResult> {
    return {
      generations: messages.map(messageList => ({
        message: {
          content: `Chat response to: ${messageList[messageList.length - 1]?.content}`,
          role: 'assistant',
        },
        generationInfo: { model: 'mock-chat' },
      })),
      llmOutput: {
        tokenUsage: {
          promptTokens: 15,
          completionTokens: 25,
          totalTokens: 40,
        },
        modelName: 'mock-chat',
      },
    };
  }

  async call(messages: LangChainChatMessage[]): Promise<LangChainChatMessage> {
    const result = await this._generate([messages]);
    return result.generations[0].message;
  }
}

// Mock LangChain Chain
class MockLangChainChain {
  constructor(private llm: MockLangChainLLM) {}

  async call(inputs: Record<string, any>): Promise<Record<string, any>> {
    const prompt = inputs.prompt || inputs.question || 'default prompt';
    const response = await this.llm.call(prompt);
    return { text: response, ...inputs };
  }
}

// Mock LangChain Agent
class MockLangChainAgent {
  constructor(private llm: MockLangChainLLM, private tools: any[] = []) {}

  async call(inputs: Record<string, any>): Promise<Record<string, any>> {
    const input = inputs.input || 'default input';
    const response = await this.llm.call(`Agent processing: ${input}`);
    return { output: response, ...inputs };
  }
}

describe('LangChain Integration Tests', () => {
  let callbacks: KliraLangChainCallbacks;
  let mockLLM: MockLangChainLLM;
  let mockChatModel: MockLangChainChatModel;
  let mockChain: MockLangChainChain;
  let mockAgent: MockLangChainAgent;

  beforeEach(async () => {
    // Set up global config
    const config = createConfig({
      appName: 'test-langchain-integration',
      verbose: false,
    });
    setGlobalConfig(config);

    callbacks = new KliraLangChainCallbacks({
      observability: { enabled: false },
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
    });

    mockLLM = new MockLangChainLLM();
    mockChatModel = new MockLangChainChatModel();
    mockChain = new MockLangChainChain(mockLLM);
    mockAgent = new MockLangChainAgent(mockLLM);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('LLM Callbacks', () => {
    it('should handle LLM start callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleLLMStart');
      
      await callbacks.handleLLMStart(
        { name: 'test-llm' },
        ['Test prompt'],
        'test-run-id'
      );

      expect(spy).toHaveBeenCalledWith(
        { name: 'test-llm' },
        ['Test prompt'],
        'test-run-id'
      );
    });

    it('should handle LLM end callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleLLMEnd');
      
      const result: LangChainLLMResult = {
        generations: [{ text: 'Test response' }],
        llmOutput: { modelName: 'test-model' },
      };

      await callbacks.handleLLMEnd(result, 'test-run-id');

      expect(spy).toHaveBeenCalledWith(result, 'test-run-id');
    });

    it('should handle LLM error callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleLLMError');
      const error = new Error('LLM error');
      
      await callbacks.handleLLMError(error, 'test-run-id');

      expect(spy).toHaveBeenCalledWith(error, 'test-run-id');
    });
  });

  describe('Chat Model Callbacks', () => {
    it('should handle chat model start callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleChatModelStart');
      
      const messages = [[{ content: 'Hello', role: 'user' }]];
      
      await callbacks.handleChatModelStart(
        { name: 'test-chat' },
        messages,
        'test-run-id'
      );

      expect(spy).toHaveBeenCalledWith(
        { name: 'test-chat' },
        messages,
        'test-run-id'
      );
    });
  });

  describe('Chain Callbacks', () => {
    it('should handle chain start callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleChainStart');
      
      await callbacks.handleChainStart(
        { name: 'test-chain' },
        { prompt: 'Test prompt' },
        'test-run-id'
      );

      expect(spy).toHaveBeenCalledWith(
        { name: 'test-chain' },
        { prompt: 'Test prompt' },
        'test-run-id'
      );
    });

    it('should handle chain end callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleChainEnd');
      
      await callbacks.handleChainEnd(
        { text: 'Chain result' },
        'test-run-id'
      );

      expect(spy).toHaveBeenCalledWith(
        { text: 'Chain result' },
        'test-run-id'
      );
    });

    it('should handle chain error callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleChainError');
      const error = new Error('Chain error');
      
      await callbacks.handleChainError(error, 'test-run-id');

      expect(spy).toHaveBeenCalledWith(error, 'test-run-id');
    });
  });

  describe('Tool Callbacks', () => {
    it('should handle tool start callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleToolStart');
      
      await callbacks.handleToolStart(
        { name: 'calculator' },
        '2 + 2',
        'test-run-id'
      );

      expect(spy).toHaveBeenCalledWith(
        { name: 'calculator' },
        '2 + 2',
        'test-run-id'
      );
    });

    it('should handle tool end callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleToolEnd');
      
      await callbacks.handleToolEnd('4', 'test-run-id');

      expect(spy).toHaveBeenCalledWith('4', 'test-run-id');
    });

    it('should handle tool error callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleToolError');
      const error = new Error('Tool error');
      
      await callbacks.handleToolError(error, 'test-run-id');

      expect(spy).toHaveBeenCalledWith(error, 'test-run-id');
    });
  });

  describe('Agent Callbacks', () => {
    it('should handle agent action callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleAgentAction');
      
      const action = {
        tool: 'search',
        toolInput: 'LangChain documentation',
        log: 'Searching for information',
      };
      
      await callbacks.handleAgentAction(action, 'test-run-id');

      expect(spy).toHaveBeenCalledWith(action, 'test-run-id');
    });

    it('should handle agent end callback', async () => {
      const spy = vi.spyOn(callbacks, 'handleAgentEnd');
      
      const action = {
        returnValues: { output: 'Agent completed' },
        log: 'Agent finished',
      };
      
      await callbacks.handleAgentEnd(action, 'test-run-id');

      expect(spy).toHaveBeenCalledWith(action, 'test-run-id');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle simple LLM completion', async () => {
      const runStartSpy = vi.spyOn(callbacks, 'handleLLMStart');
      const runEndSpy = vi.spyOn(callbacks, 'handleLLMEnd');

      // Simulate LangChain LLM call with callbacks
      const runId = 'llm-test-run';
      
      await callbacks.handleLLMStart(
        { name: 'openai' },
        ['What is the capital of France?'],
        runId
      );

      const result = await mockLLM._generate(['What is the capital of France?']);
      
      await callbacks.handleLLMEnd(result, runId);

      expect(runStartSpy).toHaveBeenCalled();
      expect(runEndSpy).toHaveBeenCalled();
    });

    it('should handle chat model conversation', async () => {
      const runStartSpy = vi.spyOn(callbacks, 'handleChatModelStart');
      const runEndSpy = vi.spyOn(callbacks, 'handleLLMEnd');

      const runId = 'chat-test-run';
      const messages = [{ content: 'Hello, how are you?', role: 'user' }];
      
      await callbacks.handleChatModelStart(
        { name: 'gpt-4' },
        [messages],
        runId
      );

      const result = await mockChatModel._generate([messages]);
      
      await callbacks.handleLLMEnd(result, runId);

      expect(runStartSpy).toHaveBeenCalled();
      expect(runEndSpy).toHaveBeenCalled();
    });

    it('should handle chain execution', async () => {
      const chainStartSpy = vi.spyOn(callbacks, 'handleChainStart');
      const chainEndSpy = vi.spyOn(callbacks, 'handleChainEnd');

      const runId = 'chain-test-run';
      const inputs = { prompt: 'Summarize the benefits of AI' };
      
      await callbacks.handleChainStart(
        { name: 'summarization-chain' },
        inputs,
        runId
      );

      const result = await mockChain.call(inputs);
      
      await callbacks.handleChainEnd(result, runId);

      expect(chainStartSpy).toHaveBeenCalled();
      expect(chainEndSpy).toHaveBeenCalled();
    });

    it('should handle agent execution with tools', async () => {
      const agentActionSpy = vi.spyOn(callbacks, 'handleAgentAction');
      const agentEndSpy = vi.spyOn(callbacks, 'handleAgentEnd');
      const toolStartSpy = vi.spyOn(callbacks, 'handleToolStart');
      const toolEndSpy = vi.spyOn(callbacks, 'handleToolEnd');

      const runId = 'agent-test-run';
      
      // Simulate agent action
      await callbacks.handleAgentAction(
        {
          tool: 'calculator',
          toolInput: '15 * 23',
          log: 'I need to calculate 15 * 23',
        },
        runId
      );

      // Simulate tool execution
      await callbacks.handleToolStart(
        { name: 'calculator' },
        '15 * 23',
        runId
      );

      await callbacks.handleToolEnd('345', runId);

      // Simulate agent completion
      await callbacks.handleAgentEnd(
        {
          returnValues: { output: 'The answer is 345' },
          log: 'I have calculated the result',
        },
        runId
      );

      expect(agentActionSpy).toHaveBeenCalled();
      expect(agentEndSpy).toHaveBeenCalled();
      expect(toolStartSpy).toHaveBeenCalled();
      expect(toolEndSpy).toHaveBeenCalled();
    });

    it('should handle error scenarios', async () => {
      const errorSpy = vi.spyOn(callbacks, 'handleLLMError');

      const runId = 'error-test-run';
      const error = new Error('API rate limit exceeded');
      
      await callbacks.handleLLMError(error, runId);

      expect(errorSpy).toHaveBeenCalledWith(error, runId);
    });

    it('should handle complex multi-step workflow', async () => {
      const chainStartSpy = vi.spyOn(callbacks, 'handleChainStart');
      const llmStartSpy = vi.spyOn(callbacks, 'handleLLMStart');
      const llmEndSpy = vi.spyOn(callbacks, 'handleLLMEnd');
      const chainEndSpy = vi.spyOn(callbacks, 'handleChainEnd');

      const runId = 'workflow-test-run';
      
      // Start chain
      await callbacks.handleChainStart(
        { name: 'research-chain' },
        { topic: 'machine learning' },
        runId
      );

      // First LLM call for research
      await callbacks.handleLLMStart(
        { name: 'gpt-4' },
        ['Research machine learning'],
        runId
      );

      const research = await mockLLM._generate(['Research machine learning']);
      await callbacks.handleLLMEnd(research, runId);

      // Second LLM call for summary
      await callbacks.handleLLMStart(
        { name: 'gpt-4' },
        ['Summarize: ' + research.generations[0].text],
        runId
      );

      const summary = await mockLLM._generate(['Summarize: ' + research.generations[0].text]);
      await callbacks.handleLLMEnd(summary, runId);

      // End chain
      await callbacks.handleChainEnd(
        { summary: summary.generations[0].text },
        runId
      );

      expect(chainStartSpy).toHaveBeenCalled();
      expect(llmStartSpy).toHaveBeenCalledTimes(2);
      expect(llmEndSpy).toHaveBeenCalledTimes(2);
      expect(chainEndSpy).toHaveBeenCalled();
    });
  });

  describe('Guardrails Integration', () => {
    it('should work with different guardrail configurations', async () => {
      const strictCallbacks = new KliraLangChainCallbacks({
        checkInput: true,
        checkOutput: true,
        augmentPrompt: true,
        onInputViolation: 'exception',
        onOutputViolation: 'filter',
        observability: { enabled: false },
      });

      const runId = 'strict-test-run';
      
      await strictCallbacks.handleLLMStart(
        { name: 'test-llm' },
        ['Test prompt'],
        runId
      );

      expect(strictCallbacks).toBeDefined();
    });

    it('should work with guardrails disabled', async () => {
      const permissiveCallbacks = new KliraLangChainCallbacks({
        checkInput: false,
        checkOutput: false,
        augmentPrompt: false,
        observability: { enabled: false },
      });

      const runId = 'permissive-test-run';
      
      await permissiveCallbacks.handleLLMStart(
        { name: 'test-llm' },
        ['Any prompt'],
        runId
      );

      expect(permissiveCallbacks).toBeDefined();
    });
  });
});