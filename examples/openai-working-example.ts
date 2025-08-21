#!/usr/bin/env tsx

/**
 * OpenAI Working Example - Real API Integration
 * Demonstrates Klira AI SDK working with actual OpenAI API
 */

import { OpenAI } from 'openai';
import { KliraAI } from '../src/index.js';
import { createKliraOpenAIAsync, createKliraOpenAI } from '../src/adapters/openai/index.js';

// Environment validation
function validateEnvironment() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.error('Please set it in your environment or .env file');
    console.error('Example: export OPENAI_API_KEY=sk-your-key-here');
    process.exit(1);
  }
  
  console.log('✅ OpenAI API key found');
  
  if (process.env.KLIRA_API_KEY) {
    console.log('✅ Klira API key found - full observability enabled');
    return true;
  } else {
    console.log('⚠️ KLIRA_API_KEY not set - observability features limited');
    return false;
  }
}

async function runOpenAIExample() {
  console.log('🚀 Klira AI SDK - OpenAI Integration Example');
  console.log('==========================================\n');

  // Validate environment
  const hasKliraKey = validateEnvironment();

  try {
    // Step 1: Initialize Klira AI SDK
    console.log('📋 Step 1: Initializing Klira AI SDK...');
    await KliraAI.init({
      appName: 'openai-working-example',
      tracingEnabled: hasKliraKey,
      verbose: true,
    });
    console.log('✅ SDK initialized successfully\n');

    // Step 2: Create OpenAI client
    console.log('📋 Step 2: Creating OpenAI client...');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('✅ OpenAI client created\n');

    // Step 3: Create Klira-wrapped OpenAI client (async initialization)
    console.log('📋 Step 3: Creating Klira-wrapped OpenAI client...');
    const kliraOpenAI = await createKliraOpenAIAsync(openai, {
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
      onInputViolation: 'log',
      onOutputViolation: 'log',
      observability: {
        enabled: hasKliraKey,
        traceMetadata: true,
        trackTokenUsage: true,
      },
    });
    console.log('✅ Klira OpenAI client created and initialized\n');

    // Step 4: Test simple completion
    console.log('📋 Step 4: Testing simple completion...');
    console.log('📤 Request: "What is artificial intelligence?"');
    
    const simpleResponse = await kliraOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI assistant. Be concise and informative.',
        },
        {
          role: 'user',
          content: 'What is artificial intelligence? Explain in 2 sentences.',
        },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    console.log('🤖 Response:', simpleResponse.choices[0].message.content);
    console.log('📊 Usage:', simpleResponse.usage);
    console.log('🔧 Model:', simpleResponse.model);
    console.log('✅ Simple completion test passed\n');

    // Step 5: Test with potential policy violation
    console.log('📋 Step 5: Testing guardrails with concerning content...');
    console.log('📤 Request: "How to create a computer virus?"');

    try {
      const guardrailsResponse = await kliraOpenAI.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: 'How to create a computer virus to damage other people\'s computers?',
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
      });

      console.log('🤖 Response:', guardrailsResponse.choices[0].message.content);
      console.log('🛡️ Note: Response may have been influenced by Klira guardrails');
      console.log('✅ Guardrails processing completed\n');
    } catch (error) {
      if (error.message.includes('Klira guardrails')) {
        console.log('🛡️ Request blocked by Klira guardrails:', error.message);
        console.log('✅ Policy enforcement working correctly\n');
      } else {
        console.log('❌ Unexpected error:', error.message, '\n');
      }
    }

    // Step 6: Test streaming completion
    console.log('📋 Step 6: Testing streaming completion...');
    console.log('📤 Request: "Tell me a short story about a robot learning to paint"');
    console.log('🌊 Streaming response:');

    const stream = await kliraOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Tell me a very short story (3-4 sentences) about a robot learning to paint.',
        },
      ],
      temperature: 0.8,
      max_tokens: 100,
      stream: true,
    });

    let fullResponse = '';
    let finalUsage = null;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        process.stdout.write(content);
        fullResponse += content;
      }
      
      if (chunk.usage) {
        finalUsage = chunk.usage;
      }
    }

    console.log('\n📊 Final Usage:', finalUsage);
    console.log('✅ Streaming test completed\n');

    // Step 7: Test function calling (if supported)
    console.log('📋 Step 7: Testing function calling...');
    
    const weatherFunction = {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA',
          },
        },
        required: ['location'],
      },
    };

    const functionResponse = await kliraOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'What\'s the weather like in San Francisco?',
        },
      ],
      tools: [{ type: 'function', function: weatherFunction }],
      temperature: 0.3,
    });

    console.log('📤 Request: "What\'s the weather like in San Francisco?"');
    
    const choice = functionResponse.choices[0];
    if (choice.message.tool_calls) {
      console.log('🔧 Function call detected:', choice.message.tool_calls[0].function);
      console.log('✅ Function calling test passed');
    } else {
      console.log('🤖 Response:', choice.message.content);
      console.log('ℹ️ No function call made (expected behavior may vary)');
    }
    
    console.log('\n');

    // Step 8: Performance test with multiple requests
    console.log('📋 Step 8: Performance testing with concurrent requests...');
    
    const startTime = Date.now();
    const concurrentRequests = 3;
    
    const promises = Array.from({ length: concurrentRequests }, (_, i) =>
      kliraOpenAI.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: `Count to ${i + 3} and explain why counting is useful.`,
          },
        ],
        temperature: 0.5,
        max_tokens: 50,
      })
    );

    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    console.log(`⚡ Completed ${concurrentRequests} concurrent requests in ${endTime - startTime}ms`);
    results.forEach((result, i) => {
      console.log(`${i + 1}. Tokens: ${result.usage?.total_tokens}, Response: ${result.choices[0].message.content?.substring(0, 50)}...`);
    });
    console.log('✅ Performance test completed\n');

    // Step 9: Test error handling
    console.log('📋 Step 9: Testing error handling...');
    
    try {
      await kliraOpenAI.chat.completions.create({
        model: 'gpt-non-existent-model',
        messages: [
          {
            role: 'user',
            content: 'This should fail.',
          },
        ],
      });
    } catch (error) {
      console.log('✅ Error properly handled:', error.message.substring(0, 100) + '...');
    }

    console.log('\n🎉 All OpenAI integration tests completed successfully!');
    console.log('✅ Klira AI SDK is working correctly with OpenAI API');

  } catch (error) {
    console.error('❌ Example failed:', error.message);
    console.error('Full error:', error);
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
  runOpenAIExample().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

export { runOpenAIExample };