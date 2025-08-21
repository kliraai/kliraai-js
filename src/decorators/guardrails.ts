/**
 * Guardrails decorator for automatic policy enforcement
 */

import type { GuardrailOptions, AnyFunction } from '../types/index.js';
import { KliraPolicyViolation } from '../types/index.js';
import { getLogger } from '../config/index.js';
import { GuardrailsEngine } from '../guardrails/engine.js';
import { KliraTracing } from '../observability/tracing.js';
import { KliraMetrics } from '../observability/metrics.js';

/**
 * Guardrails decorator for TypeScript
 */
export function guardrails(options: GuardrailOptions = {}) {
  return function <T extends AnyFunction>(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const logger = getLogger();
    const methodName = String(propertyKey);

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const tracing = KliraTracing.getInstance();
      const metrics = KliraMetrics.getInstance();
      const guardrails = GuardrailsEngine.getInstance();

      const metadata = {
        framework: 'typescript-decorator',
        method: methodName,
        requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      metrics.recordRequest(metadata);

      try {
        let result;

        // Trace the entire operation
        result = await tracing.traceLLMCall('decorated_method', metadata, async () => {
          let processedArgs = args;
          
          // Input guardrails
          if (options.checkInput !== false) {
            const inputContent = extractInputContent(args, options);
            
            if (inputContent) {
              const inputResult = await tracing.traceGuardrails('input', async () => {
                return guardrails.evaluateInput(inputContent, options);
              });

              const guardrailDuration = Date.now() - startTime;
              metrics.recordGuardrailCheck('input', guardrailDuration, inputResult.blocked);

              if (inputResult.blocked) {
                // Record violations
                for (const violation of inputResult.violations) {
                  metrics.recordGuardrailViolation(
                    violation.ruleId,
                    violation.severity,
                    metadata
                  );
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

          // Execute original method with processed args
          const methodResult = await originalMethod.apply(this, processedArgs);

          // Output guardrails
          if (options.checkOutput !== false) {
            const outputContent = extractOutputContent(methodResult, options);
            
            if (outputContent) {
              const outputResult = await tracing.traceGuardrails('output', async () => {
                return guardrails.evaluateOutput(outputContent, options);
              });

              const guardrailDuration = Date.now() - startTime;
              metrics.recordGuardrailCheck('output', guardrailDuration, outputResult.blocked);

              if (outputResult.blocked) {
                // Record violations
                for (const violation of outputResult.violations) {
                  metrics.recordGuardrailViolation(
                    violation.ruleId,
                    violation.severity,
                    metadata
                  );
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
        });

        const duration = Date.now() - startTime;
        metrics.recordLatency(methodName, duration, metadata);
        metrics.recordSuccess(metadata);

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;
        metrics.recordLatency(methodName, duration, metadata);
        metrics.recordError(metadata, error as Error);
        
        logger.error(`Guardrails decorator error in ${methodName}: ${error}`);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Extract input content for guardrail evaluation
 */
function extractInputContent(args: any[], options: GuardrailOptions): string | null {
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
function extractOutputContent(result: any, options: GuardrailOptions): string | null {
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
  options: GuardrailOptions
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
  options: GuardrailOptions
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