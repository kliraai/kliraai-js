/**
 * Guardrails decorator for automatic policy enforcement
 * Supports both TC39 (modern) and legacy TypeScript decorator standards
 */

import type { GuardrailOptions, AnyFunction, Logger } from '../types/index.js';
import { KliraPolicyViolation } from '../types/index.js';
import { getLogger } from '../config/index.js';
import { GuardrailsEngine } from '../guardrails/engine.js';
import { KliraTracing } from '../observability/tracing.js';
import { KliraMetrics } from '../observability/metrics.js';

// TC39 Decorator Context interface (for modern decorators)
interface TC39DecoratorContext {
  kind: string;
  name: string | symbol;
  private?: boolean;
  static?: boolean;
  metadata?: Record<string | symbol | number, unknown>;
}

// Type guards for decorator standard detection
function isTC39Context(value: any): value is TC39DecoratorContext {
  return value && typeof value === 'object' && 'kind' in value && 'name' in value;
}

function isLegacyDecorator(descriptor: any): descriptor is PropertyDescriptor {
  return descriptor && typeof descriptor === 'object' && ('value' in descriptor || 'get' in descriptor || 'set' in descriptor);
}

/**
 * Guardrails decorator that supports both TC39 (modern) and legacy TypeScript decorators
 * Provides automatic policy enforcement with runtime initialization for safe operation
 */
export function guardrails(options: GuardrailOptions = {}) {
  return function <_T extends AnyFunction>(
    targetOrValue: any,
    propertyKeyOrContext: string | symbol | TC39DecoratorContext,
    descriptor?: PropertyDescriptor
  ): PropertyDescriptor | Function {
    // Detect which decorator standard is being used
    const isTC39 = isTC39Context(propertyKeyOrContext);

    let originalMethod: Function;
    let propertyKey: string | symbol;
    let methodName: string;
    
    if (isTC39) {
      // TC39 Decorator Standard (modern - used by tsx, esbuild)
      const context = propertyKeyOrContext as TC39DecoratorContext;
      originalMethod = targetOrValue;
      propertyKey = context.name;
      methodName = String(context.name);
      
      // Validate that we're decorating a method
      if (context.kind !== 'method') {
        throw new Error(`@guardrails decorator can only be applied to methods. Found: ${context.kind}`);
      }
      
      if (!originalMethod || typeof originalMethod !== 'function') {
        throw new Error(`@guardrails decorator target must be a function. Found: ${typeof originalMethod}`);
      }
    } else {
      // Legacy TypeScript Decorator Standard (used by tsc)
      propertyKey = propertyKeyOrContext as string | symbol;
      methodName = String(propertyKey);
      
      // Handle missing descriptor case
      if (!descriptor) {
        descriptor = Object.getOwnPropertyDescriptor(targetOrValue, propertyKey) || {
          value: targetOrValue[propertyKey],
          writable: true,
          enumerable: true,
          configurable: true
        };
      }
      
      originalMethod = descriptor?.value;
      
      if (!originalMethod || typeof originalMethod !== 'function') {
        throw new Error(`@guardrails decorator can only be applied to methods. Found: ${typeof originalMethod}`);
      }
    }

    // Create the wrapped method with runtime initialization
    const wrappedMethod = async function (this: any, ...args: any[]) {
      // Runtime initialization - moved from decoration time to prevent initialization order issues
      let logger: Logger;
      let tracing: KliraTracing | undefined;
      let metrics: KliraMetrics | undefined;
      let guardrails: GuardrailsEngine;
      
      try {
        // Get logger at runtime to ensure config is initialized
        logger = getLogger();
      } catch (error) {
        // Fallback logger if config not initialized
        logger = {
          debug: () => {},
          info: () => {},
          warn: (...args) => console.warn('[Klira]', ...args),
          error: (...args) => console.error('[Klira]', ...args)
        };
        logger.warn(`Failed to get logger, using fallback: ${error}`);
      }
      
      const startTime = Date.now();
      
      // Safely initialize observability components (optional chaining for disabled features)
      try {
        tracing = KliraTracing.getInstance();
      } catch {
        // Tracing not initialized, disabled, or config not ready
        tracing = undefined;
      }
      
      try {
        metrics = KliraMetrics.getInstance();
      } catch {
        // Metrics not initialized, disabled, or config not ready
        metrics = undefined;
      }
      
      // Initialize GuardrailsEngine with error handling
      try {
        guardrails = GuardrailsEngine.getInstance();
      } catch (error) {
        logger.error(`Failed to initialize GuardrailsEngine in ${methodName}: ${error}`);
        // If guardrails can't be initialized, execute method directly
        return await originalMethod.apply(this, args);
      }

      const metadata = {
        framework: 'typescript-decorator',
        method: methodName,
        requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      // Safe metrics recording with optional chaining
      metrics?.recordRequest(metadata);

      // Define the guardrails execution function
      const executeWithGuardrails = async () => {
          let processedArgs = args;
          
          // Input guardrails
          if (options.checkInput !== false) {
            const inputContent = extractInputContent(args, options);
            
            if (inputContent) {
              const inputResult = tracing ? 
                await tracing.traceGuardrails('input', async () => {
                  return guardrails.evaluateInput(inputContent, options);
                }) :
                await guardrails.evaluateInput(inputContent, options);

              const guardrailDuration = Date.now() - startTime;
              // Safe metrics recording with optional chaining
              metrics?.recordGuardrailCheck('input', guardrailDuration, inputResult.blocked);

              if (inputResult.blocked) {
                // Record violations with safe metrics access
                if (metrics && inputResult.violations) {
                  for (const violation of inputResult.violations) {
                    metrics.recordGuardrailViolation(
                      violation.ruleId,
                      violation.severity,
                      metadata
                    );
                  }
                }

                if (options.onInputViolation === 'exception') {
                  throw new KliraPolicyViolation(
                    `Input policy violation in ${methodName}: ${inputResult.reason}`,
                    inputResult.violations
                  );
                } else {
                  // Return alternative response
                  return options.violationResponse || 'Request blocked due to policy violation.';
                }
              }

              // Apply any transformations
              if (inputResult.transformedInput) {
                processedArgs = applyInputTransformations(args, inputResult.transformedInput, options);
              }

              // Apply prompt augmentation if enabled
              if (options.augmentPrompt !== false && inputResult.guidelines) {
                processedArgs = applyPromptAugmentation(processedArgs, inputResult.guidelines, options);
              }
            }
          }

          // Execute original method with processed args, preserving 'this' context
          const methodResult = await originalMethod.apply(this, processedArgs);

          // Output guardrails
          if (options.checkOutput !== false) {
            const outputContent = extractOutputContent(methodResult, options);
            
            if (outputContent) {
              const outputResult = tracing ?
                await tracing.traceGuardrails('output', async () => {
                  return guardrails.evaluateOutput(outputContent, options);
                }) :
                await guardrails.evaluateOutput(outputContent, options);

              const guardrailDuration = Date.now() - startTime;
              // Safe metrics recording with optional chaining
              metrics?.recordGuardrailCheck('output', guardrailDuration, outputResult.blocked);

              if (outputResult.blocked) {
                // Record violations with safe metrics access
                if (metrics && outputResult.violations) {
                  for (const violation of outputResult.violations) {
                    metrics.recordGuardrailViolation(
                      violation.ruleId,
                      violation.severity,
                      metadata
                    );
                  }
                }

                if (options.onOutputViolation === 'exception') {
                  throw new KliraPolicyViolation(
                    `Output policy violation in ${methodName}: ${outputResult.reason}`,
                    outputResult.violations
                  );
                } else {
                  // Return alternative or transformed response
                  return outputResult.transformedInput ||
                         options.outputViolationResponse || 
                         'Response blocked due to policy violation.';
                }
              }

              // Apply any output transformations
              if (outputResult.transformedInput) {
                return outputResult.transformedInput;
              }
            }
          }

          return methodResult;
        };

      try {
        let result;

        // Trace the entire operation if tracing is available and enabled
        if (tracing) {
          result = await tracing.traceLLMCall('decorated_method', metadata, async () => {
            return await executeWithGuardrails();
          });
        } else {
          result = await executeWithGuardrails();
        }

        const duration = Date.now() - startTime;
        // Safe metrics recording with optional chaining
        metrics?.recordLatency(methodName, duration, metadata);
        metrics?.recordSuccess(metadata);

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;
        // Safe metrics recording with optional chaining  
        metrics?.recordLatency(methodName, duration, metadata);
        metrics?.recordError(metadata, error as Error);
        
        logger.error(`Guardrails decorator error in ${methodName}: ${error}`);
        throw error;
      }
    };

    // Return appropriate format based on decorator standard
    if (isTC39) {
      // TC39 decorators expect the wrapped function to be returned directly
      return wrappedMethod as _T;
    } else {
      // Legacy decorators expect a PropertyDescriptor to be returned
      const newDescriptor: PropertyDescriptor = {
        value: wrappedMethod,
        writable: descriptor?.writable ?? true,
        enumerable: descriptor?.enumerable ?? true,
        configurable: descriptor?.configurable ?? true
      };
      
      return newDescriptor;
    }
  };
}

/**
 * Extract input content for guardrail evaluation
 */
function extractInputContent(args: any[], _options: GuardrailOptions): string | null {
  // Strategy 1: Look for common input patterns
  for (const arg of args) {
    if (typeof arg === 'string') {
      return arg;
    }
    
    // Check for message arrays (common in chat APIs)
    if (Array.isArray(arg) && arg.length > 0) {
      const lastMessage = arg[arg.length - 1];
      if (lastMessage && typeof lastMessage.content === 'string') {
        return lastMessage.content;
      }
    }
    
    // Check for objects with common content properties
    if (arg && typeof arg === 'object') {
      for (const prop of ['prompt', 'message', 'content', 'input', 'text']) {
        if (typeof arg[prop] === 'string') {
          return arg[prop];
        }
      }
      
      // Check for messages array in object
      if (Array.isArray(arg.messages) && arg.messages.length > 0) {
        const lastMessage = arg.messages[arg.messages.length - 1];
        if (lastMessage && typeof lastMessage.content === 'string') {
          return lastMessage.content;
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract output content for guardrail evaluation
 */
function extractOutputContent(result: any, _options: GuardrailOptions): string | null {
  if (typeof result === 'string') {
    return result;
  }
  
  if (result && typeof result === 'object') {
    // Check for common output properties
    for (const prop of ['text', 'content', 'message', 'response', 'output']) {
      if (typeof result[prop] === 'string') {
        return result[prop];
      }
    }
    
    // Check for choices array (OpenAI format)
    if (Array.isArray(result.choices) && result.choices.length > 0) {
      const choice = result.choices[0];
      if (choice.message && typeof choice.message.content === 'string') {
        return choice.message.content;
      }
      if (typeof choice.text === 'string') {
        return choice.text;
      }
    }
  }
  
  return null;
}

/**
 * Apply input transformations from guardrail results
 */
function applyInputTransformations(
  args: any[], 
  transformedContent: string, 
  _options: GuardrailOptions
): any[] {
  const newArgs = [...args];
  
  // Try to replace the content in the same structure it was found
  for (let i = 0; i < newArgs.length; i++) {
    const arg = newArgs[i];
    
    if (typeof arg === 'string') {
      newArgs[i] = transformedContent;
      return newArgs;
    }
    
    if (Array.isArray(arg) && arg.length > 0) {
      const lastMessage = arg[arg.length - 1];
      if (lastMessage && typeof lastMessage.content === 'string') {
        const newMessages = [...arg];
        newMessages[newMessages.length - 1] = {
          ...lastMessage,
          content: transformedContent,
        };
        newArgs[i] = newMessages;
        return newArgs;
      }
    }
    
    if (arg && typeof arg === 'object') {
      for (const prop of ['prompt', 'message', 'content', 'input', 'text']) {
        if (typeof arg[prop] === 'string') {
          newArgs[i] = { ...arg, [prop]: transformedContent };
          return newArgs;
        }
      }
      
      if (Array.isArray(arg.messages) && arg.messages.length > 0) {
        const lastMessage = arg.messages[arg.messages.length - 1];
        if (lastMessage && typeof lastMessage.content === 'string') {
          const newMessages = [...arg.messages];
          newMessages[newMessages.length - 1] = {
            ...lastMessage,
            content: transformedContent,
          };
          newArgs[i] = { ...arg, messages: newMessages };
          return newArgs;
        }
      }
    }
  }
  
  return newArgs;
}

/**
 * Apply prompt augmentation with guidelines
 */
function applyPromptAugmentation(
  args: any[], 
  guidelines: string[], 
  _options: GuardrailOptions
): any[] {
  if (guidelines.length === 0) {
    return args;
  }

  const newArgs = [...args];
  const guidelinesText = guidelines
    .map((guideline, index) => `${index + 1}. ${guideline}`)
    .join('\n');

  const augmentationText = `\n\nIMPORTANT GUIDELINES:\n${guidelinesText}\n\nPlease follow these guidelines in your response.`;

  // Apply augmentation to the main content
  for (let i = 0; i < newArgs.length; i++) {
    const arg = newArgs[i];
    
    if (typeof arg === 'string') {
      newArgs[i] = arg + augmentationText;
      return newArgs;
    }
    
    if (Array.isArray(arg) && arg.length > 0) {
      const lastMessage = arg[arg.length - 1];
      if (lastMessage && typeof lastMessage.content === 'string') {
        const newMessages = [...arg];
        newMessages[newMessages.length - 1] = {
          ...lastMessage,
          content: lastMessage.content + augmentationText,
        };
        newArgs[i] = newMessages;
        return newArgs;
      }
    }
    
    if (arg && typeof arg === 'object') {
      for (const prop of ['prompt', 'message', 'content', 'input', 'text']) {
        if (typeof arg[prop] === 'string') {
          newArgs[i] = { ...arg, [prop]: arg[prop] + augmentationText };
          return newArgs;
        }
      }
      
      if (Array.isArray(arg.messages) && arg.messages.length > 0) {
        const lastMessage = arg.messages[arg.messages.length - 1];
        if (lastMessage && typeof lastMessage.content === 'string') {
          const newMessages = [...arg.messages];
          newMessages[newMessages.length - 1] = {
            ...lastMessage,
            content: lastMessage.content + augmentationText,
          };
          newArgs[i] = { ...arg, messages: newMessages };
          return newArgs;
        }
      }
    }
  }
  
  return newArgs;
}