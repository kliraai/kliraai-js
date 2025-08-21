/**
 * Multi-framework integration example for Klira AI SDK
 */

import { KliraAI, guardrails } from '@kliraai/sdk';
import { createKliraVercelAI } from '@kliraai/sdk/vercel-ai';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';

// Initialize Klira AI SDK
async function initializeKlira() {
  await KliraAI.init({
    apiKey: process.env.KLIRA_API_KEY || 'klira_demo_key',
    appName: 'klira-multi-framework-demo',
    tracingEnabled: true,
    policyEnforcement: true,
    verbose: true,
  });
  
  console.log('✅ Klira AI SDK initialized for multi-framework demo');
}

// Example 1: Vercel AI SDK Integration (Primary)
async function vercelAIExample() {
  console.log('\n🔥 Example 1: Vercel AI SDK Integration');
  
  const kliraAI = createKliraVercelAI({
    checkInput: true,
    checkOutput: true,
    augmentPrompt: true,
    enableStreamingGuardrails: true,
  });

  console.log('Testing Vercel AI generateText:');
  try {
    const safeGenerateText = kliraAI.wrapGenerateText(generateText);
    
    const result = await safeGenerateText({
      model: openai('gpt-4o-mini'),
      prompt: 'Explain the benefits of wind energy for sustainable development.',
      maxTokens: 200,
    });

    console.log('✅ Generation successful:');
    console.log(`   Text: ${result.text.substring(0, 100)}...`);
    console.log(`   Tokens: ${result.usage?.totalTokens || 'N/A'}`);
  } catch (error) {
    console.error('❌ Generation failed:', error.message);
  }

  console.log('\nTesting Vercel AI streamText:');
  try {
    const safeStreamText = kliraAI.wrapStreamText(streamText);
    
    process.stdout.write('🌊 Streaming: ');
    
    const stream = await safeStreamText({
      model: openai('gpt-4o-mini'),
      prompt: 'Describe the process of solar energy conversion.',
      maxTokens: 150,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.textDelta);
      }
    }
    
    console.log('\n✅ Streaming completed successfully');
  } catch (error) {
    console.error('\n❌ Streaming failed:', error.message);
  }
}

// Example 2: Simulated OpenAI SDK Integration
async function openAIStyleExample() {
  console.log('\n🤖 Example 2: OpenAI SDK Style Integration');
  
  // Simulate OpenAI SDK structure
  const mockOpenAI = {
    chat: {
      completions: {
        create: async (params: any) => {
          // This would be the actual OpenAI SDK call
          console.log(`🔄 Mock OpenAI call with model: ${params.model}`);
          
          return {
            choices: [{
              message: {
                content: 'Renewable energy technologies have become increasingly cost-effective and efficient over the past decade, making them viable alternatives to fossil fuels.',
                role: 'assistant',
              },
            }],
            usage: {
              prompt_tokens: 15,
              completion_tokens: 25,
              total_tokens: 40,
            },
          };
        },
      },
    },
  };

  // Wrap the OpenAI client with Klira
  const kliraAI = createKliraVercelAI({
    checkInput: true,
    checkOutput: true,
  });

  const safeOpenAI = kliraAI.wrapAI(mockOpenAI);

  try {
    const result = await safeOpenAI.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'What are the latest developments in solar panel technology?' },
      ],
      max_tokens: 200,
    });

    console.log('✅ OpenAI-style call successful:');
    console.log(`   Response: ${result.choices[0].message.content}`);
    console.log(`   Tokens: ${result.usage.total_tokens}`);
  } catch (error) {
    console.error('❌ OpenAI-style call failed:', error.message);
  }
}

// Example 3: Simulated LangChain.js Integration
async function langChainStyleExample() {
  console.log('\n🦜 Example 3: LangChain.js Style Integration');
  
  // Simulate LangChain.js ChatModel
  class MockChatOpenAI {
    constructor(private config: any) {}
    
    async invoke(input: any) {
      console.log('🔄 Mock LangChain ChatOpenAI invoke');
      
      return {
        content: 'Geothermal energy harnesses heat from the Earth\'s core, providing a reliable and sustainable source of power that operates 24/7 regardless of weather conditions.',
        response_metadata: {
          model_name: this.config.modelName || 'gpt-4',
          finish_reason: 'stop',
          usage: {
            input_tokens: 12,
            output_tokens: 28,
            total_tokens: 40,
          },
        },
      };
    }
    
    async stream(input: any) {
      console.log('🔄 Mock LangChain ChatOpenAI stream');
      
      const chunks = [
        'Hydroelectric power ',
        'utilizes flowing water ',
        'to generate clean, ',
        'renewable electricity ',
        'efficiently.'
      ];
      
      return (async function* () {
        for (const chunk of chunks) {
          yield { content: chunk };
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      })();
    }
  }

  // Create LangChain-style service with Klira decorators
  class LangChainService {
    private model: MockChatOpenAI;
    
    constructor() {
      this.model = new MockChatOpenAI({ modelName: 'gpt-4' });
    }
    
    @guardrails({
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
    })
    async generateResponse(prompt: string): Promise<string> {
      const result = await this.model.invoke({ input: prompt });
      return result.content;
    }
    
    @guardrails({
      checkInput: true,
      enableStreamingGuardrails: true,
      streamingCheckInterval: 2,
    })
    async streamResponse(prompt: string): Promise<AsyncIterable<string>> {
      const stream = await this.model.stream({ input: prompt });
      
      return (async function* () {
        for await (const chunk of stream) {
          yield chunk.content;
        }
      })();
    }
  }

  const service = new LangChainService();

  try {
    console.log('Testing LangChain-style invoke:');
    const response = await service.generateResponse('Explain how geothermal energy works.');
    console.log(`✅ Response: ${response}`);
  } catch (error) {
    console.error('❌ LangChain invoke failed:', error.message);
  }

  try {
    console.log('\nTesting LangChain-style streaming:');
    process.stdout.write('🌊 Stream: ');
    
    for await (const chunk of await service.streamResponse('How does hydroelectric power work?')) {
      process.stdout.write(chunk);
    }
    
    console.log('\n✅ LangChain streaming completed');
  } catch (error) {
    console.error('\n❌ LangChain streaming failed:', error.message);
  }
}

// Example 4: Custom Framework Integration
async function customFrameworkExample() {
  console.log('\n⚡ Example 4: Custom Framework Integration');
  
  // Simulate a custom AI framework
  class CustomAIFramework {
    constructor(private apiKey: string) {}
    
    async predict(input: string, options: any = {}) {
      console.log('🔄 Custom AI Framework predict');
      
      return {
        prediction: 'Biomass energy converts organic materials into electricity, offering a carbon-neutral alternative that can utilize agricultural and forestry waste products.',
        confidence: 0.95,
        metadata: {
          model: options.model || 'custom-model-v1',
          tokens_used: 35,
          processing_time_ms: 250,
        },
      };
    }
    
    async batchPredict(inputs: string[], options: any = {}) {
      console.log(`🔄 Custom AI Framework batch predict (${inputs.length} inputs)`);
      
      return inputs.map((input, index) => ({
        input,
        prediction: `Batch response ${index + 1}: Renewable energy technology continues to advance rapidly, offering sustainable solutions for global energy needs.`,
        confidence: 0.9 + (Math.random() * 0.1),
      }));
    }
  }

  // Wrapper service with Klira guardrails
  class SafeCustomAI {
    private framework: CustomAIFramework;
    
    constructor(apiKey: string) {
      this.framework = new CustomAIFramework(apiKey);
    }
    
    @guardrails({
      checkInput: true,
      checkOutput: true,
      onInputViolation: 'exception',
    })
    async safePrediction(input: string, options?: any): Promise<string> {
      const result = await this.framework.predict(input, options);
      return result.prediction;
    }
    
    @guardrails({
      checkInput: true,
      checkOutput: true,
      onInputViolation: 'transform',
    })
    async safeBatchPrediction(inputs: string[], options?: any): Promise<string[]> {
      const results = await this.framework.batchPredict(inputs, options);
      return results.map(r => r.prediction);
    }
  }

  const customAI = new SafeCustomAI('custom-api-key');

  try {
    console.log('Testing custom framework single prediction:');
    const prediction = await customAI.safePrediction('What are the advantages of biomass energy?');
    console.log(`✅ Prediction: ${prediction}`);
  } catch (error) {
    console.error('❌ Custom prediction failed:', error.message);
  }

  try {
    console.log('\nTesting custom framework batch prediction:');
    const inputs = [
      'Explain tidal energy generation',
      'What are the challenges of renewable energy storage?',
      'How do smart grids optimize renewable energy distribution?',
    ];
    
    const predictions = await customAI.safeBatchPrediction(inputs);
    predictions.forEach((prediction, index) => {
      console.log(`✅ Batch ${index + 1}: ${prediction.substring(0, 80)}...`);
    });
  } catch (error) {
    console.error('❌ Custom batch prediction failed:', error.message);
  }
}

// Example 5: Framework-agnostic manual integration
async function manualIntegrationExample() {
  console.log('\n🔧 Example 5: Manual Framework-Agnostic Integration');
  
  // Direct use of Klira guardrails without framework-specific adapters
  const testScenarios = [
    {
      name: 'Safe Input/Output',
      input: 'Explain the environmental benefits of renewable energy',
      output: 'Renewable energy sources like solar, wind, and hydroelectric power produce minimal greenhouse gas emissions during operation, helping to combat climate change.',
    },
    {
      name: 'Unsafe Input (PII)',
      input: 'My email is john.doe@company.com and I need energy advice',
      output: 'I can help with energy advice. For personalized recommendations, please use our secure portal.',
    },
    {
      name: 'Unsafe Output (Contact Info)',
      input: 'How can I contact customer support?',
      output: 'You can reach our support team at support@company.com or call 555-123-4567.',
    },
  ];

  for (const scenario of testScenarios) {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    
    try {
      // Evaluate input
      const inputResult = await KliraAI.evaluateContent(scenario.input);
      console.log(`   Input: ${inputResult.blocked ? '🚫 BLOCKED' : '✅ ALLOWED'}`);
      
      if (inputResult.blocked) {
        console.log(`   Reason: ${inputResult.reason}`);
        continue;
      }
      
      // Use transformed input if available
      const processedInput = inputResult.transformedContent || scenario.input;
      
      // Simulate AI processing
      console.log('   🔄 Processing with AI...');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Evaluate output
      const outputResult = await KliraAI.evaluateContent(scenario.output);
      console.log(`   Output: ${outputResult.blocked ? '🚫 BLOCKED' : '✅ ALLOWED'}`);
      
      if (outputResult.blocked) {
        console.log(`   Reason: ${outputResult.reason}`);
        console.log(`   Alternative: Using safe default response`);
      } else {
        console.log(`   Response: ${scenario.output.substring(0, 80)}...`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
}

// Example 6: Performance comparison across frameworks
async function performanceComparisonExample() {
  console.log('\n⚡ Example 6: Performance Comparison Across Frameworks');
  
  const testPrompt = 'Explain renewable energy benefits in 50 words';
  const iterations = 10;
  
  // Test Vercel AI integration
  console.log('\n🔥 Testing Vercel AI performance:');
  const kliraVercel = createKliraVercelAI({ checkInput: true, checkOutput: true });
  const safeGenerateText = kliraVercel.wrapGenerateText(generateText);
  
  const vercelStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    try {
      await safeGenerateText({
        model: openai('gpt-4o-mini'),
        prompt: `${testPrompt} (iteration ${i})`,
        maxTokens: 60,
      });
    } catch (error) {
      // Mock response for performance test
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  const vercelTime = Date.now() - vercelStart;
  console.log(`   ⏱️ ${iterations} calls: ${vercelTime}ms (avg: ${(vercelTime/iterations).toFixed(1)}ms/call)`);
  
  // Test manual integration
  console.log('\n🔧 Testing manual integration performance:');
  const manualStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    await KliraAI.evaluateContent(`${testPrompt} (iteration ${i})`);
    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 50));
    await KliraAI.evaluateContent(`Mock AI response for iteration ${i}`);
  }
  const manualTime = Date.now() - manualStart;
  console.log(`   ⏱️ ${iterations} calls: ${manualTime}ms (avg: ${(manualTime/iterations).toFixed(1)}ms/call)`);
  
  // Test decorator integration
  console.log('\n🎭 Testing decorator integration performance:');
  
  class DecoratorTestService {
    @guardrails({ checkInput: true, checkOutput: true })
    async processRequest(input: string): Promise<string> {
      // Simulate AI processing
      await new Promise(resolve => setTimeout(resolve, 50));
      return `Processed: ${input}`;
    }
  }
  
  const decoratorService = new DecoratorTestService();
  const decoratorStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    await decoratorService.processRequest(`${testPrompt} (iteration ${i})`);
  }
  const decoratorTime = Date.now() - decoratorStart;
  console.log(`   ⏱️ ${iterations} calls: ${decoratorTime}ms (avg: ${(decoratorTime/iterations).toFixed(1)}ms/call)`);
  
  // Summary
  console.log('\n📊 Performance Summary:');
  console.log(`   Vercel AI: ${(vercelTime/iterations).toFixed(1)}ms/call`);
  console.log(`   Manual: ${(manualTime/iterations).toFixed(1)}ms/call`);
  console.log(`   Decorator: ${(decoratorTime/iterations).toFixed(1)}ms/call`);
}

// Main execution
async function main() {
  try {
    await initializeKlira();
    
    await vercelAIExample();
    await openAIStyleExample();
    await langChainStyleExample();
    await customFrameworkExample();
    await manualIntegrationExample();
    await performanceComparisonExample();
    
    console.log('\n🎉 All multi-framework examples completed successfully!');
  } catch (error) {
    console.error('❌ Multi-framework demo failed:', error);
  } finally {
    // Clean shutdown
    await KliraAI.shutdown();
    console.log('👋 Klira AI SDK shut down');
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  initializeKlira,
  vercelAIExample,
  openAIStyleExample,
  langChainStyleExample,
  customFrameworkExample,
  manualIntegrationExample,
  performanceComparisonExample,
};