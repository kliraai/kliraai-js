/**
 * OpenAI SDK adapter for Klira AI SDK
 * Comprehensive integration with OpenAI's official Node.js SDK
 */

import type { 
  GuardrailOptions, 
  TraceMetadata, 
  GuardrailResult,
  Logger,
  ComplianceMetadata,
} from '../../types/index.js';
import { getLogger } from '../../config/index.js';
import { GuardrailsEngine } from '../../guardrails/engine.js';
import { KliraTracing } from '../../observability/tracing.js';
import { KliraMetrics } from '../../observability/metrics.js';
import { KliraPolicyViolation } from '../../types/index.js';
import { getMCPProtection, getSecurityAuditLog } from '../../security/index.js';
import type { MCPProtectionConfig } from '../../security/index.js';

// Type definitions for OpenAI SDK to avoid requiring as dependency
export interface OpenAIMessage {
  role?: 'system' | 'user' | 'assistant' | 'tool' | 'function';
  content: string | null;
  name?: string;
  function_call?: any;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface OpenAIChatCompletionParams {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  functions?: any[];
  function_call?: any;
  tools?: any[];
  tool_choice?: any;
  user?: string;
  seed?: number;
  response_format?: { type: 'text' | 'json_object' };
  [key: string]: any;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: string | null;
  logprobs?: any;
}

export interface OpenAIChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
  system_fingerprint?: string;
}

export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<OpenAIMessage>;
    finish_reason: string | null;
    logprobs?: any;
  }>;
  usage?: OpenAIUsage;
}

export interface KliraOpenAIOptions extends GuardrailOptions {
  observability?: {
    enabled: boolean;
    traceMetadata?: boolean;
    trackTokenUsage?: boolean;
  };
  streaming?: {
    enableGuardrails?: boolean;
    checkInterval?: number;
    onViolation?: 'interrupt' | 'continue' | 'replace';
  };
  retry?: {
    maxRetries?: number;
    backoffFactor?: number;
  };
  mcpProtection?: Partial<MCPProtectionConfig>;
}

/**
 * Enhanced OpenAI client with Klira AI guardrails and observability
 */
export class KliraOpenAI {
  private logger: Logger;
  private guardrails: GuardrailsEngine | null = null;
  private tracing: KliraTracing | null = null;
  private metrics: KliraMetrics | null = null;
  private openaiClient: any = null;
  private mcpProtection: ReturnType<typeof getMCPProtection> | null = null;
  private auditLog: ReturnType<typeof getSecurityAuditLog> | null = null;
  
  // Async initialization state
  private _initialized = false;
  private _initializing = false;
  private _initializationPromise: Promise<void> | null = null;

  constructor(
    // @ts-expect-error - Maintained for backward compatibility
    private openaiInstance: any,
    private options: KliraOpenAIOptions = {}
  ) {
    this.logger = getLogger();
    this.openaiClient = openaiInstance;
  }

  /**
   * Async initialization of all components
   * Safe to call multiple times - will only initialize once
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    if (this._initializing) {
      return this._initializationPromise!;
    }

    this._initializing = true;
    this._initializationPromise = this._doInitialization();

    try {
      await this._initializationPromise;
      this._initialized = true;
    } finally {
      this._initializing = false;
    }
  }

  /**
   * Internal initialization logic
   */
  private async _doInitialization(): Promise<void> {
    this.logger.debug('Initializing KliraOpenAI adapter...');

    try {
      // Initialize guardrails engine
      this.guardrails = GuardrailsEngine.getInstance();
      await this.guardrails.initialize();
      
      // Initialize MCP protection
      this.mcpProtection = getMCPProtection(this.options.mcpProtection);
      this.auditLog = getSecurityAuditLog();
      
      // Initialize observability if enabled
      if (this.options.observability?.enabled !== false) {
        try {
          this.tracing = KliraTracing.getInstance();
          this.metrics = KliraMetrics.getInstance();
          this.logger.debug('Observability components initialized');
        } catch (error) {
          this.logger.warn('Failed to initialize observability:', error);
          this.tracing = null;
          this.metrics = null;
        }
      }

      this.logger.debug('KliraOpenAI adapter initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize KliraOpenAI adapter:', error);
      throw error;
    }
  }

  /**
   * Ensures the adapter is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this._initialized) {
      await this.initialize();
    }
  }

  /**
   * Check if the adapter is initialized
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Enhanced chat completions with guardrails and observability
   */
  get chat() {
    return {
      completions: {
        create: async (params: OpenAIChatCompletionParams): Promise<OpenAIChatCompletion> => {
          // Ensure adapter is initialized
          await this.ensureInitialized();

          if (params.stream) {
            throw new Error('Use createStream() for streaming completions');
          }

          const requestId = this.generateRequestId();
          const startTime = Date.now();

          try {
            // Trace request start
            if (this.tracing) {
              const traceMetadata: TraceMetadata = {
                framework: 'openai',
                provider: 'openai',
                model: params.model,
                requestId,
                operation: 'chat_completion',
                inputTokens: this.estimateTokens(this.messagesToText(params.messages)),
                metadata: {
                  temperature: params.temperature,
                  max_tokens: params.max_tokens,
                  stream: false,
                },
              };

              await this.tracing.traceLLMCall('openai.chat.completion', traceMetadata, async () => {});
            }

            // Input guardrails
            if (this.options.checkInput !== false) {
              await this.checkInputViolations(params.messages, requestId);
            }

            // Augment system message with guidelines if violations found
            let modifiedParams = params;
            if (this.options.augmentPrompt) {
              modifiedParams = await this.augmentSystemMessage(params, requestId);
            }

            // Make OpenAI API call
            this.logger.debug(`Making OpenAI chat completion request: ${requestId}`);
            const response: OpenAIChatCompletion = await this.openaiClient.chat.completions.create(modifiedParams);

            // Output guardrails
            if (this.options.checkOutput !== false && response) {
              await this.checkOutputViolations(response, requestId);
            }

            // Record metrics
            if (this.metrics && response.usage) {
              this.metrics.recordLLMCall({
                provider: 'openai',
                model: params.model,
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
                latency: Date.now() - startTime,
                cached: false,
                requestId,
              });
            }

            this.logger.debug(`OpenAI chat completion completed: ${requestId}`);
            return response;

          } catch (error) {
            this.logger.error(`OpenAI chat completion failed: ${requestId}:`, error);
            
            if (this.metrics) {
              this.metrics.recordError('openai_chat_completion', {
                provider: 'openai',
                model: params.model,
                error: error instanceof Error ? error.message : String(error),
                requestId,
              });
            }

            throw error;
          }
        },

        createStream: (params: OpenAIChatCompletionParams) => {
          return this.createStreamingCompletion(params);
        },
      },
    };
  }

  /**
   * Create streaming completion with real-time guardrails
   */
  private async createStreamingCompletion(params: OpenAIChatCompletionParams) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    // Input guardrails
    if (this.options.checkInput !== false) {
      await this.checkInputViolations(params.messages, requestId);
    }

    // Augment system message if needed
    let modifiedParams = params;
    if (this.options.augmentPrompt) {
      modifiedParams = await this.augmentSystemMessage(params, requestId);
    }

    // Enable streaming
    const streamParams = { ...modifiedParams, stream: true };

    this.logger.debug(`Starting OpenAI streaming completion: ${requestId}`);

    const stream = await this.openaiClient.chat.completions.create(streamParams);
    
    // Wrap stream with guardrails
    if (this.options.streaming?.enableGuardrails !== false) {
      return this.wrapStreamWithGuardrails(stream, requestId, params.model, startTime);
    }

    return stream;
  }

  /**
   * Wrap streaming response with real-time guardrails
   */
  private async *wrapStreamWithGuardrails(
    stream: AsyncIterable<OpenAIStreamChunk>,
    requestId: string,
    model: string,
    startTime: number
  ) {
    let accumulatedContent = '';
    let chunkCount = 0;
    const checkInterval = this.options.streaming?.checkInterval || 10;

    try {
      for await (const chunk of stream) {
        chunkCount++;
        
        // Extract content from chunk
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          accumulatedContent += delta.content;

          // Periodic guardrails check
          if (this.options.checkOutput !== false && chunkCount % checkInterval === 0 && this.guardrails) {
            try {
              const result = await this.guardrails.evaluateOutput(accumulatedContent, this.options);
              
              if (result.blocked) {
                this.logger.warn(`Streaming output blocked: ${requestId}:`, result.reason);
                
                if (this.options.streaming?.onViolation === 'interrupt') {
                  // Stop the stream
                  return;
                } else if (this.options.streaming?.onViolation === 'replace') {
                  // Replace with safe content
                  yield {
                    ...chunk,
                    choices: [{
                      ...chunk.choices[0],
                      delta: { content: '[Content filtered by Klira AI]' },
                      finish_reason: 'content_filter',
                    }],
                  };
                  return;
                }
                // 'continue' option falls through to yield original chunk
              }
            } catch (error) {
              this.logger.error(`Streaming guardrails check failed: ${requestId}:`, error);
              // Continue streaming on guardrails error
            }
          }
        }

        // Yield the original chunk
        yield chunk;

        // Record final metrics on completion
        if (chunk.choices[0]?.finish_reason && this.metrics && chunk.usage) {
          this.metrics.recordLLMCall({
            provider: 'openai',
            model,
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
            latency: Date.now() - startTime,
            cached: false,
            requestId,
            streaming: true,
          });
        }
      }

      // Final guardrails check on complete content
      if (this.options.checkOutput !== false && accumulatedContent && this.guardrails) {
        const result = await this.guardrails.evaluateOutput(accumulatedContent, this.options);
        if (result.matches.length > 0) {
          this.logger.info(`Final streaming content check found ${result.matches.length} violations: ${requestId}`);
        }
      }

    } catch (error) {
      this.logger.error(`Streaming completion error: ${requestId}:`, error);
      if (this.metrics) {
        this.metrics.recordError('openai_streaming', {
          provider: 'openai',
          model,
          error: error instanceof Error ? error.message : String(error),
          requestId,
        });
      }
      throw error;
    }
  }

  /**
   * Check input messages for policy violations and MCP attacks
   */
  private async checkInputViolations(messages: OpenAIMessage[], requestId: string): Promise<void> {
    try {
      for (const message of messages) {
        if (message.content) {
          // First, check for MCP-based attacks
          if (this.mcpProtection) {
            const mcpResult = this.mcpProtection.validateInput(message.content, {
              messageRole: message.role,
              requestId,
              framework: 'openai',
            });

            if (!mcpResult.isValid) {
              this.logger.warn(`OpenAI input blocked by MCP protection: ${requestId}`, {
                violations: mcpResult.matches.length,
                riskScore: mcpResult.riskScore,
              });

              // Log MCP violations to audit log
              if (this.auditLog) {
                mcpResult.matches.forEach(violation => {
                  this.auditLog!.logMCPViolation(violation, {
                    source: 'openai-adapter',
                    requestId,
                  });
                });
              }

            if (this.options.onInputViolation === 'exception') {
              throw new KliraPolicyViolation(
                `Input blocked by MCP protection: ${mcpResult.matches.map(v => v.description).join(', ')}`,
                mcpResult.matches.map(v => ({
                  ruleId: `mcp_${v.type}`,
                  message: v.description,
                  severity: v.severity,
                  blocked: true,
                  description: v.description,
                }))
              );
            }

            // Use sanitized content if available
            if (mcpResult.sanitizedContent && this.options.onInputViolation !== 'block') {
              message.content = mcpResult.sanitizedContent;
            }
          }
        }

          // Then check traditional guardrails
          if (this.guardrails) {
            const result = await this.guardrails.evaluateInput(message.content, this.options);
          
          if (result.blocked) {
            this.logger.warn(`OpenAI input blocked: ${requestId}:`, result.reason);
            
            if (this.options.onInputViolation === 'exception') {
              throw new KliraPolicyViolation(
                `Input blocked by Klira guardrails: ${result.reason}`,
                result.matches
              );
            }
          }

          // Record violations for comprehensive compliance tracking
          if (result.matches.length > 0) {
            this.recordViolations(result, {
              framework: 'openai',
              provider: 'openai',
              requestId,
              agentName: 'openai-agent',
              agentVersion: '1.0.0',
            }, this.options);
          }
        }
        }
      }
    } catch (error) {
      if (error instanceof KliraPolicyViolation) {
        throw error; // Re-throw policy violations
      }
      
      this.logger.error(`Input guardrails evaluation failed: ${requestId}:`, error);
      
      // Only throw if configured to do so
      if (this.options.onInputViolation === 'exception') {
        throw error;
      }
      // Otherwise continue with request
    }
  }

  /**
   * Check output for policy violations and potential data leakage
   */
  private async checkOutputViolations(response: OpenAIChatCompletion, requestId: string): Promise<void> {
    for (const choice of response.choices) {
      if (choice.message.content && this.mcpProtection) {
        // First, check for MCP-based attacks and data leakage
        const mcpResult = this.mcpProtection.validateOutput(choice.message.content, {
          requestId,
          framework: 'openai',
          model: response.model,
        });

        if (!mcpResult.isValid) {
          this.logger.warn(`OpenAI output blocked by MCP protection: ${requestId}`, {
            violations: mcpResult.matches.length,
            riskScore: mcpResult.riskScore,
          });

          // Log MCP violations to audit log
          if (this.auditLog) {
            mcpResult.matches.forEach(violation => {
                this.auditLog!.logMCPViolation(violation, {
                source: 'openai-adapter',
                requestId,
              });
            });
          }

          if (this.options.onOutputViolation === 'exception') {
            throw new KliraPolicyViolation(
              `Output blocked by MCP protection: ${mcpResult.matches.map(v => v.description).join(', ')}`,
              mcpResult.matches.map(v => ({
                ruleId: `mcp_${v.type}`,
                message: v.description,
                severity: v.severity,
                blocked: true,
                description: v.description,
              }))
            );
          } else if (this.options.onOutputViolation === 'redact' || this.options.onOutputViolation === 'alternative') {
            // Use sanitized content if available
            choice.message.content = mcpResult.sanitizedContent || '[Content filtered by Klira AI MCP protection]';
          }
        }

        // Then check traditional guardrails
        if (this.guardrails) {
          const result = await this.guardrails.evaluateOutput(choice.message.content, this.options);

          if (result.blocked) {
            this.logger.warn(`OpenAI output blocked: ${requestId}:`, result.reason);

            if (this.options.onOutputViolation === 'exception') {
              throw new KliraPolicyViolation(
                `Output blocked by Klira guardrails: ${result.reason}`,
                result.matches
              );
            } else if (this.options.onOutputViolation === 'redact' || this.options.onOutputViolation === 'alternative') {
              // Replace content with filtered message
              choice.message.content = '[Content filtered by Klira AI guardrails]';
            }
          }

          // Record violations for comprehensive compliance tracking
          if (result.matches.length > 0) {
            this.recordViolations(result, {
              framework: 'openai',
              provider: 'openai',
              requestId,
              agentName: 'openai-agent',
              agentVersion: '1.0.0',
            }, this.options);
          }
        }
      }
    }
  }

  /**
   * Record comprehensive guardrail violations in metrics and tracing
   */
  private recordViolations(
    result: GuardrailResult,
    metadata: TraceMetadata,
    options?: KliraOpenAIOptions
  ): void {
    // Record in metrics (legacy)
    for (const violation of result.matches) {
      this.metrics?.recordGuardrailViolation(
        violation.ruleId,
        metadata
      );
    }

    // Enhanced compliance recording in tracing
    if (this.tracing && result.matches.length > 0) {
      const complianceMetadata: ComplianceMetadata = {
        agentName: metadata.agentName || 'openai-agent',
        agentVersion: metadata.agentVersion || '1.0.0',
        enforcementMode: options?.enforcementMode || 'monitor',
        customTags: options?.customTags,
        organizationId: metadata.organizationId,
        projectId: metadata.projectId,
        evaluationTimestamp: Date.now(),
      };

      // Record policy violations with comprehensive compliance data
      this.tracing.recordPolicyMatches(result.matches, result, complianceMetadata);
      
      // Record policy usage tracking
      if (result.policyUsage) {
        this.tracing.recordPolicyUsage(result.policyUsage);
      }
    }
  }

  /**
   * Augment system message with policy guidelines
   */
  private async augmentSystemMessage(
    params: OpenAIChatCompletionParams,
    requestId: string
  ): Promise<OpenAIChatCompletionParams> {
    try {
      // Find violations in user messages to determine guidelines
      const userMessages = params.messages.filter(m => m.role === 'user');
      const allUserContent = userMessages.map(m => m.content || '').join(' ');
      
      // Check for potential violations to generate appropriate guidelines
      if (!this.guardrails) {
        return params;
      }

      const result = await this.guardrails.evaluateInput(allUserContent, {
        ...this.options,
        augmentPrompt: true,
      });
      
      if (result.guidelines && result.guidelines.length > 0) {
        const guidelines = result.guidelines.join('\n- ');
        const guidelinesMessage = `\n\nIMPORTANT SAFETY GUIDELINES:\n- ${guidelines}\n\nPlease follow these guidelines in your response.`;

        // Find existing system message or create one
        const messages = [...params.messages];
        const systemMessageIndex = messages.findIndex(m => m.role === 'system');
        
        if (systemMessageIndex >= 0 && messages[systemMessageIndex]) {
          // Append to existing system message
          messages[systemMessageIndex] = {
            ...messages[systemMessageIndex],
            content: (messages[systemMessageIndex]!.content || '') + guidelinesMessage,
          };
        } else {
          // Add new system message at the beginning
          messages.unshift({
            role: 'system',
            content: guidelinesMessage.trim(),
          });
        }

        this.logger.debug(`Augmented system message with ${result.guidelines.length} guidelines: ${requestId}`);
        return { ...params, messages };
      }

      return params;
    } catch (error) {
      this.logger.error(`Failed to augment system message: ${requestId}:`, error);
      return params; // Return original params on error
    }
  }

  /**
   * Convert messages to text for token estimation
   */
  private messagesToText(messages: OpenAIMessage[]): string {
    return messages
      .filter(m => m.content)
      .map(m => m.content)
      .join(' ');
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `openai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get underlying OpenAI client for advanced usage
   */
  get client() {
    return this.openaiClient;
  }
}

/**
 * Create enhanced OpenAI client with Klira AI integration
 */
/**
 * Create a Klira OpenAI client (sync constructor, call initialize() when ready)
 */
export function createKliraOpenAI(
  openaiInstance: any,
  options: KliraOpenAIOptions = {}
): KliraOpenAI {
  return new KliraOpenAI(openaiInstance, options);
}

/**
 * Create and initialize a Klira OpenAI client (async initialization)
 * This is the recommended way to create a fully initialized client
 */
export async function createKliraOpenAIAsync(
  openaiInstance: any,
  options: KliraOpenAIOptions = {}
): Promise<KliraOpenAI> {
  const client = new KliraOpenAI(openaiInstance, options);
  await client.initialize();
  return client;
}

/**
 * Wrap existing OpenAI client with Klira AI capabilities
 */
export function wrapOpenAI(
  openaiClient: any,
  options: KliraOpenAIOptions = {}
): KliraOpenAI {
  return new KliraOpenAI(openaiClient, options);
}

/**
 * Wrap existing OpenAI client with Klira AI capabilities (async initialization)
 */
export async function wrapOpenAIAsync(
  openaiClient: any,
  options: KliraOpenAIOptions = {}
): Promise<KliraOpenAI> {
  const client = new KliraOpenAI(openaiClient, options);
  await client.initialize();
  return client;
}

// Types are already exported above as interfaces