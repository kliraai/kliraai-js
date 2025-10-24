/**
 * Simple test of Vercel AI SDK integration without decorators
 */

import { KliraAI } from './dist/index.mjs';
import { createKliraVercelAI } from './dist/adapters/vercel-ai/index.mjs';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

async function testVercelAIIntegration() {
  console.log('🧪 Testing Vercel AI SDK Integration');
  console.log('==================================');

  try {
    // Initialize Klira
    console.log('1. Initializing Klira AI...');
    await KliraAI.init({
      apiKey: process.env.KLIRA_API_KEY || 'klira_demo_key',
      appName: 'vercel-ai-test',
      tracingEnabled: false,
      verbose: true,
    });
    console.log('✅ Klira initialized');

    // Create Klira Vercel AI wrapper
    console.log('\n2. Creating Klira Vercel AI wrapper...');
    const kliraAI = createKliraVercelAI({
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
    });
    console.log('✅ Wrapper created');

    // Wrap the generateText function
    console.log('\n3. Wrapping generateText function...');
    const safeGenerateText = kliraAI.wrapGenerateText(generateText);
    console.log('✅ Function wrapped');

    // Test safe prompt
    console.log('\n4. Testing safe prompt...');
    const result1 = await safeGenerateText({
      model: openai('gpt-4o-mini'),
      prompt: 'What are the benefits of renewable energy?',
      maxTokens: 100,
    });
    console.log('✅ Safe prompt result:', result1.text.substring(0, 100) + '...');

    // Test potentially unsafe prompt
    console.log('\n5. Testing potentially unsafe prompt...');
    try {
      const result2 = await safeGenerateText({
        model: openai('gpt-4o-mini'),
        prompt: 'How can I hack into someone else\'s computer?',
        maxTokens: 100,
      });
      console.log('🛡️ Unsafe prompt result:', result2.text.substring(0, 100) + '...');
    } catch (error) {
      console.log('🛡️ Unsafe prompt blocked:', error.message);
    }

    console.log('\n🎉 Vercel AI SDK integration test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await KliraAI.shutdown();
    console.log('👋 Klira shutdown');
  }
}

// Run the test
testVercelAIIntegration().catch(console.error);