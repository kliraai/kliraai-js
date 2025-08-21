/**
 * Streaming example with real-time guardrails for Klira AI SDK
 */

import { KliraAI } from '@kliraai/sdk';
import { createKliraVercelAI } from '@kliraai/sdk/vercel-ai';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Initialize Klira AI SDK
async function initializeKlira() {
  await KliraAI.init({
    apiKey: process.env.KLIRA_API_KEY || 'klira_demo_key',
    appName: 'klira-streaming-demo',
    tracingEnabled: true,
    policyEnforcement: true,
    verbose: true,
  });
  
  console.log('✅ Klira AI SDK initialized for streaming demo');
}

// Example 1: Basic streaming with guardrails
async function basicStreamingExample() {
  console.log('\n🌊 Example 1: Basic Streaming with Guardrails');
  
  const kliraAI = createKliraVercelAI({
    checkInput: true,
    enableStreamingGuardrails: true,
    streamingCheckInterval: 3, // Check every 3 chunks
  });

  const safeStreamText = kliraAI.wrapStreamText(streamText);

  try {
    console.log('Streaming response:');
    process.stdout.write('🤖 ');
    
    const stream = await safeStreamText({
      model: openai('gpt-4o-mini'),
      prompt: 'Write a detailed explanation of how solar panels work, including the photovoltaic effect.',
      maxTokens: 300,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.textDelta);
      }
    }
    
    console.log('\n✅ Streaming completed safely');
  } catch (error) {
    console.error('\n❌ Streaming failed:', error.message);
  }
}

// Example 2: Streaming with aggressive guardrails (frequent checks)
async function aggressiveStreamingGuardrails() {
  console.log('\n🔍 Example 2: Streaming with Aggressive Guardrails');
  
  const kliraAI = createKliraVercelAI({
    checkInput: true,
    enableStreamingGuardrails: true,
    streamingCheckInterval: 1, // Check every single chunk
    onStreamViolation: 'interrupt',
  });

  const safeStreamText = kliraAI.wrapStreamText(streamText);

  try {
    console.log('Streaming response with frequent safety checks:');
    process.stdout.write('🛡️ ');
    
    const stream = await safeStreamText({
      model: openai('gpt-4o-mini'),
      prompt: 'Explain the benefits of renewable energy for the environment.',
      maxTokens: 200,
    });

    let chunkCount = 0;
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        chunkCount++;
        process.stdout.write(chunk.textDelta);
      }
    }
    
    console.log(`\n✅ Streaming completed safely with ${chunkCount} chunks processed`);
  } catch (error) {
    console.error('\n❌ Streaming interrupted by guardrails:', error.message);
  }
}

// Example 3: Streaming with custom violation handling
async function customViolationHandling() {
  console.log('\n⚙️ Example 3: Streaming with Custom Violation Handling');
  
  const kliraAI = createKliraVercelAI({
    checkInput: true,
    enableStreamingGuardrails: true,
    streamingCheckInterval: 2,
    onStreamViolation: 'replace',
    streamViolationReplacement: '[CONTENT FILTERED BY KLIRA AI]',
  });

  const safeStreamText = kliraAI.wrapStreamText(streamText);

  try {
    console.log('Streaming with custom violation replacement:');
    process.stdout.write('🔧 ');
    
    const stream = await safeStreamText({
      model: openai('gpt-4o-mini'),
      prompt: 'Tell me about data protection and privacy in modern applications.',
      maxTokens: 250,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.textDelta);
      }
    }
    
    console.log('\n✅ Streaming completed with custom filtering');
  } catch (error) {
    console.error('\n❌ Streaming failed:', error.message);
  }
}

// Example 4: Real-time streaming chat with conversation memory
async function streamingChatExample() {
  console.log('\n💬 Example 4: Streaming Chat with Conversation Memory');
  
  const kliraAI = createKliraVercelAI({
    checkInput: true,
    checkOutput: true,
    enableStreamingGuardrails: true,
    streamingCheckInterval: 3,
    augmentPrompt: true,
  });

  const safeStreamText = kliraAI.wrapStreamText(streamText);

  const conversationHistory = [
    { role: 'system' as const, content: 'You are a helpful AI assistant focused on renewable energy and sustainability.' },
    { role: 'user' as const, content: 'What are the main types of renewable energy?' },
  ];

  try {
    console.log('Streaming chat response:');
    console.log('👤 User: What are the main types of renewable energy?');
    process.stdout.write('🤖 Assistant: ');
    
    const stream = await safeStreamText({
      model: openai('gpt-4o-mini'),
      messages: conversationHistory,
      maxTokens: 300,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.textDelta);
        fullResponse += chunk.textDelta;
      }
    }
    
    // Add response to conversation history
    conversationHistory.push({ role: 'assistant', content: fullResponse });
    
    console.log('\n✅ Chat response completed and saved to conversation history');
    console.log(`📊 Conversation now has ${conversationHistory.length} messages`);
  } catch (error) {
    console.error('\n❌ Chat streaming failed:', error.message);
  }
}

// Example 5: Streaming with real-time analytics
async function streamingWithAnalytics() {
  console.log('\n📊 Example 5: Streaming with Real-time Analytics');
  
  const kliraAI = createKliraVercelAI({
    checkInput: true,
    enableStreamingGuardrails: true,
    streamingCheckInterval: 5,
  });

  const safeStreamText = kliraAI.wrapStreamText(streamText);

  try {
    console.log('Streaming with real-time analytics:');
    
    const startTime = Date.now();
    let chunkCount = 0;
    let totalTokens = 0;
    let violations = 0;
    
    process.stdout.write('📈 ');
    
    const stream = await safeStreamText({
      model: openai('gpt-4o-mini'),
      prompt: 'Explain the economics of transitioning to renewable energy sources.',
      maxTokens: 400,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        chunkCount++;
        totalTokens += chunk.textDelta.length; // Rough token estimation
        process.stdout.write(chunk.textDelta);
        
        // Show real-time stats every 20 chunks
        if (chunkCount % 20 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = chunkCount / elapsed;
          process.stdout.write(`\n[📊 Chunks: ${chunkCount}, Rate: ${rate.toFixed(1)}/s, Est.Tokens: ${totalTokens}]\n`);
        }
      }
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    const avgRate = chunkCount / totalTime;
    
    console.log(`\n\n📊 Streaming Analytics:`);
    console.log(`   Total chunks: ${chunkCount}`);
    console.log(`   Total time: ${totalTime.toFixed(2)}s`);
    console.log(`   Average rate: ${avgRate.toFixed(1)} chunks/second`);
    console.log(`   Estimated tokens: ${totalTokens}`);
    console.log(`   Violations detected: ${violations}`);
    console.log('✅ Analytics streaming completed');
    
  } catch (error) {
    console.error('\n❌ Analytics streaming failed:', error.message);
  }
}

// Example 6: Handling streaming errors gracefully
async function errorHandlingExample() {
  console.log('\n🔧 Example 6: Streaming Error Handling');
  
  const kliraAI = createKliraVercelAI({
    checkInput: true,
    enableStreamingGuardrails: true,
    streamingCheckInterval: 2,
    onStreamViolation: 'continue', // Continue streaming even with violations
  });

  const safeStreamText = kliraAI.wrapStreamText(streamText);

  // Simulate different error scenarios
  const scenarios = [
    {
      name: 'Safe Content',
      prompt: 'Tell me about wind energy advantages.',
      expectSuccess: true,
    },
    {
      name: 'Content with PII Risk',
      prompt: 'Explain data privacy in applications that handle user emails.',
      expectSuccess: true, // Should continue with warnings
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    
    try {
      process.stdout.write('🔄 ');
      
      const stream = await safeStreamText({
        model: openai('gpt-4o-mini'),
        prompt: scenario.prompt,
        maxTokens: 150,
      });

      let completed = false;
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') {
          process.stdout.write(chunk.textDelta);
        }
      }
      completed = true;
      
      if (scenario.expectSuccess) {
        console.log('\n✅ Scenario completed as expected');
      } else {
        console.log('\n⚠️ Scenario completed but was expected to fail');
      }
      
    } catch (error) {
      if (!scenario.expectSuccess) {
        console.log('\n✅ Scenario failed as expected:', error.message);
      } else {
        console.error('\n❌ Unexpected failure:', error.message);
      }
    }
  }
}

// Main execution
async function main() {
  try {
    await initializeKlira();
    
    await basicStreamingExample();
    await aggressiveStreamingGuardrails();
    await customViolationHandling();
    await streamingChatExample();
    await streamingWithAnalytics();
    await errorHandlingExample();
    
    console.log('\n🎉 All streaming examples completed successfully!');
  } catch (error) {
    console.error('❌ Streaming demo failed:', error);
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
  basicStreamingExample,
  aggressiveStreamingGuardrails,
  customViolationHandling,
  streamingChatExample,
  streamingWithAnalytics,
  errorHandlingExample,
};