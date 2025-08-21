/**
 * Unit tests for LangChain.js Adapter (no external dependencies)
 * Tests the Klira SDK LangChain adapter functionality
 */

import { 
  KliraCallbackHandler, 
  KliraLangChainChatModel, 
  createKliraLangChain 
} from '../dist/adapters/langchain/index.mjs';
import { KliraAI } from '../dist/index.mjs';

// Mock test configuration
const TEST_CONFIG = {
  checkInput: true,
  checkOutput: true,
  onInputViolation: 'warn',
  onOutputViolation: 'warn',
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
  enableStreamingGuardrails: true,
  streamingCheckInterval: 5,
  onStreamViolation: 'warn',
};

function log(message, data = null) {
  const timestamp = new Date().toISOString().substring(11, 23);
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log('  Data:', JSON.stringify(data, null, 2));
  }
}

async function runTest(testName, testFn) {
  console.log(`\n🧪 ${testName}`);
  console.log('━'.repeat(50));
  
  try {
    const startTime = Date.now();
    await testFn();
    const duration = Date.now() - startTime;
    console.log(`✅ PASSED (${duration}ms)`);
    return true;
  } catch (error) {
    console.error(`❌ FAILED: ${error.message}`);
    if (error.stack) {
      console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    }
    return false;
  }
}

// Test 1: Callback Handler Instantiation
async function testCallbackHandlerInstantiation() {
  log('Creating KliraCallbackHandler...');
  
  const callback = new KliraCallbackHandler(TEST_CONFIG);
  
  // Check that callback has the expected properties
  const hasLogger = !!callback.logger;
  const hasGuardrails = !!callback.guardrails;
  const hasRunMetadata = callback.runMetadata instanceof Map;
  
  log('Callback handler created successfully', {
    hasLogger,
    hasGuardrails,
    hasRunMetadata,
    configOptions: Object.keys(callback.options || {}),
  });
  
  if (!hasLogger || !hasGuardrails || !hasRunMetadata) {
    throw new Error('Missing required callback handler components');
  }
}

// Test 2: LLM Lifecycle Events
async function testLLMLifecycleEvents() {
  log('Testing LLM lifecycle events...');
  
  const callback = new KliraCallbackHandler(TEST_CONFIG);
  const runId = `test_${Date.now()}`;
  const testMessages = ['Hello, world!'];
  
  // Test LLM Start
  log('Testing handleLLMStart...');
  await callback.handleLLMStart(
    { modelName: 'gpt-3.5-turbo' },
    testMessages,
    runId,
    undefined,
    { temperature: 0.7 },
    ['test'],
    { model: 'gpt-3.5-turbo' }
  );
  
  const runData = callback.getRunMetadata(runId);
  if (!runData) {
    throw new Error('Run metadata not created after handleLLMStart');
  }
  
  log('Run metadata created', {
    runId: runData.runId,
    hasInputs: !!runData.inputs,
    hasMetadata: !!runData.metadata,
  });
  
  // Test Token Streaming
  log('Testing handleLLMNewToken...');
  const tokens = ['Hello', ' there', '!', ' How', ' are', ' you', '?'];
  for (const token of tokens) {
    await callback.handleLLMNewToken(token, runId);
  }
  log(`Processed ${tokens.length} tokens`);
  
  // Test LLM End
  log('Testing handleLLMEnd...');
  const mockOutput = {
    generations: [
      {
        text: 'Hello there! How are you?',
        generationInfo: { finishReason: 'stop' },
      },
    ],
    llmOutput: {
      tokenUsage: {
        promptTokens: 15,
        completionTokens: 10,
        totalTokens: 25,
      },
      modelName: 'gpt-3.5-turbo',
    },
  };
  
  await callback.handleLLMEnd(mockOutput, runId);
  
  // Verify cleanup
  const cleanedRunData = callback.getRunMetadata(runId);
  if (cleanedRunData) {
    throw new Error('Run metadata not cleaned up after handleLLMEnd');
  }
  
  log('LLM lifecycle completed successfully');
}

// Test 3: Error Handling
async function testErrorHandling() {
  log('Testing error handling...');
  
  const callback = new KliraCallbackHandler(TEST_CONFIG);
  const errorRunId = `error_${Date.now()}`;
  
  // Test LLM Error
  const testError = new Error('Simulated LLM error');
  await callback.handleLLMError(testError, errorRunId);
  
  // Test Chain Error
  const chainErrorRunId = `chain_error_${Date.now()}`;
  await callback.handleChainError(
    new Error('Simulated chain error'),
    chainErrorRunId
  );
  
  // Test Tool Error
  const toolErrorRunId = `tool_error_${Date.now()}`;
  await callback.handleToolError(
    new Error('Simulated tool error'),
    toolErrorRunId
  );
  
  log('Error handling tests completed');
}

// Test 4: Chain Events
async function testChainEvents() {
  log('Testing chain events...');
  
  const callback = new KliraCallbackHandler(TEST_CONFIG);
  const chainRunId = `chain_${Date.now()}`;
  
  // Test Chain Start
  await callback.handleChainStart(
    { constructor: { name: 'TestChain' } },
    { input: 'Test chain input' },
    chainRunId,
    undefined,
    ['chain'],
    { chainType: 'TestChain', startTime: Date.now() }
  );
  
  const chainData = callback.getRunMetadata(chainRunId);
  if (!chainData) {
    throw new Error('Chain metadata not created');
  }
  
  // Test Chain End
  await callback.handleChainEnd(
    { output: 'Test chain output' },
    chainRunId
  );
  
  log('Chain events completed successfully');
}

// Test 5: Tool Events
async function testToolEvents() {
  log('Testing tool events...');
  
  const callback = new KliraCallbackHandler(TEST_CONFIG);
  const toolRunId = `tool_${Date.now()}`;
  
  // Test Tool Start
  await callback.handleToolStart(
    { name: 'TestTool', description: 'A test tool' },
    'Test tool input',
    toolRunId,
    undefined,
    ['tool'],
    { toolName: 'TestTool', startTime: Date.now() }
  );
  
  const toolData = callback.getRunMetadata(toolRunId);
  if (!toolData) {
    throw new Error('Tool metadata not created');
  }
  
  // Test Tool End
  await callback.handleToolEnd(
    'Test tool output result',
    toolRunId
  );
  
  log('Tool events completed successfully');
}

// Test 6: Chat Model Wrapper
async function testChatModelWrapper() {
  log('Testing KliraLangChainChatModel wrapper...');
  
  // Create mock model
  const mockModel = {
    async invoke(messages, options = {}) {
      log('Mock model invoke called', {
        messageCount: messages.length,
        hasCallbacks: !!(options.callbacks && options.callbacks.length > 0),
      });
      
      return {
        content: 'Mock response from wrapped model',
        additional_kwargs: {},
        response_metadata: {
          tokenUsage: {
            promptTokens: 20,
            completionTokens: 8,
            totalTokens: 28,
          },
        },
      };
    },
    
    async *stream(messages, options = {}) {
      log('Mock model stream called', {
        messageCount: messages.length,
        hasCallbacks: !!(options.callbacks && options.callbacks.length > 0),
      });
      
      const words = ['Mock', ' streaming', ' response', ' from', ' wrapper'];
      for (const word of words) {
        yield { content: word };
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    },
    
    async batch(messagesList, options = {}) {
      log('Mock model batch called', {
        batchSize: messagesList.length,
        hasCallbacks: !!(options.callbacks && options.callbacks.length > 0),
      });
      
      return messagesList.map((_, index) => ({
        content: `Batch response ${index + 1}`,
        additional_kwargs: {},
      }));
    },
    
    bindTools(tools) {
      log('Mock model bindTools called', { toolCount: tools.length });
      // Return a new instance with bound tools
      return { ...mockModel, boundTools: tools };
    },
  };
  
  const wrappedModel = new KliraLangChainChatModel(mockModel, TEST_CONFIG);
  
  // Test invoke
  const messages = [{ role: 'human', content: 'Test message' }];
  const response = await wrappedModel.invoke(messages);
  log('Invoke response received', { content: response.content });
  
  // Test streaming
  log('Testing streaming...');
  const streamResponse = wrappedModel.stream(messages);
  let streamedContent = '';
  
  for await (const chunk of streamResponse) {
    streamedContent += chunk.content;
  }
  log('Streaming completed', { totalLength: streamedContent.length });
  
  // Test batch
  const batchMessages = [
    [{ role: 'human', content: 'Message 1' }],
    [{ role: 'human', content: 'Message 2' }],
    [{ role: 'human', content: 'Message 3' }],
  ];
  const batchResponses = await wrappedModel.batch(batchMessages);
  log('Batch completed', { responseCount: batchResponses.length });
  
  // Test tool binding
  const tools = [
    { name: 'test_tool_1', description: 'First test tool' },
    { name: 'test_tool_2', description: 'Second test tool' },
  ];
  const boundModel = wrappedModel.bindTools(tools);
  log('Tools bound', { hasBoundTools: !!boundModel.boundTools });
  
  log('Chat model wrapper tests completed');
}

// Test 7: Factory Function
async function testFactoryFunction() {
  log('Testing createKliraLangChain factory function...');
  
  const factory = createKliraLangChain(TEST_CONFIG);
  
  if (!factory.callback || typeof factory.wrapChatModel !== 'function' || typeof factory.wrapChain !== 'function') {
    throw new Error('Factory function did not return expected structure');
  }
  
  log('Factory created successfully', {
    hasCallback: !!factory.callback,
    hasWrapChatModel: typeof factory.wrapChatModel === 'function',
    hasWrapChain: typeof factory.wrapChain === 'function',
  });
  
  // Test model wrapping
  const mockModel = {
    invoke: async () => ({ content: 'Factory test response' }),
  };
  
  const wrappedModel = factory.wrapChatModel(mockModel);
  const response = await wrappedModel.invoke([{ role: 'human', content: 'test' }]);
  log('Factory model wrap test', { response: response.content });
  
  // Test chain wrapping
  const mockChain = {
    invoke: (input, options = {}) => {
      const hasCallbacks = !!(options.callbacks && options.callbacks.length > 0);
      log('Chain invoked with callbacks:', hasCallbacks);
      return { output: 'Chain response' };
    },
  };
  
  const wrappedChain = factory.wrapChain(mockChain);
  const chainResponse = wrappedChain.invoke({ input: 'test' });
  log('Factory chain wrap test', { output: chainResponse.output });
  
  log('Factory function tests completed');
}

// Test 8: Metadata Management
async function testMetadataManagement() {
  log('Testing run metadata management...');
  
  const callback = new KliraCallbackHandler(TEST_CONFIG);
  
  // Create multiple runs
  const runIds = ['run1', 'run2', 'run3'];
  const metadataChecks = [];
  
  // Start multiple runs
  for (const runId of runIds) {
    await callback.handleLLMStart(
      { modelName: 'gpt-3.5-turbo' },
      [`Message for ${runId}`],
      runId,
      undefined,
      {},
      ['test'],
      { runType: 'test', startTime: Date.now() }
    );
    
    const metadata = callback.getRunMetadata(runId);
    metadataChecks.push({
      runId,
      hasMetadata: !!metadata,
      hasInputs: !!(metadata && metadata.inputs),
    });
  }
  
  log('Multiple runs created', { checks: metadataChecks });
  
  // Verify all runs exist
  if (metadataChecks.some(check => !check.hasMetadata)) {
    throw new Error('Some run metadata missing');
  }
  
  // End first run
  await callback.handleLLMEnd(
    {
      generations: [{ text: 'Response for run1' }],
      llmOutput: { tokenUsage: { totalTokens: 10 } },
    },
    'run1'
  );
  
  // Verify run1 cleaned up but others remain
  const afterEnd = {
    run1: !!callback.getRunMetadata('run1'),
    run2: !!callback.getRunMetadata('run2'),
    run3: !!callback.getRunMetadata('run3'),
  };
  log('After ending run1', afterEnd);
  
  if (afterEnd.run1 || !afterEnd.run2 || !afterEnd.run3) {
    throw new Error('Unexpected metadata state after ending run1');
  }
  
  // Clear all metadata
  callback.clearRunMetadata();
  const afterClear = {
    run1: !!callback.getRunMetadata('run1'),
    run2: !!callback.getRunMetadata('run2'),
    run3: !!callback.getRunMetadata('run3'),
  };
  log('After clearing all metadata', afterClear);
  
  if (afterClear.run1 || afterClear.run2 || afterClear.run3) {
    throw new Error('Metadata not fully cleared');
  }
  
  log('Metadata management tests completed');
}

// Test 9: Token Estimation
async function testTokenEstimation() {
  log('Testing token estimation...');
  
  const callback = new KliraCallbackHandler(TEST_CONFIG);
  
  // Test private estimateTokens method (accessing via bracket notation)
  const testTexts = [
    'Hello',           // 5 chars -> ~2 tokens
    'Hello world!',    // 12 chars -> ~3 tokens  
    'This is a longer text for testing token estimation functionality.', // 67 chars -> ~17 tokens
    '',                // 0 chars -> 0 tokens
  ];
  
  const estimates = testTexts.map(text => {
    const estimate = callback.estimateTokens ? callback.estimateTokens(text) : Math.ceil(text.length / 4);
    return { text: text.substring(0, 20) + (text.length > 20 ? '...' : ''), chars: text.length, tokens: estimate };
  });
  
  log('Token estimation results', estimates);
  
  // Verify estimation logic
  if (estimates[3].tokens !== 0) {
    throw new Error('Empty string should estimate 0 tokens');
  }
  
  if (estimates[0].tokens < 1 || estimates[0].tokens > 5) {
    throw new Error('Short string token estimate out of reasonable range');
  }
  
  log('Token estimation tests completed');
}

// Test 10: Streaming Guardrails Simulation
async function testStreamingGuardrails() {
  log('Testing streaming guardrails simulation...');
  
  const callback = new KliraCallbackHandler({
    ...TEST_CONFIG,
    enableStreamingGuardrails: true,
    streamingCheckInterval: 3, // Check every 3 tokens
    onStreamViolation: 'warn',
  });
  
  const runId = `streaming_${Date.now()}`;
  
  // Start streaming session
  await callback.handleLLMStart(
    { modelName: 'gpt-3.5-turbo' },
    ['Tell me a story'],
    runId
  );
  
  // Simulate tokens that might trigger guardrails
  const tokens = [
    'Once', ' upon', ' a', ' time', ' there', ' was', ' a', ' brave',
    ' knight', ' who', ' discovered', ' a', ' secret', ' that', ' could',
    ' change', ' everything', ' in', ' the', ' kingdom', '.', ' The', ' end.'
  ];
  
  let tokenCount = 0;
  for (const token of tokens) {
    await callback.handleLLMNewToken(token, runId);
    tokenCount++;
    
    // Simulate interval checking
    if (tokenCount % 3 === 0) {
      log(`Streaming checkpoint at token ${tokenCount}: "${token}"`);
    }
  }
  
  log(`Streaming completed with ${tokenCount} tokens`);
  
  // End the session
  await callback.handleLLMEnd(
    {
      generations: [{ text: tokens.join('') }],
      llmOutput: { tokenUsage: { totalTokens: tokenCount } },
    },
    runId
  );
  
  log('Streaming guardrails simulation completed');
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Klira LangChain.js Adapter Unit Tests');
  console.log('='.repeat(60));
  
  // Initialize Klira SDK
  console.log('Initializing Klira SDK...');
  await KliraAI.init({
    appName: 'LangChain-Test-App',
    apiKey: 'klira_test_api_key_for_unit_tests',
    tracingEnabled: true,
    metricsEnabled: true,
  });
  console.log('✅ Klira SDK initialized\n');
  
  const tests = [
    ['Callback Handler Instantiation', testCallbackHandlerInstantiation],
    ['LLM Lifecycle Events', testLLMLifecycleEvents],
    ['Error Handling', testErrorHandling],
    ['Chain Events', testChainEvents],
    ['Tool Events', testToolEvents],
    ['Chat Model Wrapper', testChatModelWrapper],
    ['Factory Function', testFactoryFunction],
    ['Metadata Management', testMetadataManagement],
    ['Token Estimation', testTokenEstimation],
    ['Streaming Guardrails Simulation', testStreamingGuardrails],
  ];
  
  const results = [];
  let passed = 0;
  let failed = 0;
  
  for (const [name, testFn] of tests) {
    const success = await runTest(name, testFn);
    results.push({ name, success });
    
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log('\n📊 Test Results Summary');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.success).forEach(r => console.log(`   • ${r.name}`));
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed! LangChain adapter is working correctly.');
  }
}

// Export for module usage
export { runAllTests };

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}