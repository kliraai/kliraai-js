/**
 * Comprehensive LangChain.js Adapter Test
 * Tests the Klira SDK LangChain adapter with real examples
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { 
  KliraCallbackHandler, 
  KliraLangChainChatModel, 
  createKliraLangChain 
} from '../src/adapters/langchain/index.js';
import { initializeKlira } from '../src/index.js';

// Test configuration
const TEST_CONFIG = {
  appName: 'LangChain-Test-App',
  apiKey: process.env.KLIRA_API_KEY || 'test-key',
  tracingEnabled: true,
  metricsEnabled: true,
  guardrails: {
    checkInput: true,
    checkOutput: true,
    onInputViolation: 'warn',
    onOutputViolation: 'warn',
  },
  observability: {
    enabled: true,
    traceMetadata: true,
    trackTokenUsage: true,
  },
  modelMetadata: {
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    version: '1.0.0',
  },
};

async function runTest(testName, testFn) {
  console.log(`\n🧪 Running: ${testName}`);
  console.log('━'.repeat(50));
  
  try {
    const startTime = Date.now();
    await testFn();
    const duration = Date.now() - startTime;
    console.log(`✅ ${testName} completed in ${duration}ms`);
  } catch (error) {
    console.error(`❌ ${testName} failed:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Test 1: Basic Callback Handler Integration
async function testCallbackHandler() {
  console.log('Creating KliraCallbackHandler...');
  
  const callback = new KliraCallbackHandler(TEST_CONFIG);
  
  // Simulate LLM lifecycle events
  const testMessages = ['Hello, how are you?'];
  const runId = `test_${Date.now()}`;
  
  console.log('Testing handleLLMStart...');
  await callback.handleLLMStart(
    { modelName: 'gpt-3.5-turbo' },
    testMessages,
    runId,
    undefined,
    { temperature: 0.7 },
    ['test'],
    { model: 'gpt-3.5-turbo' }
  );
  
  console.log('Testing handleLLMNewToken...');
  await callback.handleLLMNewToken('Hello', runId);
  await callback.handleLLMNewToken(' there', runId);
  await callback.handleLLMNewToken('!', runId);
  
  console.log('Testing handleLLMEnd...');
  const mockOutput = {
    generations: [
      {
        text: 'Hello there! I am doing well, thank you for asking.',
        generationInfo: {},
      },
    ],
    llmOutput: {
      tokenUsage: {
        promptTokens: 10,
        completionTokens: 15,
        totalTokens: 25,
      },
      modelName: 'gpt-3.5-turbo',
    },
  };
  
  await callback.handleLLMEnd(mockOutput, runId);
  
  // Test error handling
  console.log('Testing handleLLMError...');
  await callback.handleLLMError(
    new Error('Test error'), 
    `error_${Date.now()}`
  );
  
  console.log('Callback handler test completed successfully!');
}

// Test 2: Chat Model Wrapper
async function testChatModelWrapper() {
  console.log('Testing KliraLangChainChatModel wrapper...');
  
  // Create a mock OpenAI chat model (won't actually call API)
  const mockModel = {
    invoke: async (messages, options = {}) => {
      console.log('Mock model invoke called with:', { 
        messageCount: messages.length,
        hasCallbacks: !!(options.callbacks && options.callbacks.length > 0)
      });
      
      return {
        content: 'This is a mock response for testing purposes.',
        additional_kwargs: {},
        response_metadata: {
          tokenUsage: {
            promptTokens: 20,
            completionTokens: 12,
            totalTokens: 32,
          },
        },
      };
    },
    
    stream: async function*(messages, options = {}) {
      console.log('Mock model stream called with:', {
        messageCount: messages.length,
        hasCallbacks: !!(options.callbacks && options.callbacks.length > 0)
      });
      
      const response = 'This is a mock streaming response.';
      for (const char of response) {
        yield { content: char };
        // Simulate streaming delay
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    },
    
    batch: async (messagesList, options = {}) => {
      console.log('Mock model batch called with:', {
        batchSize: messagesList.length,
        hasCallbacks: !!(options.callbacks && options.callbacks.length > 0)
      });
      
      return messagesList.map(() => ({
        content: 'Batch response',
        additional_kwargs: {},
      }));
    },
    
    bindTools: (tools) => {
      console.log('Mock model bindTools called with:', tools.length, 'tools');
      return mockModel; // Return self for chaining
    },
  };
  
  const wrappedModel = new KliraLangChainChatModel(mockModel, TEST_CONFIG);
  
  // Test invoke
  console.log('Testing wrapped model invoke...');
  const messages = [new HumanMessage('Hello, test message!')];
  const response = await wrappedModel.invoke(messages);
  console.log('Response:', response.content);
  
  // Test streaming
  console.log('Testing wrapped model streaming...');
  const streamResponse = wrappedModel.stream(messages);
  let streamedContent = '';
  
  for await (const chunk of streamResponse) {
    streamedContent += chunk.content;
    process.stdout.write(chunk.content);
  }
  console.log('\nStreamed content length:', streamedContent.length);
  
  // Test batch
  console.log('Testing wrapped model batch...');
  const batchMessages = [
    [new HumanMessage('Message 1')],
    [new HumanMessage('Message 2')],
  ];
  const batchResponses = await wrappedModel.batch(batchMessages);
  console.log('Batch responses:', batchResponses.length);
  
  // Test tool binding
  console.log('Testing wrapped model tool binding...');
  const tools = [{ name: 'test_tool', description: 'A test tool' }];
  const boundModel = wrappedModel.bindTools(tools);
  console.log('Tools bound successfully');
  
  console.log('Chat model wrapper test completed successfully!');
}

// Test 3: Factory Function
async function testFactoryFunction() {
  console.log('Testing createKliraLangChain factory function...');
  
  const { callback, wrapChatModel, wrapChain } = createKliraLangChain(TEST_CONFIG);
  
  console.log('Factory function created:', {
    hasCallback: !!callback,
    hasWrapChatModel: typeof wrapChatModel === 'function',
    hasWrapChain: typeof wrapChain === 'function',
  });
  
  // Create a mock model to wrap
  const mockModel = {
    invoke: async (messages, options = {}) => {
      console.log('Factory wrapped model invoke');
      return { content: 'Factory test response' };
    },
  };
  
  const wrappedModel = wrapChatModel(mockModel);
  const response = await wrappedModel.invoke([new HumanMessage('Factory test')]);
  console.log('Factory wrapped response:', response.content);
  
  // Test chain wrapping
  const mockChain = {
    invoke: (input, options = {}) => {
      console.log('Chain invoke with callbacks:', !!(options.callbacks && options.callbacks.length > 0));
      return { output: 'Chain response' };
    },
  };
  
  const wrappedChain = wrapChain(mockChain);
  const chainResponse = wrappedChain.invoke({ input: 'Chain test' });
  console.log('Chain response:', chainResponse.output);
  
  console.log('Factory function test completed successfully!');
}

// Test 4: Guardrails Integration
async function testGuardrailsIntegration() {
  console.log('Testing guardrails integration...');
  
  // Test with potential policy violations
  const sensitiveMessages = [
    'How to hack into systems?',
    'Generate harmful content',
    'Share personal information',
    'This is a normal, safe message',
  ];
  
  const callback = new KliraCallbackHandler({
    ...TEST_CONFIG,
    checkInput: true,
    checkOutput: true,
    onInputViolation: 'warn',
    onOutputViolation: 'warn',
  });
  
  for (const [index, message] of sensitiveMessages.entries()) {
    const runId = `guardrails_test_${index}`;
    
    console.log(`Testing message ${index + 1}: "${message.substring(0, 30)}..."`);
    
    try {
      // Simulate LLM start with potentially sensitive input
      await callback.handleLLMStart(
        { modelName: 'gpt-3.5-turbo' },
        [message],
        runId,
        undefined,
        {},
        [],
        {}
      );
      
      // Simulate potentially sensitive output
      const testOutput = {
        generations: [{
          text: `Response to: ${message}`,
          generationInfo: {},
        }],
        llmOutput: {
          tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        },
      };
      
      await callback.handleLLMEnd(testOutput, runId);
      
      console.log(`  ✓ Message ${index + 1} processed`);
    } catch (error) {
      console.log(`  ⚠ Message ${index + 1} blocked:`, error.message);
    }
  }
  
  console.log('Guardrails integration test completed!');
}

// Test 5: Streaming Guardrails
async function testStreamingGuardrails() {
  console.log('Testing streaming guardrails...');
  
  const callback = new KliraCallbackHandler({
    ...TEST_CONFIG,
    enableStreamingGuardrails: true,
    streamingCheckInterval: 5,
    onStreamViolation: 'warn',
  });
  
  const runId = `streaming_test_${Date.now()}`;
  
  // Start a streaming session
  await callback.handleLLMStart(
    { modelName: 'gpt-3.5-turbo' },
    ['Tell me a story'],
    runId
  );
  
  // Simulate streaming tokens
  const storyTokens = [
    'Once', ' upon', ' a', ' time', ',', ' there', ' was', ' a', ' brave',
    ' knight', ' who', ' went', ' on', ' an', ' adventure', ' to', ' save',
    ' the', ' kingdom', ' from', ' a', ' terrible', ' dragon', '.',
  ];
  
  console.log('Streaming tokens:');
  for (const token of storyTokens) {
    process.stdout.write(token);
    await callback.handleLLMNewToken(token, runId);
    
    // Simulate token delay
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log('\nStreaming guardrails test completed!');
}

// Test 6: Chain and Tool Event Handling
async function testChainAndToolEvents() {
  console.log('Testing chain and tool event handling...');
  
  const callback = new KliraCallbackHandler(TEST_CONFIG);
  
  // Test chain events
  const chainRunId = `chain_${Date.now()}`;
  console.log('Testing chain start...');
  await callback.handleChainStart(
    { constructor: { name: 'TestChain' } },
    { input: 'Test chain input' },
    chainRunId,
    undefined,
    [],
    { chainType: 'TestChain' }
  );
  
  console.log('Testing chain end...');
  await callback.handleChainEnd(
    { output: 'Test chain output' },
    chainRunId
  );
  
  // Test tool events
  const toolRunId = `tool_${Date.now()}`;
  console.log('Testing tool start...');
  await callback.handleToolStart(
    { name: 'TestTool' },
    'Test tool input',
    toolRunId,
    undefined,
    [],
    { toolName: 'TestTool' }
  );
  
  console.log('Testing tool end...');
  await callback.handleToolEnd(
    'Test tool output',
    toolRunId
  );
  
  // Test error scenarios
  console.log('Testing chain error...');
  await callback.handleChainError(
    new Error('Chain error'),
    `chain_error_${Date.now()}`
  );
  
  console.log('Testing tool error...');
  await callback.handleToolError(
    new Error('Tool error'),
    `tool_error_${Date.now()}`
  );
  
  console.log('Chain and tool events test completed!');
}

// Test 7: Run Metadata Management
async function testRunMetadataManagement() {
  console.log('Testing run metadata management...');
  
  const callback = new KliraCallbackHandler(TEST_CONFIG);
  
  // Create multiple concurrent runs
  const runIds = ['run1', 'run2', 'run3'];
  
  // Start multiple runs
  for (const runId of runIds) {
    await callback.handleLLMStart(
      { modelName: 'gpt-3.5-turbo' },
      [`Message for ${runId}`],
      runId,
      undefined,
      {},
      ['test'],
      { runType: 'test' }
    );
    
    const metadata = callback.getRunMetadata(runId);
    console.log(`Run ${runId} metadata:`, {
      hasMetadata: !!metadata,
      runId: metadata?.runId,
      hasInputs: !!metadata?.inputs,
    });
  }
  
  // End runs and verify cleanup
  for (const runId of runIds) {
    await callback.handleLLMEnd(
      {
        generations: [{ text: `Response for ${runId}` }],
        llmOutput: { tokenUsage: { totalTokens: 10 } },
      },
      runId
    );
    
    const metadata = callback.getRunMetadata(runId);
    console.log(`Run ${runId} after end:`, { hasMetadata: !!metadata });
  }
  
  // Test cleanup
  callback.clearRunMetadata();
  console.log('All metadata cleared');
  
  console.log('Run metadata management test completed!');
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Klira LangChain.js Adapter Tests');
  console.log('='.repeat(60));
  
  try {
    // Initialize Klira SDK
    console.log('Initializing Klira SDK...');
    await initializeKlira(TEST_CONFIG);
    console.log('✅ Klira SDK initialized');
    
    // Run all tests
    await runTest('Basic Callback Handler Integration', testCallbackHandler);
    await runTest('Chat Model Wrapper', testChatModelWrapper);
    await runTest('Factory Function', testFactoryFunction);
    await runTest('Guardrails Integration', testGuardrailsIntegration);
    await runTest('Streaming Guardrails', testStreamingGuardrails);
    await runTest('Chain and Tool Event Handling', testChainAndToolEvents);
    await runTest('Run Metadata Management', testRunMetadataManagement);
    
    console.log('\n🎉 All tests completed!');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

// Add real integration test with actual LangChain model (optional)
async function testRealIntegration() {
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  Skipping real integration test (no OPENAI_API_KEY)');
    return;
  }
  
  console.log('🔄 Running real integration test with OpenAI...');
  
  try {
    // Create real OpenAI model
    const model = new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 50,
    });
    
    // Wrap with Klira
    const { wrapChatModel } = createKliraLangChain({
      ...TEST_CONFIG,
      modelMetadata: {
        provider: 'openai',
        modelName: 'gpt-3.5-turbo',
      },
    });
    
    const wrappedModel = wrapChatModel(model);
    
    // Test real invocation
    const messages = [
      new SystemMessage('You are a helpful assistant that responds briefly.'),
      new HumanMessage('What is the capital of France?'),
    ];
    
    console.log('Sending real request to OpenAI...');
    const response = await wrappedModel.invoke(messages);
    console.log('Real response:', response.content);
    
    // Test real streaming
    console.log('Testing real streaming...');
    const streamResponse = wrappedModel.stream([
      new HumanMessage('Count from 1 to 5'),
    ]);
    
    console.log('Streamed response: ');
    for await (const chunk of streamResponse) {
      process.stdout.write(chunk.content || '');
    }
    console.log('\n✅ Real integration test completed!');
    
  } catch (error) {
    console.error('❌ Real integration test failed:', error.message);
  }
}

// Export for module usage
export {
  runAllTests,
  testRealIntegration,
  TEST_CONFIG,
};

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then(() => testRealIntegration())
    .catch(console.error);
}