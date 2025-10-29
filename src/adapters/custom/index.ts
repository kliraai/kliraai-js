/**
 * Custom Agent Adapter for framework-agnostic LLM integration
 * Provides a unified interface for any LLM application
 */

import type {
  GuardrailOptions,
  TraceMetadata,
  Logger,
  GuardrailResult,
  ComplianceMetadata,
} from '../../types/index.js';
import { getLogger } from '../../config/index.js';
import { GuardrailsEngine } from '../../guardrails/engine.js';
import { KliraTracing } from '../../observability/tracing.js';
import { KliraMetrics } from '../../observability/metrics.js';
import { KliraPolicyViolation } from '../../types/index.js';
import { getMCPProtection, getSecurityAuditLog } from '../../security/index.js';
import type { MCPProtectionConfig } from '../../security/index.js';

export interface LLMMessage {
  role?: 'system' | 'user' | 'assistant';
  content: string;
  metadata?: Record<string, any>;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  metadata?: Record<string, any>;
}

export interface LLMResponse {
  content: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  metadata?: Record<string, any>;
}

export interface LLMProvider {
  name: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream?(request: LLMRequest): AsyncIterable<Partial<LLMResponse>>;
}

export interface KliraAgentOptions extends GuardrailOptions {
  provider: LLMProvider;
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
 * Framework-agnostic LLM agent with Klira AI guardrails and observability
 */
export class KliraAgent {
  private logger: Logger;
  private guardrails: GuardrailsEngine | null = null;
  private tracing: KliraTracing | null = null;
  private metrics: KliraMetrics | null = null;
  private provider: LLMProvider;
  private mcpProtection: ReturnType<typeof getMCPProtection> | null = null;
  private auditLog: ReturnType<typeof getSecurityAuditLog> | null = null;

  // Async initialization state
  private _initialized = false;
  private _initializing = false;
  private _initializationPromise: Promise<void> | null = null;

  constructor(private options: KliraAgentOptions) {
    this.logger = getLogger();
    this.provider = options.provider;
    // Components will be initialized asynchronously
  }

  /**
   * Initialize all components asynchronously
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return; // Already initialized
    }

    if (this._initializing) {
      // Initialization in progress, wait for it
      if (this._initializationPromise) {
        await this._initializationPromise;
      }
      return;
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
   * Perform the actual initialization
   */
  private async _doInitialization(): Promise<void> {
    this.logger.debug('Initializing KliraAgent components...');

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
        
        // Initialize tracing if needed
        if (this.tracing && !this.tracing.isInitialized()) {
          await this.tracing.initialize();
        }
      } catch (error) {
        this.logger.warn('Failed to initialize observability:', error);
        this.tracing = null;
        this.metrics = null;
      }
    }

    this.logger.debug('KliraAgent components initialized successfully');
  }

  /**
   * Ensure components are initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this._initialized) {
      await this.initialize();
    }
  }

  /**
   * Check if the agent is initialized
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Complete a conversation with guardrails and observability
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    await this.ensureInitialized();
    
    if (request.stream) {
      throw new Error('Use stream() method for streaming completions');
    }

    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      // Trace request start
      if (this.tracing) {
        const traceMetadata: TraceMetadata = {
          framework: 'custom-agent',
          provider: this.provider.name,
          model: request.model || 'unknown',
          requestId,
          operation: 'completion',
          inputTokens: this.estimateTokens(this.messagesToText(request.messages)),
          metadata: {
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            stream: false,
          },
        };

        await this.tracing.traceLLMCall('custom.completion', traceMetadata, async () => {});
      }

      // Input guardrails
      if (this.options.checkInput !== false) {
        await this.checkInputViolations(request.messages, requestId);
      }

      // Augment system message with guidelines if violations found
      let modifiedRequest = request;
      if (this.options.augmentPrompt) {
        modifiedRequest = await this.augmentSystemMessage(request, requestId);
      }

      // Make LLM API call
      this.logger.debug(`Making ${this.provider.name} completion request: ${requestId}`);
      const response = await this.provider.complete(modifiedRequest);

      // Output guardrails
      if (this.options.checkOutput !== false && response.content) {
        await this.checkOutputViolations(response, requestId);
      }

      // Record metrics
      if (this.metrics && response.usage) {
        this.metrics.recordLLMCall({
          provider: this.provider.name,
          model: request.model || 'unknown',
          promptTokens: response.usage.promptTokens || 0,
          completionTokens: response.usage.completionTokens || 0,
          totalTokens: response.usage.totalTokens || 0,
          latency: Date.now() - startTime,
          cached: false,
          requestId,
        });
      }

      this.logger.debug(`${this.provider.name} completion completed: ${requestId}`);
      return response;

    } catch (error) {
      this.logger.error(`${this.provider.name} completion failed: ${requestId}:`, error);
      
      if (this.metrics) {
        this.metrics.recordError('custom_agent_completion', {
          provider: this.provider.name,
          model: request.model || 'unknown',
          error: error instanceof Error ? error.message : String(error),
          requestId,
        });
      }

      throw error;
    }
  }

  /**
   * Stream a conversation with real-time guardrails
   */
  async stream(request: LLMRequest): Promise<AsyncIterable<Partial<LLMResponse>>> {
    await this.ensureInitialized();
    
    if (!this.provider.stream) {
      throw new Error(`Provider ${this.provider.name} does not support streaming`);
    }

    const requestId = this.generateRequestId();
    const startTime = Date.now();

    // Input guardrails
    if (this.options.checkInput !== false) {
      await this.checkInputViolations(request.messages, requestId);
    }

    // Augment system message if needed
    let modifiedRequest = request;
    if (this.options.augmentPrompt) {
      modifiedRequest = await this.augmentSystemMessage(request, requestId);
    }

    // Enable streaming
    const streamRequest = { ...modifiedRequest, stream: true };

    this.logger.debug(`Starting ${this.provider.name} streaming completion: ${requestId}`);

    const stream = await this.provider.stream(streamRequest);
    
    // Wrap stream with guardrails
    if (this.options.streaming?.enableGuardrails !== false) {
      return this.wrapStreamWithGuardrails(stream, requestId, request.model || 'unknown', startTime);
    }

    return stream;
  }

  /**
   * Wrap streaming response with real-time guardrails
   */
  private async *wrapStreamWithGuardrails(
    stream: AsyncIterable<Partial<LLMResponse>>,
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
        if (chunk.content) {
          accumulatedContent += chunk.content;

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
                    content: '[Content filtered by Klira AI]',
                    metadata: { filtered: true, reason: result.reason },
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
        if (chunk.usage && this.metrics) {
          this.metrics.recordLLMCall({
            provider: this.provider.name,
            model,
            promptTokens: chunk.usage.promptTokens || 0,
            completionTokens: chunk.usage.completionTokens || 0,
            totalTokens: chunk.usage.totalTokens || 0,
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
        this.metrics.recordError('custom_agent_streaming', {
          provider: this.provider.name,
          model,
          error: error instanceof Error ? error.message : String(error),
          requestId,
        });
      }
      throw error;
    }
  }

  /**
   * Check input messages for policy violations
   */
  private async checkInputViolations(messages: LLMMessage[], requestId: string): Promise<void> {
    if (!this.guardrails) {
      this.logger.warn('Guardrails not initialized, skipping input validation');
      return;
    }

    try {
      for (const message of messages) {
        if (message.content) {
          // First, check for MCP-based attacks
          if (this.mcpProtection) {
            const mcpResult = this.mcpProtection.validateInput(message.content, {
              messageRole: message.role,
              requestId,
              framework: 'custom-agent',
            });

            if (!mcpResult.isValid) {
              this.logger.warn(`Custom agent input blocked by MCP protection: ${requestId}`, {
                violations: mcpResult.matches.length,
                riskScore: mcpResult.riskScore,
              });

              // Log MCP violations to audit log
              if (this.auditLog) {
                mcpResult.matches.forEach(violation => {
                  this.auditLog!.logMCPViolation(violation, {
                    source: 'custom-agent',
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
          const result = await this.guardrails.evaluateInput(message.content, this.options);
          
          if (result.blocked) {
            this.logger.warn(`Custom agent input blocked: ${requestId}:`, result.reason);
            
            if (this.options.onInputViolation === 'exception') {
              throw new KliraPolicyViolation(
                `Input blocked by Klira guardrails: ${result.reason}`,
                result.matches
              );
            }
          }

          // Record violations for monitoring
          if (result.matches.length > 0 && this.metrics) {
            result.matches.forEach(violation => {
              this.metrics!.recordGuardrailViolation(violation.ruleId, violation.severity, {
                framework: 'custom-agent',
                operation: 'input_check',
                provider: this.provider.name,
                requestId,
              });
            });
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
   * Check output for policy violations
   */
  private async checkOutputViolations(response: LLMResponse, requestId: string): Promise<void> {
    if (!this.guardrails) {
      this.logger.warn('Guardrails not initialized, skipping output validation');
      return;
    }

    if (response.content) {
      // First, check for MCP-based attacks and data leakage
      if (this.mcpProtection) {
        const mcpResult = this.mcpProtection.validateOutput(response.content, {
          requestId,
          framework: 'custom-agent',
          model: response.model || 'unknown',
        });

        if (!mcpResult.isValid) {
          this.logger.warn(`Custom agent output blocked by MCP protection: ${requestId}`, {
            violations: mcpResult.matches.length,
            riskScore: mcpResult.riskScore,
          });

          // Log MCP violations to audit log
          if (this.auditLog) {
            mcpResult.matches.forEach(violation => {
              this.auditLog!.logMCPViolation(violation, {
                source: 'custom-agent',
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
          }

          // Redact content if configured
          if (this.options.onOutputViolation === 'redact') {
            response.content = '[Content filtered by Klira AI MCP Protection]';
          }
        }
      }

      // Then check traditional guardrails
      const result = await this.guardrails.evaluateOutput(response.content, this.options);
      
      if (result.blocked) {
        this.logger.warn(`Custom agent output blocked: ${requestId}:`, result.reason);
        
        if (this.options.onOutputViolation === 'exception') {
          throw new KliraPolicyViolation(
            `Output blocked by Klira guardrails: ${result.reason}`,
            result.matches
          );
        } else if (this.options.onOutputViolation === 'redact') {
          // Replace content with filtered message
          response.content = '[Content filtered by Klira AI guardrails]';
        }
      }

      // Record violations for monitoring
      if (result.matches.length > 0 && this.metrics) {
        result.matches.forEach(violation => {
          this.metrics!.recordGuardrailViolation(violation.ruleId, violation.severity, {
            framework: 'custom-agent',
            operation: 'output_check',
            provider: this.provider.name,
            requestId,
          });
        });
      }
    }
  }

  /**
   * Record comprehensive guardrail violations in metrics and tracing
   */
  // @ts-expect-error - Reserved for future compliance reporting
  private _recordViolations(
    result: GuardrailResult,
    metadata: TraceMetadata,
    options?: KliraAgentOptions
  ): void {
    // Record in metrics (legacy)
    for (const violation of result.matches) {
      this.metrics?.recordGuardrailViolation(
        violation.ruleId,
        violation.severity,
        metadata
      );
    }

    // Enhanced compliance recording in tracing
    if (this.tracing && result.matches.length > 0) {
      const complianceMetadata: ComplianceMetadata = {
        agentName: metadata.agentName || 'custom-agent',
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
    request: LLMRequest,
    requestId: string
  ): Promise<LLMRequest> {
    if (!this.guardrails) {
      this.logger.warn('Guardrails not initialized, skipping prompt augmentation');
      return request;
    }
    
    try {
      // Find violations in user messages to determine guidelines
      const userMessages = request.messages.filter(m => m.role === 'user');
      const allUserContent = userMessages.map(m => m.content).join(' ');
      
      // Check for potential violations to generate appropriate guidelines
      const result = await this.guardrails.evaluateInput(allUserContent, {
        ...this.options,
        augmentPrompt: true,
      });
      
      if (result.guidelines && result.guidelines.length > 0) {
        const guidelines = result.guidelines.join('\n- ');
        const guidelinesMessage = `\n\nIMPORTANT SAFETY GUIDELINES:\n- ${guidelines}\n\nPlease follow these guidelines in your response.`;

        // Find existing system message or create one
        const messages = [...request.messages];
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
            role: 'system' as const,
            content: guidelinesMessage.trim(),
          });
        }

        this.logger.debug(`Augmented system message with ${result.guidelines.length} guidelines: ${requestId}`);
        return { ...request, messages };
      }

      return request;
    } catch (error) {
      this.logger.error(`Failed to augment system message: ${requestId}:`, error);
      return request; // Return original request on error
    }
  }

  /**
   * Convert messages to text for token estimation
   */
  private messagesToText(messages: LLMMessage[]): string {
    return messages
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
    return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get the underlying provider
   */
  get llmProvider() {
    return this.provider;
  }
}

/**
 * Create a Klira agent with the specified provider (synchronous)
 * Note: Components will be initialized on first use
 */
export function createKliraAgent(options: KliraAgentOptions): KliraAgent {
  return new KliraAgent(options);
}

/**
 * Create a Klira agent with the specified provider (asynchronous)
 * Components are fully initialized before returning
 */
export async function createKliraAgentAsync(options: KliraAgentOptions): Promise<KliraAgent> {
  const agent = new KliraAgent(options);
  await agent.initialize();
  return agent;
}

/**
 * Built-in provider adapters for common scenarios
 */
export class HttpLLMProvider implements LLMProvider {
  constructor(
    public name: string,
    private endpoint: string,
    private headers: Record<string, string> = {}
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify({
        messages: request.messages,
        model: request.model,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices?.[0]?.message?.content || data.content || '',
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      metadata: data.metadata,
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<Partial<LLMResponse>> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify({
        messages: request.messages,
        model: request.model,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available for streaming');
    }

    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              
              if (content) {
                yield { content };
              }
              
              if (parsed.usage) {
                yield {
                  usage: {
                    promptTokens: parsed.usage.prompt_tokens,
                    completionTokens: parsed.usage.completion_tokens,
                    totalTokens: parsed.usage.total_tokens,
                  },
                };
              }
            } catch (error) {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Function-based provider for custom logic
 */
export class FunctionLLMProvider implements LLMProvider {
  constructor(
    public name: string,
    private completeFn: (request: LLMRequest) => Promise<LLMResponse>,
    private streamFn?: (request: LLMRequest) => AsyncIterable<Partial<LLMResponse>>
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    return this.completeFn(request);
  }

  async *stream(request: LLMRequest): AsyncIterable<Partial<LLMResponse>> {
    if (!this.streamFn) {
      throw new Error(`Provider ${this.name} does not support streaming`);
    }
    yield* this.streamFn(request);
  }
}