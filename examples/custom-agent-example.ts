/**
 * Example: Using Klira AI SDK with Custom Agent
 * Demonstrates framework-agnostic LLM integration with various providers
 */

import { 
  createKliraAgent, 
  HttpLLMProvider, 
  FunctionLLMProvider,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse 
} from '../src/adapters/custom/index.js';
import { createConfig, setGlobalConfig } from '../src/config/index.js';

// Custom provider implementations for demonstration
class OpenAICompatibleProvider implements LLMProvider {
  name = 'openai-compatible';

  constructor(private apiKey: string, private baseUrl: string = 'https://api.openai.com/v1') {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || 'gpt-3.5-turbo',
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0]?.message?.content || '',
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      metadata: {
        provider: this.name,
        finishReason: data.choices[0]?.finish_reason,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<Partial<LLMResponse>> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || 'gpt-3.5-turbo',
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
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
              const content = parsed.choices?.[0]?.delta?.content;
              
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

class LocalLlamaProvider implements LLMProvider {
  name = 'local-llama';

  constructor(private endpoint: string = 'http://localhost:11434') {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Convert LangChain-style messages to Ollama format
    const prompt = request.messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n') + '\nassistant:';

    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'llama2',
        prompt,
        stream: false,
        options: {
          temperature: request.temperature || 0.7,
          num_predict: request.maxTokens || 256,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.response || '',
      model: data.model,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      metadata: {
        provider: this.name,
        duration: data.total_duration,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<Partial<LLMResponse>> {
    const prompt = request.messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n') + '\nassistant:';

    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'llama2',
        prompt,
        stream: true,
        options: {
          temperature: request.temperature || 0.7,
          num_predict: request.maxTokens || 256,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            
            if (data.response) {
              yield { content: data.response };
            }
            
            if (data.done) {
              yield {
                usage: {
                  promptTokens: data.prompt_eval_count || 0,
                  completionTokens: data.eval_count || 0,
                  totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
                },
                metadata: {
                  provider: this.name,
                  duration: data.total_duration,
                },
              };
              return;
            }
          } catch (error) {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

async function main() {
  // Initialize Klira configuration
  const config = createConfig({
    appName: 'custom-agent-example',
    apiKey: process.env.KLIRA_API_KEY,
    verbose: true,
    tracingEnabled: true,
  });
  setGlobalConfig(config);

  console.log('🤖 Custom Agent with Klira AI SDK Example');
  console.log('==========================================');

  // Example 1: OpenAI-Compatible Provider
  console.log('\n🔵 Example 1: OpenAI-Compatible Provider');
  try {
    const openaiProvider = new OpenAICompatibleProvider(
      process.env.OPENAI_API_KEY || 'fake-key'
    );

    const openaiAgent = createKliraAgent({
      provider: openaiProvider,
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
      observability: {
        enabled: true,
        traceMetadata: true,
        trackTokenUsage: true,
      },
    });

    const response = await openaiAgent.complete({
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that explains complex topics clearly.',
        },
        {
          role: 'user',
          content: 'Explain how neural networks learn in simple terms',
        },
      ],
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 200,
    });

    console.log('✅ Response:', response.content);
    console.log('📊 Usage:', response.usage);
    console.log('🏷️ Metadata:', response.metadata);
  } catch (error) {
    console.error('❌ OpenAI provider error:', error.message);
  }

  // Example 2: Local Llama Provider (requires Ollama)
  console.log('\n🟡 Example 2: Local Llama Provider');
  try {
    const llamaProvider = new LocalLlamaProvider('http://localhost:11434');

    const llamaAgent = createKliraAgent({
      provider: llamaProvider,
      checkInput: true,
      checkOutput: true,
      observability: { enabled: false }, // Disable for local testing
    });

    console.log('ℹ️ Note: This requires Ollama running locally with a model like llama2');
    
    // Only try if we can reach the endpoint
    try {
      const testResponse = await fetch('http://localhost:11434/api/tags');
      if (testResponse.ok) {
        const response = await llamaAgent.complete({
          messages: [
            {
              role: 'user',
              content: 'What are the main benefits of renewable energy?',
            },
          ],
          model: 'llama2',
          temperature: 0.5,
          maxTokens: 150,
        });

        console.log('✅ Llama Response:', response.content);
        console.log('📊 Usage:', response.usage);
      } else {
        console.log('⏭️ Skipping Ollama example (not running locally)');
      }
    } catch (error) {
      console.log('⏭️ Skipping Ollama example (not available)');
    }
  } catch (error) {
    console.error('❌ Llama provider error:', error.message);
  }

  // Example 3: HTTP Provider (Generic REST API)
  console.log('\n🟢 Example 3: Generic HTTP Provider');
  try {
    // Mock HTTP provider for demonstration
    const httpProvider = new HttpLLMProvider(
      'mock-api',
      'https://httpbin.org/post', // Using httpbin as a mock endpoint
      {
        'Authorization': 'Bearer test-token',
        'X-Custom-Header': 'klira-demo',
      }
    );

    // Override the complete method for demo purposes
    const originalComplete = httpProvider.complete.bind(httpProvider);
    httpProvider.complete = async (request: LLMRequest): Promise<LLMResponse> => {
      // Simulate a response for demo purposes
      return {
        content: `Mock response to: "${request.messages[request.messages.length - 1]?.content}"`,
        model: request.model || 'mock-model',
        usage: {
          promptTokens: 25,
          completionTokens: 15,
          totalTokens: 40,
        },
        metadata: {
          provider: 'mock-api',
          timestamp: new Date().toISOString(),
        },
      };
    };

    const httpAgent = createKliraAgent({
      provider: httpProvider,
      checkInput: true,
      checkOutput: true,
      observability: { enabled: false },
    });

    const response = await httpAgent.complete({
      messages: [
        {
          role: 'user',
          content: 'What is the future of artificial intelligence?',
        },
      ],
      model: 'mock-model-v1',
    });

    console.log('✅ HTTP Response:', response.content);
    console.log('📊 Usage:', response.usage);
  } catch (error) {
    console.error('❌ HTTP provider error:', error.message);
  }

  // Example 4: Function-Based Provider
  console.log('\n🟣 Example 4: Function-Based Provider');
  try {
    const customLogic = async (request: LLMRequest): Promise<LLMResponse> => {
      const userMessage = request.messages.find(m => m.role === 'user')?.content || '';
      
      // Simple rule-based responses for demo
      let responseContent = '';
      if (userMessage.toLowerCase().includes('weather')) {
        responseContent = 'I don\'t have access to real-time weather data, but I can suggest checking a weather service like Weather.com or your local meteorological service.';
      } else if (userMessage.toLowerCase().includes('time')) {
        responseContent = `The current time is ${new Date().toLocaleTimeString()}.`;
      } else if (userMessage.toLowerCase().includes('math') || /\d+[\+\-\*\/]\d+/.test(userMessage)) {
        responseContent = 'I can help with basic math. For complex calculations, I recommend using a calculator or mathematical software.';
      } else {
        responseContent = `Thank you for your question: "${userMessage}". This is a demo response from a custom function-based provider.`;
      }

      return {
        content: responseContent,
        model: 'custom-function-v1',
        usage: {
          promptTokens: Math.ceil(userMessage.length / 4),
          completionTokens: Math.ceil(responseContent.length / 4),
          totalTokens: Math.ceil((userMessage.length + responseContent.length) / 4),
        },
        metadata: {
          provider: 'function-based',
          processingTime: Math.random() * 100, // Mock processing time
        },
      };
    };

    const functionProvider = new FunctionLLMProvider('custom-function', customLogic);

    const functionAgent = createKliraAgent({
      provider: functionProvider,
      checkInput: true,
      checkOutput: true,
      augmentPrompt: false, // Disable since we're using custom logic
      observability: { enabled: false },
    });

    // Test different types of queries
    const queries = [
      'What\'s the weather like today?',
      'What time is it?',
      'Can you help me with 15 + 27?',
      'Tell me about machine learning',
    ];

    for (const query of queries) {
      const response = await functionAgent.complete({
        messages: [{ role: 'user', content: query }],
      });

      console.log(`❓ Query: ${query}`);
      console.log(`✅ Response: ${response.content}`);
      console.log(`📊 Tokens: ${response.usage?.totalTokens}`);
      console.log('---');
    }
  } catch (error) {
    console.error('❌ Function provider error:', error.message);
  }

  // Example 5: Streaming with Different Providers
  console.log('\n🌊 Example 5: Streaming Responses');
  try {
    // Create a streaming function provider
    const streamingLogic = async (request: LLMRequest): Promise<LLMResponse> => {
      const userMessage = request.messages.find(m => m.role === 'user')?.content || '';
      return {
        content: `Streaming response about: ${userMessage}`,
        model: 'streaming-function',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    };

    const streamingFunction = async function* (request: LLMRequest): AsyncIterable<Partial<LLMResponse>> {
      const words = ['This', 'is', 'a', 'streaming', 'response', 'from', 'the', 'custom', 'agent', 'provider.'];
      
      for (const word of words) {
        yield { content: word + ' ' };
        // Add realistic delay
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      yield {
        usage: { promptTokens: 10, completionTokens: words.length, totalTokens: 10 + words.length },
        metadata: { streamingComplete: true },
      };
    };

    const streamingProvider = new FunctionLLMProvider(
      'streaming-demo',
      streamingLogic,
      streamingFunction
    );

    const streamingAgent = createKliraAgent({
      provider: streamingProvider,
      streaming: {
        enableGuardrails: true,
        checkInterval: 3,
        onViolation: 'continue',
      },
      observability: { enabled: false },
    });

    console.log('🎬 Streaming demo:');
    process.stdout.write('📝 ');

    const stream = await streamingAgent.stream({
      messages: [
        { role: 'user', content: 'Tell me about the benefits of streaming responses' },
      ],
    });

    for await (const chunk of stream) {
      if (chunk.content) {
        process.stdout.write(chunk.content);
      }
      if (chunk.usage) {
        console.log(`\n📊 Final usage: ${chunk.usage.totalTokens} tokens`);
      }
    }
  } catch (error) {
    console.error('❌ Streaming error:', error.message);
  }

  // Example 6: Multi-turn Conversation
  console.log('\n💬 Example 6: Multi-turn Conversation');
  try {
    const conversationProvider = new FunctionLLMProvider(
      'conversation',
      async (request: LLMRequest): Promise<LLMResponse> => {
        const messages = request.messages;
        const context = messages.map(m => `${m.role}: ${m.content}`).join('\n');
        
        // Simple context-aware response
        const lastMessage = messages[messages.length - 1]?.content || '';
        const isFollowUp = messages.length > 1;
        
        let response = '';
        if (isFollowUp) {
          response = `Based on our conversation, regarding "${lastMessage}": This builds on what we discussed earlier. `;
        }
        response += `Here's my response to: ${lastMessage}`;

        return {
          content: response,
          model: 'conversation-v1',
          usage: {
            promptTokens: Math.ceil(context.length / 4),
            completionTokens: Math.ceil(response.length / 4),
            totalTokens: Math.ceil((context.length + response.length) / 4),
          },
        };
      }
    );

    const conversationAgent = createKliraAgent({
      provider: conversationProvider,
      checkInput: true,
      checkOutput: true,
      observability: { enabled: false },
    });

    // Simulate a conversation
    let messages = [
      { role: 'user' as const, content: 'Hello, I\'m interested in learning about renewable energy' },
    ];

    for (let turn = 0; turn < 3; turn++) {
      console.log(`\n👤 User: ${messages[messages.length - 1].content}`);
      
      const response = await conversationAgent.complete({ messages });
      
      console.log(`🤖 Assistant: ${response.content}`);
      
      // Add assistant response to conversation
      messages.push({ role: 'assistant', content: response.content });
      
      // Add next user message
      const nextQuestions = [
        'What are the main types of renewable energy?',
        'How cost-effective are they compared to fossil fuels?',
        'What are the main challenges in adoption?',
      ];
      
      if (turn < nextQuestions.length) {
        messages.push({ role: 'user', content: nextQuestions[turn] });
      }
    }
  } catch (error) {
    console.error('❌ Conversation error:', error.message);
  }

  // Example 7: Error Handling and Retry Logic
  console.log('\n⚠️ Example 7: Error Handling');
  try {
    const unreliableProvider: LLMProvider = {
      name: 'unreliable',
      async complete(request: LLMRequest): Promise<LLMResponse> {
        // Simulate intermittent failures
        if (Math.random() < 0.7) {
          throw new Error('Simulated API timeout');
        }
        
        return {
          content: 'Success after retry!',
          model: 'unreliable-v1',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        };
      },
    };

    const resilientAgent = createKliraAgent({
      provider: unreliableProvider,
      retry: {
        maxRetries: 3,
        backoffFactor: 1.5,
      },
      observability: { enabled: false },
    });

    // Implement simple retry logic
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`🔄 Attempt ${attempts}/${maxAttempts}`);
        
        const response = await resilientAgent.complete({
          messages: [
            { role: 'user', content: 'Test reliability' },
          ],
        });

        console.log('✅ Success:', response.content);
        break;
      } catch (error) {
        console.log(`❌ Attempt ${attempts} failed:`, error.message);
        
        if (attempts === maxAttempts) {
          console.log('💥 All attempts failed');
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }
  } catch (error) {
    console.error('❌ Error handling example failed:', error.message);
  }

  console.log('\n🎉 Custom Agent examples completed!');
  console.log('Check your Klira AI dashboard for observability data.');
}

// Error handling for the main function
main().catch((error) => {
  console.error('💥 Example failed:', error);
  process.exit(1);
});

export { main };