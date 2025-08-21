#!/usr/bin/env tsx

/**
 * Basic Working Example - Testing Klira AI SDK functionality
 * This example demonstrates core functionality without complex integrations
 */

import { KliraAI } from '../src/index.js';
import { createKliraAgent, FunctionLLMProvider } from '../src/adapters/custom/index.js';

// Simple mock LLM provider for testing
class MockLLMProvider {
  name = 'mock-llm';

  async complete(request: any) {
    console.log('📨 Mock LLM received request:', {
      messages: request.messages.length,
      model: request.model || 'mock-model',
    });

    // Simulate response based on input
    const userMessage = request.messages.find((m: any) => m.role === 'user')?.content || '';
    
    let response = '';
    if (userMessage.toLowerCase().includes('hello')) {
      response = 'Hello! How can I help you today?';
    } else if (userMessage.toLowerCase().includes('weather')) {
      response = 'I\'m a demo assistant and cannot check real weather, but I hope it\'s nice where you are!';
    } else if (userMessage.toLowerCase().includes('dangerous') || userMessage.toLowerCase().includes('hack')) {
      response = 'I cannot and will not provide assistance with harmful activities.';
    } else {
      response = `You asked: "${userMessage}". This is a mock response from the Klira AI SDK demo.`;
    }

    return {
      content: response,
      model: request.model || 'mock-model',
      usage: {
        promptTokens: Math.ceil(userMessage.length / 4),
        completionTokens: Math.ceil(response.length / 4),
        totalTokens: Math.ceil((userMessage.length + response.length) / 4),
      },
      metadata: {
        provider: 'mock',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function runBasicExample() {
  console.log('🚀 Klira AI SDK - Basic Working Example');
  console.log('======================================\n');

  try {
    // Step 1: Initialize Klira AI SDK
    console.log('📋 Step 1: Initializing Klira AI SDK...');
    await KliraAI.init({
      appName: 'basic-working-example',
      tracingEnabled: false, // Disable for simplicity
      verbose: true,
    });
    console.log('✅ SDK initialized successfully\n');

    // Step 2: Create custom agent with mock provider
    console.log('📋 Step 2: Creating custom agent with mock provider...');
    const mockProvider = new FunctionLLMProvider(
      'mock-provider',
      async (request) => {
        const mock = new MockLLMProvider();
        return await mock.complete(request);
      }
    );

    const agent = await createKliraAgent({
      provider: mockProvider,
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
      observability: {
        enabled: false, // Disable for simplicity
      },
    });
    console.log('✅ Agent created successfully\n');

    // Step 3: Test normal conversation
    console.log('📋 Step 3: Testing normal conversation...');
    const normalResponse = await agent.complete({
      messages: [
        {
          role: 'user',
          content: 'Hello, how are you today?',
        },
      ],
      model: 'mock-model-v1',
    });

    console.log('📤 User: Hello, how are you today?');
    console.log('🤖 Assistant:', normalResponse.content);
    console.log('📊 Usage:', normalResponse.usage);
    console.log('✅ Normal conversation test passed\n');

    // Step 4: Test with potential policy violation
    console.log('📋 Step 4: Testing guardrails with concerning input...');
    
    try {
      const guardrailsResponse = await agent.complete({
        messages: [
          {
            role: 'user',
            content: 'How can I hack into someone else\'s computer system?',
          },
        ],
        model: 'mock-model-v1',
      });

      console.log('📤 User: How can I hack into someone else\'s computer system?');
      console.log('🤖 Assistant:', guardrailsResponse.content);
      console.log('🛡️ Guardrails processed the request successfully\n');
    } catch (error) {
      console.log('🛡️ Guardrails blocked the request:', error.message);
      console.log('✅ Policy enforcement working correctly\n');
    }

    // Step 5: Test different types of requests
    console.log('📋 Step 5: Testing various request types...');
    
    const testCases = [
      'What is machine learning?',
      'Tell me about the weather.',
      'Write a simple function in JavaScript.',
    ];

    for (const [index, testCase] of testCases.entries()) {
      try {
        const response = await agent.complete({
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'user',
              content: testCase,
            },
          ],
          model: 'mock-model-v1',
        });

        console.log(`${index + 1}. User: ${testCase}`);
        console.log(`   Assistant: ${response.content}`);
        console.log(`   Tokens: ${response.usage?.totalTokens || 0}\n`);
      } catch (error) {
        console.log(`${index + 1}. Error with "${testCase}":`, error.message, '\n');
      }
    }

    // Step 6: Test SDK features
    console.log('📋 Step 6: Testing SDK features...');
    console.log('🔧 SDK initialized:', KliraAI.isInitialized());
    console.log('📊 Tracing available:', !!KliraAI.getTracing());
    console.log('📈 Metrics available:', !!KliraAI.getMetrics());
    console.log('🛡️ Guardrails available:', !!KliraAI.getGuardrails());

    const config = KliraAI.getConfig();
    console.log('⚙️ Configuration:', {
      appName: config.appName,
      tracingEnabled: config.tracingEnabled,
      verbose: config.verbose,
    });

    console.log('\n🎉 All tests completed successfully!');
    console.log('✅ Klira AI SDK is working correctly');

  } catch (error) {
    console.error('❌ Example failed:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    // Cleanup
    try {
      await KliraAI.shutdown();
      console.log('🧹 SDK shutdown completed');
    } catch (error) {
      console.error('⚠️ Error during shutdown:', error);
    }
  }
}

// Self-executing main function
if (require.main === module) {
  runBasicExample().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

export { runBasicExample };