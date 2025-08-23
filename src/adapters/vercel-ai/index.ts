/**
 * Vercel AI SDK Adapter for Klira AI
 * Primary integration target for the JavaScript SDK
 */

import type { 
  GuardrailOptions, 
  FrameworkAdapter, 
  TraceMetadata, 
  GuardrailResult,
  Logger,
  ComplianceMetadata,
  VercelAIAdapterOptions,
} from '../../types/index.js';
import { getLogger } from '../../config/index.js';
import { GuardrailsEngine } from '../../guardrails/engine.js';
import { KliraTracing } from '../../observability/tracing.js';
import { KliraMetrics } from '../../observability/metrics.js';
import { KliraPolicyViolation } from '../../types/index.js';

// Type definitions for Vercel AI SDK (to avoid requiring as dependency)
interface AISDKLanguageModel {
  provider: string;
  modelId: string;
  [key: string]: any;
}

interface AISDKMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  [key: string]: any;
}

interface AISDKGenerateTextParams {
  model: AISDKLanguageModel;
  messages?: AISDKMessage[];
  prompt?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
}

interface AISDKStreamTextParams extends AISDKGenerateTextParams {
  onFinish?: (result: any) => void | Promise<void>;
  onChunk?: (chunk: any) => void | Promise<void>;
}

interface AISDKResult {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  [key: string]: any;
}


export class VercelAIAdapter implements FrameworkAdapter {
  public readonly name = 'vercel-ai';
  private logger: Logger;
  private guardrails: GuardrailsEngine;
  private tracing: KliraTracing | null;
  private metrics: KliraMetrics | null;
  // Removed unused streamingChecks property

  constructor() {
    this.logger = getLogger();
    // Lazy load these to avoid initialization order issues
    this.guardrails = null as any;
    this.tracing = null as any;
    this.metrics = null as any;
  }

  private ensureInitialized() {
    if (!this.guardrails) {
      this.guardrails = GuardrailsEngine.getInstance();
    }
    if (!this.tracing) {
      try {
        this.tracing = KliraTracing.getInstance();
      } catch (error) {
        // Tracing not initialized - that's OK
        this.tracing = null;
      }
    }
    if (!this.metrics) {
      try {
        this.metrics = KliraMetrics.getInstance();
      } catch (error) {
        // Metrics not initialized - that's OK
        this.metrics = null;
      }
    }
  }

  /**
   * Detect if Vercel AI SDK is available
   */
  detect(): boolean {
    try {
      // Check if ai package is available
      require.resolve('ai');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wrap Vercel AI SDK functions with Klira instrumentation
   */
  wrap<T>(target: T, options: VercelAIAdapterOptions = {}): T {
    if (!target || typeof target !== 'object') {
      return target;
    }

    // Create a proxy to intercept function calls
    return new Proxy(target, {
      get: (obj, prop) => {
        const value = (obj as any)[prop];
        
        if (typeof value === 'function') {
          // Wrap AI SDK functions
          if (prop === 'generateText') {
            return this.wrapGenerateText(value.bind(obj), options);
          } else if (prop === 'streamText') {
            return this.wrapStreamText(value.bind(obj), options);
          } else if (prop === 'generateObject') {
            return this.wrapGenerateObject(value.bind(obj), options);
          } else if (prop === 'streamObject') {
            return this.wrapStreamObject(value.bind(obj), options);
          }
        }
        
        return value;
      },
    });
  }

  /**
   * Apply guardrails to input
   */
  async applyGuardrails(input: any, options: GuardrailOptions = {}): Promise<GuardrailResult> {
    this.ensureInitialized();
    const content = this.extractContent(input);
    if (!content) {
      return {
        allowed: true,
        blocked: false,
        violations: [],
        reason: 'No content to evaluate',
      };
    }

    return this.guardrails.evaluateInput(content, options);
  }

  /**
   * Capture metrics and traces
   */
  async captureMetrics(metadata: TraceMetadata): Promise<void> {
    this.ensureInitialized();
    if (this.metrics) {
      this.metrics.recordRequest(metadata);
    }

    if (this.tracing) {
      this.tracing.addAttributes({
        'klira.framework': 'vercel-ai',
        'klira.provider': metadata.provider || 'unknown',
        'klira.model': metadata.model || 'unknown',
      });
    }
  }

  /**
   * Wrap generateText function
   */
  private wrapGenerateText(
    originalFn: (params: AISDKGenerateTextParams) => Promise<AISDKResult>,
    options: VercelAIAdapterOptions
  ) {
    return async (params: AISDKGenerateTextParams): Promise<AISDKResult> => {
      this.ensureInitialized();
      const startTime = Date.now();
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const metadata: TraceMetadata = {
        framework: 'vercel-ai',
        provider: params.model.provider,
        model: params.model.modelId,
        requestId,
      };

      await this.captureMetrics(metadata);

      try {
        return await this.tracing?.traceLLMCall('generateText', metadata, async () => {
          // Input guardrails
          let processedParams = params;
          if (options.checkInput !== false) {
            const inputResult = await this.guardrails.evaluateInput(
              this.extractContent(params),
              options
            );

            if (inputResult.blocked) {
              this.recordViolations(inputResult, metadata, options);
              
              if (options.onInputViolation === 'exception') {
                throw new KliraPolicyViolation(
                  `Input policy violation: ${inputResult.reason}`,
                  inputResult.violations
                );
              }
              
              // Return alternative response
              return {
                text: options.violationResponse || 'Request blocked due to policy violation.',
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              };
            }

            // Apply transformations and augmentation
            processedParams = this.applyInputProcessing(params, inputResult, options);
          }

          // Execute original function
          const result = await originalFn(processedParams);

          // Output guardrails
          if (options.checkOutput !== false && result.text) {
            const outputResult = await this.guardrails.evaluateOutput(result.text, options);
            
            if (outputResult.blocked) {
              this.recordViolations(outputResult, metadata, options);
              
              if (options.onOutputViolation === 'exception') {
                throw new KliraPolicyViolation(
                  `Output policy violation: ${outputResult.reason}`,
                  outputResult.violations
                );
              }
              
              // Return alternative or transformed response
              return {
                ...result,
                text: outputResult.transformedInput ||
                      options.outputViolationResponse ||
                      'Response blocked due to policy violation.',
              };
            }

            // Apply output transformations
            if (outputResult.transformedInput) {
              result.text = outputResult.transformedInput;
            }
          }

          // Record success metrics
          const duration = Date.now() - startTime;
          this.metrics?.recordLatency('generateText', duration, metadata);
          
          if (result.usage) {
            this.metrics?.recordTokens(
              result.usage.promptTokens,
              result.usage.completionTokens,
              metadata
            );
          }

          this.metrics?.recordSuccess(metadata);
          return result;

        }) || await originalFn(params);

      } catch (error) {
        const duration = Date.now() - startTime;
        this.metrics?.recordLatency('generateText', duration, metadata);
        this.metrics?.recordError(metadata, error as Error);
        throw error;
      }
    };
  }

  /**
   * Wrap streamText function
   */
  private wrapStreamText(
    originalFn: (params: AISDKStreamTextParams) => AsyncIterable<any>,
    options: VercelAIAdapterOptions
  ) {
    const self = this;
    return async function* (params: AISDKStreamTextParams): AsyncIterable<any> {
      const startTime = Date.now();
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const metadata: TraceMetadata = {
        framework: 'vercel-ai',
        provider: params.model.provider,
        model: params.model.modelId,
        requestId,
      };

      await self.captureMetrics(metadata);

      try {
        // Input guardrails
        let processedParams = params;
        if (options.checkInput !== false) {
          const inputResult = await self.guardrails.evaluateInput(
            self.extractContent(params),
            options
          );

          if (inputResult.blocked) {
            self.recordViolations(inputResult, metadata, options);
            
            if (options.onInputViolation === 'exception') {
              throw new KliraPolicyViolation(
                `Input policy violation: ${inputResult.reason}`,
                inputResult.violations
              );
            }
            
            // Yield alternative response and return
            yield {
              type: 'text-delta',
              textDelta: options.violationResponse || 'Request blocked due to policy violation.',
            };
            return;
          }

          processedParams = self.applyInputProcessing(params, inputResult, options);
        }

        // Stream processing with guardrails
        const stream = originalFn(processedParams);
        let chunkCount = 0;
        let accumulatedText = '';
        const checkInterval = options.streamingCheckInterval || 5;

        for await (const chunk of stream) {
          chunkCount++;

          // Accumulate text for periodic checks
          if (chunk.type === 'text-delta' && chunk.textDelta) {
            accumulatedText += chunk.textDelta;
          }

          // Periodic guardrail checks during streaming
          if (
            options.enableStreamingGuardrails &&
            options.checkOutput !== false &&
            chunkCount % checkInterval === 0 &&
            accumulatedText
          ) {
            const streamResult = await self.guardrails.evaluateOutput(accumulatedText, options);
            
            if (streamResult.blocked) {
              self.recordViolations(streamResult, metadata, options);
              
              if (options.onOutputViolation === 'exception') {
                throw new KliraPolicyViolation(
                  `Streaming output policy violation: ${streamResult.reason}`,
                  streamResult.violations
                );
              }
              
              // Stop the stream and return alternative
              yield {
                type: 'text-delta',
                textDelta: '\n\n[Response terminated due to policy violation]',
              };
              return;
            }
          }

          yield chunk;
        }

        // Final guardrail check
        if (options.checkOutput !== false && accumulatedText) {
          const finalResult = await self.guardrails.evaluateOutput(accumulatedText, options);
          
          if (finalResult.blocked) {
            self.recordViolations(finalResult, metadata, options);
            // Already streamed, so log the violation
            self.logger.warn(`Final stream output blocked: ${finalResult.reason}`);
          }
        }

        const duration = Date.now() - startTime;
        self.metrics?.recordLatency('streamText', duration, metadata);
        self.metrics?.recordSuccess(metadata);

      } catch (error) {
        const duration = Date.now() - startTime;
        self.metrics?.recordLatency('streamText', duration, metadata);
        self.metrics?.recordError(metadata, error as Error);
        throw error;
      }
    };
  }

  /**
   * Wrap generateObject function
   */
  private wrapGenerateObject(
    originalFn: (params: any) => Promise<any>,
    options: VercelAIAdapterOptions
  ) {
    return async (params: any): Promise<any> => {
      // Similar to generateText but for structured output
      return this.wrapGenerateText(originalFn, options)(params);
    };
  }

  /**
   * Wrap streamObject function  
   */
  private wrapStreamObject(
    originalFn: (params: any) => AsyncIterable<any>,
    options: VercelAIAdapterOptions
  ) {
    return this.wrapStreamText(originalFn, options);
  }

  /**
   * Extract content from AI SDK parameters
   */
  private extractContent(params: any): string {
    // Handle different parameter formats
    if (typeof params === 'string') {
      return params;
    }

    if (params.prompt) {
      return params.prompt;
    }

    if (params.messages && Array.isArray(params.messages)) {
      // Extract user message content
      const userMessages = params.messages
        .filter((msg: AISDKMessage) => msg.role === 'user')
        .map((msg: AISDKMessage) => msg.content)
        .join('\n');
      return userMessages;
    }

    return '';
  }

  /**
   * Apply input processing (transformations and augmentation)
   */
  private applyInputProcessing(
    params: any,
    result: GuardrailResult,
    options: VercelAIAdapterOptions
  ): any {
    let processedParams = { ...params };

    // Apply transformations
    if (result.transformedInput) {
      if (processedParams.prompt) {
        processedParams.prompt = result.transformedInput;
      } else if (processedParams.messages) {
        // Update the last user message
        const messages = [...processedParams.messages];
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            messages[i] = { ...messages[i], content: result.transformedInput };
            break;
          }
        }
        processedParams.messages = messages;
      }
    }

    // Apply augmentation guidelines
    if (options.augmentPrompt !== false && result.guidelines && result.guidelines.length > 0) {
      const guidelinesText = result.guidelines
        .map((guideline, index) => `${index + 1}. ${guideline}`)
        .join('\n');

      const augmentationText = `\n\nIMPORTANT GUIDELINES:\n${guidelinesText}\n\nPlease follow these guidelines in your response.`;

      if (processedParams.prompt) {
        processedParams.prompt += augmentationText;
      } else if (processedParams.messages) {
        const messages = [...processedParams.messages];
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            messages[i] = { 
              ...messages[i], 
              content: messages[i].content + augmentationText 
            };
            break;
          }
        }
        processedParams.messages = messages;
      }
    }

    return processedParams;
  }

  /**
   * Record comprehensive guardrail violations in metrics and tracing
   */
  private recordViolations(
    result: GuardrailResult, 
    metadata: TraceMetadata, 
    options?: VercelAIAdapterOptions
  ): void {
    // Record in metrics (legacy)
    for (const violation of result.violations) {
      this.metrics?.recordGuardrailViolation(
        violation.ruleId,
        violation.severity,
        metadata
      );
    }

    // Enhanced compliance recording in tracing
    if (this.tracing && result.violations.length > 0) {
      const complianceMetadata: ComplianceMetadata = {
        agentName: metadata.agentName || 'vercel-ai-agent',
        agentVersion: metadata.agentVersion || '1.0.0',
        enforcementMode: options?.enforcementMode || 'monitor',
        customTags: options?.customTags,
        organizationId: metadata.organizationId,
        projectId: metadata.projectId,
        evaluationTimestamp: Date.now(),
      };

      // Record policy violations with comprehensive compliance data
      this.tracing.recordPolicyViolations(result.violations, result, complianceMetadata);
      
      // Record policy usage tracking
      if (result.policyUsage) {
        this.tracing.recordPolicyUsage(result.policyUsage);
      }
    }
  }
}

/**
 * Create a wrapped Vercel AI SDK instance
 */
export function createKliraVercelAI(options: VercelAIAdapterOptions = {}) {
  const adapter = new VercelAIAdapter();
  
  // Return a factory function that wraps AI SDK imports
  return {
    /**
     * Wrap the main AI SDK module
     */
    wrapAI: (aiModule: any) => adapter.wrap(aiModule, options),
    
    /**
     * Wrap generateText function
     */
    wrapGenerateText: (generateText: any) => adapter.wrap({ generateText }, options).generateText,
    
    /**
     * Wrap streamText function
     */
    wrapStreamText: (streamText: any) => adapter.wrap({ streamText }, options).streamText,
    
    /**
     * Get the adapter instance
     */
    adapter,
  };
}

export default VercelAIAdapter;