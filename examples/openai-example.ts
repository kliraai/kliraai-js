/**
 * Example: Using Klira AI SDK with OpenAI
 * Demonstrates guardrails, observability, and streaming
 */

import { OpenAI } from 'openai';
import { createKliraOpenAI } from '../src/adapters/openai/index.js';
import { createConfig, setGlobalConfig } from '../src/config/index.js';

async function main() {
  // Initialize Klira configuration
  const config = createConfig({
    appName: 'openai-example',
    apiKey: process.env.KLIRA_API_KEY,
    verbose: true,
    tracingEnabled: true,
  });
  setGlobalConfig(config);

  // Create OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Wrap with Klira AI
  const kliraOpenAI = createKliraOpenAI(openai, {
    checkInput: true,
    checkOutput: true,
    augmentPrompt: true,
    onInputViolation: 'log',
    onOutputViolation: 'filter',
    observability: {
      enabled: true,
      traceMetadata: true,
      trackTokenUsage: true,
    },
  });

  console.log('🚀 OpenAI with Klira AI SDK Example');
  console.log('=====================================');

  // Example 1: Simple chat completion
  console.log('\n📝 Example 1: Simple Chat Completion');
  try {
    const response = await kliraOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that explains complex topics simply.',
        },
        {
          role: 'user',
          content: 'Explain quantum computing in simple terms',
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    console.log('✅ Response:', response.choices[0].message.content);
    console.log('📊 Usage:', response.usage);
  } catch (error) {
    console.error('❌ Error:', error);
  }

  // Example 2: Code generation with safety checks
  console.log('\n💻 Example 2: Code Generation');
  try {
    const codeResponse = await kliraOpenAI.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert programmer. Write clean, secure code.',
        },
        {
          role: 'user',
          content: 'Write a Python function to securely hash passwords using bcrypt',
        },
      ],
      temperature: 0.3,
    });

    console.log('✅ Generated Code:');
    console.log(codeResponse.choices[0].message.content);
  } catch (error) {
    console.error('❌ Code generation error:', error);
  }

  // Example 3: Streaming response
  console.log('\n🌊 Example 3: Streaming Response');
  try {
    const stream = kliraOpenAI.chat.completions.createStream({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Tell me a short story about a brave robot',
        },
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    console.log('✅ Streaming story:');
    let fullStory = '';
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        process.stdout.write(content);
        fullStory += content;
      }
      
      // Log final usage information
      if (chunk.usage) {
        console.log('\n📊 Final Usage:', chunk.usage);
      }
    }
    
    console.log('\n✅ Story complete!');
  } catch (error) {
    console.error('❌ Streaming error:', error);
  }

  // Example 4: Multi-turn conversation with context
  console.log('\n💬 Example 4: Multi-turn Conversation');
  try {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful tutor. Keep answers concise but informative.',
      },
      {
        role: 'user',
        content: 'What is machine learning?',
      },
    ];

    // First turn
    const turn1 = await kliraOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.5,
    });

    console.log('🤖 Assistant:', turn1.choices[0].message.content);
    
    // Add to conversation history
    messages.push(turn1.choices[0].message);
    messages.push({
      role: 'user',
      content: 'Can you give me a simple example?',
    });

    // Second turn
    const turn2 = await kliraOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.5,
    });

    console.log('🤖 Assistant:', turn2.choices[0].message.content);
  } catch (error) {
    console.error('❌ Conversation error:', error);
  }

  // Example 5: Function calling
  console.log('\n🔧 Example 5: Function Calling');
  try {
    const functionResponse = await kliraOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'What\'s the weather like in San Francisco?',
        },
      ],
      functions: [
        {
          name: 'get_weather',
          description: 'Get the current weather in a given location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g. San Francisco, CA',
              },
              unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                description: 'Temperature unit',
              },
            },
            required: ['location'],
          },
        },
      ],
      function_call: 'auto',
    });

    const message = functionResponse.choices[0].message;
    
    if (message.function_call) {
      console.log('🔧 Function called:', message.function_call.name);
      console.log('📝 Arguments:', message.function_call.arguments);
    } else {
      console.log('💬 Response:', message.content);
    }
  } catch (error) {
    console.error('❌ Function calling error:', error);
  }

  // Example 6: Testing guardrails with potentially sensitive content
  console.log('\n🛡️ Example 6: Testing Guardrails');
  try {
    // This might trigger guardrails depending on configuration
    const sensitiveResponse = await kliraOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Tell me about cybersecurity best practices for protecting user data',
        },
      ],
      temperature: 0.3,
    });

    console.log('✅ Security response:', sensitiveResponse.choices[0].message.content);
  } catch (error) {
    if (error.name === 'KliraPolicyViolation') {
      console.log('🛡️ Content blocked by guardrails:', error.message);
    } else {
      console.error('❌ Unexpected error:', error);
    }
  }

  console.log('\n🎉 Example completed!');
  console.log('Check your Klira AI dashboard for observability data.');
}

// Error handling for the main function
main().catch((error) => {
  console.error('💥 Example failed:', error);
  process.exit(1);
});

export { main };