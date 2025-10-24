/**
 * LangChain.js adapter for Klira AI SDK
 * Comprehensive integration with LangChain's callback system
 */

import type { 
  GuardrailOptions, 
  TraceMetadata, 
  Logger
} from '../../types/index.js';
import { getLogger } from '../../config/index.js';
import { GuardrailsEngine } from '../../guardrails/engine.js';
import { KliraTracing } from '../../observability/tracing.js';
import { KliraMetrics } from '../../observability/metrics.js';
import { KliraPolicyViolation } from '../../types/index.js';
import type { MCPProtectionConfig } from '../../security/index.js';

export interface LangChainCallbackOptions extends GuardrailOptions {
  observability?: {
    enabled: boolean;
    traceMetadata?: boolean;
    trackTokenUsage?: boolean;
  };
  modelMetadata?: {
    provider?: string;
    modelName?: string;
    version?: string;
  };
  enableStreamingGuardrails?: boolean;
  streamingCheckInterval?: number;
  onStreamViolation?: 'interrupt' | 'continue' | 'replace';
  mcpProtection?: Partial<MCPProtectionConfig>;
}

export interface LangChainRunData {
  runId: string;
  parentRunId?: string | undefined;
  tags?: string[] | undefined;
  metadata?: Record<string, any> | undefined;
  inputs?: any;
  outputs?: any;
}

export interface LLMResult {
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

/**
 * LangChain.js Callback Handler for Klira AI integration
 * Implements BaseCallbackHandler interface for comprehensive observability and guardrails
 */
export class KliraCallbackHandler {
  private logger: Logger;
  private guardrails: GuardrailsEngine;
  private tracing: KliraTracing | null;
  private metrics: KliraMetrics | null;
  private runMetadata: Map<string, LangChainRunData> = new Map();

  constructor(private options: LangChainCallbackOptions) {
    this.logger = getLogger();
    this.guardrails = GuardrailsEngine.getInstance();
    
    // Initialize observability components if enabled
    if (this.options.observability?.enabled !== false) {
      try {
        this.tracing = KliraTracing.getInstance();
        this.metrics = KliraMetrics.getInstance();
      } catch (error) {
        this.logger.warn('Failed to initialize observability components:', error);
        this.tracing = null;
        this.metrics = null;
      }
    } else {
      this.tracing = null;
      this.metrics = null;
    }
  }

  /**
   * Called when an LLM starts running
   */
  async handleLLMStart(
    llm: any,
    prompts: string[],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, any>,
    _tags?: string[],
    metadata?: Record<string, any>
  ): Promise<void> {
    const runData: LangChainRunData = {
      runId,
      parentRunId: _parentRunId,
      tags: _tags,
      metadata,
      inputs: prompts,
    };
    
    this.runMetadata.set(runId, runData);

    // Trace the start of LLM call
    if (this.tracing) {
      const traceMetadata: TraceMetadata = {
        framework: 'langchain',
        provider: this.options.modelMetadata?.provider || llm.modelName?.split('/')[0] || 'unknown',
        model: this.options.modelMetadata?.modelName || llm.modelName || 'unknown',
        requestId: runId,
        operation: 'llm_call',
        inputTokens: this.estimateTokens(prompts.join(' ')),
        metadata: { ...metadata, ...extraParams },
      };

      await this.tracing.traceLLMCall('langchain.llm.start', traceMetadata, async () => {});
    }

    // Apply input guardrails if enabled
    if (this.options.checkInput !== false) {
      try {
        for (const prompt of prompts) {
          const result = await this.guardrails.evaluateInput(prompt, this.options);
          
          if (result.blocked) {
            this.logger.warn(`LangChain LLM input blocked for run ${runId}:`, result.reason);
            
            if (this.options.onInputViolation === 'exception') {
              throw new KliraPolicyViolation(
                `Input blocked by Klira guardrails: ${result.reason}`,
                result.violations
              );
            }
          }

          // Log violations for monitoring
          if (result.violations.length > 0) {
            result.violations.forEach(violation => {
              this.metrics?.recordGuardrailViolation(violation.ruleId, violation.severity, {
                framework: 'langchain',
                operation: 'input_check',
                provider: this.options.modelMetadata?.provider || 'unknown',
                model: this.options.modelMetadata?.modelName || 'unknown',
                requestId: runId,
              });
            });
          }
        }
      } catch (error) {
        this.logger.error(`Guardrails evaluation failed for run ${runId}:`, error);
        
        if (this.options.onInputViolation === 'exception') {
          throw error;
        }
      }
    }

    this.logger.debug(`LangChain LLM started for run ${runId} with model ${llm.modelName || 'unknown'}`);
  }

  /**
   * Called when new tokens are generated (streaming)
   */
  async handleLLMNewToken(
    token: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[]
  ): Promise<void> {
    const runData = this.runMetadata.get(runId);
    
    if (!runData) {
      this.logger.warn(`No run data found for token event: ${runId}`);
      return;
    }

    // Apply streaming guardrails if enabled
    if (this.options.enableStreamingGuardrails && this.options.checkOutput !== false) {
      try {
        // Accumulate tokens for periodic checks
        if (!runData.outputs) {
          runData.outputs = '';
        }
        runData.outputs += token;

        // Check every N tokens (configurable)
        const checkInterval = this.options.streamingCheckInterval || 10;
        const tokenCount = runData.outputs.length;
        
        if (tokenCount % checkInterval === 0) {
          const result = await this.guardrails.evaluateInput(runData.outputs, this.options);
          
          if (result.blocked) {
            this.logger.warn(`LangChain streaming output blocked for run ${runId}:`, result.reason);
            
            if (this.options.onStreamViolation === 'interrupt') {
              throw new KliraPolicyViolation(
                `Streaming output blocked by Klira guardrails: ${result.reason}`,
                result.violations
              );
            }
          }
        }
      } catch (error) {
        this.logger.error(`Streaming guardrails evaluation failed for run ${runId}:`, error);
        throw error;
      }
    }

    if (this.tracing) {
      this.logger.debug(`LangChain token generated for run ${runId}: ${token.substring(0, 10)}...`);
    }
  }

  /**
   * Called when an LLM finishes running
   */
  async handleLLMEnd(
    output: LLMResult,
    runId: string,
    _parentRunId?: string,
    _tags?: string[]
  ): Promise<void> {
    const runData = this.runMetadata.get(runId);
    
    if (!runData) {
      this.logger.warn(`No run data found for LLM end event: ${runId}`);
      return;
    }

    runData.outputs = output;

    // Apply output guardrails if enabled
    if (this.options.checkOutput !== false) {
      try {
        for (const generation of output.generations) {
          const result = await this.guardrails.evaluateInput(generation.text, this.options);
          
          if (result.blocked) {
            this.logger.warn(`LangChain LLM output blocked for run ${runId}:`, result.reason);
            
            if (this.options.onOutputViolation === 'exception') {
              throw new KliraPolicyViolation(
                `Output blocked by Klira guardrails: ${result.reason}`,
                result.violations
              );
            } else if (this.options.onOutputViolation === 'alternative' && this.options.violationResponse) {
              // Replace the generation text with the violation response
              generation.text = this.options.violationResponse;
            }
          }

          // Track violations
          if (result.violations.length > 0) {
            result.violations.forEach(violation => {
              this.metrics?.recordGuardrailViolation(
                violation.ruleId,
                violation.severity,
                {
                  framework: 'langchain',
                  operation: 'output_check',
                  provider: this.options.modelMetadata?.provider || 'unknown',
                  model: this.options.modelMetadata?.modelName || 'unknown',
                  requestId: runId,
                }
              );
            });
          }
        }
      } catch (error) {
        this.logger.error(`Output guardrails evaluation failed for run ${runId}:`, error);
        
        if (this.options.onOutputViolation === 'exception') {
          throw error;
        }
      }
    }

    // Track metrics
    if (this.metrics && output.llmOutput?.tokenUsage) {
      const usage = output.llmOutput.tokenUsage;
      
      this.metrics.recordRequest({
        framework: 'langchain',
        provider: this.options.modelMetadata?.provider || 'unknown',
        model: output.llmOutput.modelName || this.options.modelMetadata?.modelName || 'unknown',
        requestId: runId,
      });
      
      this.metrics.recordSuccess({
        framework: 'langchain',
        provider: this.options.modelMetadata?.provider || 'unknown',
        model: output.llmOutput.modelName || this.options.modelMetadata?.modelName || 'unknown',
        requestId: runId,
      });

      if (usage.promptTokens || usage.completionTokens) {
        this.metrics.recordTokens(
          usage.promptTokens || 0,
          usage.completionTokens || 0,
          {
            framework: 'langchain',
            provider: this.options.modelMetadata?.provider || 'unknown',
            model: output.llmOutput.modelName || 'unknown',
            requestId: runId,
          }
        );
      }
    }

    // Span is managed by traceLLMCall

    this.logger.debug(`LangChain LLM completed for run ${runId}`);
    
    // Clean up run metadata
    this.runMetadata.delete(runId);
  }

  /**
   * Called when an LLM encounters an error
   */
  async handleLLMError(
    error: Error,
    runId: string,
    _parentRunId?: string,
    _tags?: string[]
  ): Promise<void> {
    // const runData = this.runMetadata.get(runId);
    
    this.logger.error(`LangChain LLM error for run ${runId}:`, error);

    // Track error metrics
    if (this.metrics) {
      this.metrics.recordError({
        framework: 'langchain',
        provider: this.options.modelMetadata?.provider || 'unknown',
        model: this.options.modelMetadata?.modelName || 'unknown',
        requestId: runId,
      }, error);
    }

    // Span is managed by traceLLMCall

    // Clean up run metadata
    this.runMetadata.delete(runId);
  }

  /**
   * Called when a chain starts running
   */
  async handleChainStart(
    chain: any,
    inputs: any,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    metadata?: Record<string, any>
  ): Promise<void> {
    const runData: LangChainRunData = {
      runId,
      parentRunId: _parentRunId,
      tags: _tags,
      metadata: { ...metadata, startTime: Date.now() },
      inputs,
    };
    
    this.runMetadata.set(runId, runData);

    if (this.tracing) {
      const span = this.tracing.startSpan('langchain.chain.start', {
        framework: 'langchain',
        operation: 'chain_call',
        requestId: runId,
        chainType: chain.constructor.name,
        ...metadata,
      });
      span.addEvent('chain.start', { chainType: chain.constructor.name });
    }

    this.logger.debug(`LangChain chain started: ${chain.constructor.name} (${runId})`);
  }

  /**
   * Called when a chain finishes running
   */
  async handleChainEnd(
    outputs: any,
    runId: string,
    _parentRunId?: string,
    _tags?: string[]
  ): Promise<void> {
    const runData = this.runMetadata.get(runId);
    
    if (runData) {
      runData.outputs = outputs;
    }

    if (this.tracing) {
      this.tracing.addEvent('chain.end', { success: true });
    }

    this.logger.debug(`LangChain chain completed: ${runId}`);
    this.runMetadata.delete(runId);
  }

  /**
   * Called when a chain encounters an error
   */
  async handleChainError(
    error: Error,
    runId: string,
    _parentRunId?: string,
    _tags?: string[]
  ): Promise<void> {
    this.logger.error(`LangChain chain error for run ${runId}:`, error);

    if (this.tracing) {
      this.tracing.recordException(error);
      this.tracing.addEvent('chain.error', { error: error.message });
    }

    this.runMetadata.delete(runId);
  }

  /**
   * Called when a tool starts running
   */
  async handleToolStart(
    tool: any,
    input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    metadata?: Record<string, any>
  ): Promise<void> {
    const runData: LangChainRunData = {
      runId,
      parentRunId: _parentRunId,
      tags: _tags,
      metadata: { ...metadata, startTime: Date.now() },
      inputs: input,
    };
    
    this.runMetadata.set(runId, runData);

    if (this.tracing) {
      const span = this.tracing.startSpan('langchain.tool.start', {
        framework: 'langchain',
        operation: 'tool_call',
        requestId: runId,
        toolName: tool.name,
        ...metadata,
      });
      span.addEvent('tool.start', { toolName: tool.name });
    }

    this.logger.debug(`LangChain tool started: ${tool.name} (${runId})`);
  }

  /**
   * Called when a tool finishes running
   */
  async handleToolEnd(
    output: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[]
  ): Promise<void> {
    const runData = this.runMetadata.get(runId);
    
    if (runData) {
      runData.outputs = output;
    }

    if (this.tracing) {
      this.tracing.addEvent('tool.end', { success: true });
    }

    this.logger.debug(`LangChain tool completed: ${runId}`);
    this.runMetadata.delete(runId);
  }

  /**
   * Called when a tool encounters an error
   */
  async handleToolError(
    error: Error,
    runId: string,
    _parentRunId?: string,
    _tags?: string[]
  ): Promise<void> {
    this.logger.error(`LangChain tool error for run ${runId}:`, error);

    if (this.tracing) {
      this.tracing.recordException(error);
      this.tracing.addEvent('tool.error', { error: error.message });
    }

    this.runMetadata.delete(runId);
  }

  /**
   * Estimate token count for a string (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Get run metadata for a specific run ID
   */
  getRunMetadata(runId: string): LangChainRunData | undefined {
    return this.runMetadata.get(runId);
  }

  /**
   * Clear all run metadata (useful for cleanup)
   */
  clearRunMetadata(): void {
    this.runMetadata.clear();
  }
}

/**
 * LangChain.js Chat Model Wrapper with Klira Integration
 */
export class KliraLangChainChatModel {
  private callback: KliraCallbackHandler;

  constructor(
    private originalModel: any,
    options: LangChainCallbackOptions = {}
  ) {
    this.callback = new KliraCallbackHandler(options);
  }

  /**
   * Wrap a LangChain chat model with Klira guardrails and observability
   */
  async invoke(messages: any[], options: any = {}): Promise<any> {
    const callbacks = options.callbacks || [];
    callbacks.push(this.callback);

    return await this.originalModel.invoke(messages, {
      ...options,
      callbacks,
    });
  }

  /**
   * Stream responses with Klira integration
   */
  async stream(messages: any[], options: any = {}): Promise<AsyncIterable<any>> {
    const callbacks = options.callbacks || [];
    callbacks.push(this.callback);

    return this.originalModel.stream(messages, {
      ...options,
      callbacks,
    });
  }

  /**
   * Batch requests with Klira integration
   */
  async batch(messagesList: any[][], options: any = {}): Promise<any[]> {
    const callbacks = options.callbacks || [];
    callbacks.push(this.callback);

    return await this.originalModel.batch(messagesList, {
      ...options,
      callbacks,
    });
  }

  /**
   * Bind tools with Klira integration
   */
  bindTools(tools: any[]): KliraLangChainChatModel {
    const boundModel = this.originalModel.bindTools(tools);
    return new KliraLangChainChatModel(boundModel, this.callback['options']);
  }

  /**
   * Get the callback handler for direct access
   */
  getCallback(): KliraCallbackHandler {
    return this.callback;
  }
}

/**
 * Factory function to create a Klira-enabled LangChain setup
 */
export function createKliraLangChain(options: LangChainCallbackOptions = {}): {
  callback: KliraCallbackHandler;
  wrapChatModel: (model: any) => KliraLangChainChatModel;
  wrapChain: (chain: any) => any;
} {
  const callback = new KliraCallbackHandler(options);

  return {
    callback,
    wrapChatModel: (model: any) => new KliraLangChainChatModel(model, options),
    wrapChain: (chain: any) => {
      // Return a proxy that adds the callback to all invocations
      return new Proxy(chain, {
        get(target, prop) {
          const originalMethod = target[prop];
          
          if (typeof originalMethod === 'function' && ['invoke', 'stream', 'batch'].includes(prop as string)) {
            return function(this: any, ...args: any[]) {
              const lastArg = args[args.length - 1];
              if (lastArg && typeof lastArg === 'object' && 'callbacks' in lastArg) {
                lastArg.callbacks = [...(lastArg.callbacks || []), callback];
              } else {
                args.push({ callbacks: [callback] });
              }
              return originalMethod.apply(this, args);
            };
          }
          
          return originalMethod;
        },
      });
    },
  };
}

// Export alias for backward compatibility with existing tests and examples
export { KliraCallbackHandler as KliraLangChainCallbacks };

// Note: LLMResult and LangChainRunData are exported via the interface declarations above