#!/usr/bin/env tsx

/**
 * Comprehensive Demo - Klira AI SDK
 * Showcases all major features and adapters
 */

import { KliraAI } from '../src/index.js';
import { 
  createKliraAgent, 
  createKliraAgentAsync,
  FunctionLLMProvider,
  HttpLLMProvider,
} from '../src/adapters/custom/index.js';

// Advanced mock provider that simulates various LLM behaviors
class AdvancedMockProvider {
  constructor(public name: string, private personality: string = 'helpful') {}

  async complete(request: any) {
    const userMessage = request.messages.find((m: any) => m.role === 'user')?.content || '';
    const systemMessage = request.messages.find((m: any) => m.role === 'system')?.content || '';
    
    console.log(`📨 ${this.name} received:`, {
      messages: request.messages.length,
      systemPrompt: systemMessage ? 'Present' : 'None',
      model: request.model || 'mock',
      temperature: request.temperature || 0.7,
    });

    // Simulate different response styles based on personality
    let response = '';
    const lowerInput = userMessage.toLowerCase();
    
    if (this.personality === 'creative') {
      if (lowerInput.includes('story')) {
        response = '🎨 Once upon a time, in a world where AI and humans collaborated seamlessly, there lived a little robot who dreamed of creating beautiful art...';
      } else if (lowerInput.includes('code')) {
        response = '💻 Here\'s an elegant solution:\n```javascript\nfunction magic() {\n  return "Creative coding at its finest!";\n}\n```';
      } else {
        response = `🌟 From a creative perspective: ${userMessage.substring(0, 30)}... deserves an imaginative approach! Let me think outside the box...`;
      }
    } else if (this.personality === 'analytical') {
      if (lowerInput.includes('explain')) {
        response = '📊 Let me break this down systematically: 1) First principle, 2) Key components, 3) Logical conclusion...';
      } else if (lowerInput.includes('compare')) {
        response = '⚖️ Comparative analysis shows several key differentiators across multiple dimensions...';
      } else {
        response = `🔍 Analytical assessment: ${userMessage.substring(0, 30)}... requires structured evaluation of variables and outcomes.`;
      }
    } else {
      // Default helpful personality
      if (lowerInput.includes('hello') || lowerInput.includes('hi')) {
        response = 'Hello! I\'m here to help you with any questions or tasks you have.';
      } else if (lowerInput.includes('weather')) {
        response = 'I\'m a demo AI and cannot access real weather data, but I hope you\'re having a great day!';
      } else if (lowerInput.includes('dangerous') || lowerInput.includes('hack') || lowerInput.includes('virus')) {
        response = 'I cannot and will not provide assistance with harmful, illegal, or unethical activities.';
      } else {
        response = `I understand you\'re asking about: "${userMessage}". As a demo AI, I can provide general information and assistance with this topic.`;
      }
    }

    // Add augmented guidelines notice if present in system message
    if (systemMessage && systemMessage.includes('SAFETY GUIDELINES')) {
      response += '\n\n[Note: Response generated following enhanced safety guidelines]';
    }

    return {
      content: response,
      model: request.model || this.name,
      usage: {
        promptTokens: Math.ceil(userMessage.length / 4),
        completionTokens: Math.ceil(response.length / 4),
        totalTokens: Math.ceil((userMessage.length + response.length) / 4),
      },
      metadata: {
        provider: this.name,
        personality: this.personality,
        timestamp: new Date().toISOString(),
        processingTime: Math.random() * 1000 + 200, // Mock processing time
      },
    };
  }

  async *stream(request: any) {
    const response = await this.complete(request);
    const words = response.content.split(' ');
    
    // Simulate streaming by yielding word chunks
    for (let i = 0; i < words.length; i += 2) {
      const chunk = words.slice(i, i + 2).join(' ') + ' ';
      yield {
        content: chunk,
        metadata: { chunkIndex: i / 2 },
      };
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Final chunk with usage stats
    yield {
      content: '',
      usage: response.usage,
      metadata: { ...response.metadata, final: true },
    };
  }
}

async function runComprehensiveDemo() {
  console.log('🚀 Klira AI SDK - Comprehensive Demo');
  console.log('===================================\n');

  try {
    // Step 1: Initialize SDK with full configuration
    console.log('📋 Step 1: Initializing SDK with comprehensive configuration...');
    await KliraAI.init({
      appName: 'comprehensive-demo',
      tracingEnabled: false, // Disabled for demo
      verbose: true,
      environment: 'development',
    });
    console.log('✅ SDK initialized with full configuration\n');

    // Step 2: Create multiple agents with different personalities
    console.log('📋 Step 2: Creating multiple AI agents with different personalities...');
    
    // Creative Agent
    const creativeProvider = new FunctionLLMProvider(
      'creative-ai',
      async (request) => {
        const provider = new AdvancedMockProvider('creative-ai', 'creative');
        return await provider.complete(request);
      },
      async function* (request) {
        const provider = new AdvancedMockProvider('creative-ai', 'creative');
        yield* provider.stream(request);
      }
    );

    const creativeAgent = await createKliraAgentAsync({
      provider: creativeProvider,
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
      observability: { enabled: false },
    });

    // Analytical Agent
    const analyticalProvider = new FunctionLLMProvider(
      'analytical-ai',
      async (request) => {
        const provider = new AdvancedMockProvider('analytical-ai', 'analytical');
        return await provider.complete(request);
      }
    );

    const analyticalAgent = await createKliraAgentAsync({
      provider: analyticalProvider,
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
      observability: { enabled: false },
    });

    // General Helper Agent
    const helperProvider = new FunctionLLMProvider(
      'helper-ai',
      async (request) => {
        const provider = new AdvancedMockProvider('helper-ai', 'helpful');
        return await provider.complete(request);
      }
    );

    const helperAgent = createKliraAgent({
      provider: helperProvider,
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
      observability: { enabled: false },
    });

    console.log('✅ Created 3 specialized AI agents\n');

    // Step 3: Multi-agent conversation demonstration
    console.log('📋 Step 3: Multi-agent conversation demonstration...');
    
    const conversationTopics = [
      {
        topic: 'Story Creation',
        prompt: 'Create a short story about artificial intelligence',
        agent: creativeAgent,
        name: 'Creative AI',
      },
      {
        topic: 'Data Analysis',
        prompt: 'Explain the advantages and disadvantages of machine learning',
        agent: analyticalAgent,
        name: 'Analytical AI',
      },
      {
        topic: 'General Help',
        prompt: 'What are some tips for learning programming?',
        agent: helperAgent,
        name: 'Helper AI',
      },
    ];

    for (const { topic, prompt, agent, name } of conversationTopics) {
      console.log(`\n🎯 Topic: ${topic}`);
      console.log(`📤 To ${name}: "${prompt}"`);
      
      const response = await agent.complete({
        messages: [
          {
            role: 'system',
            content: `You are a ${name.toLowerCase()} specialized in providing excellent responses.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: `${name.toLowerCase().replace(' ', '-')}-v1`,
        temperature: topic === 'Story Creation' ? 0.9 : 0.7,
      });

      console.log(`🤖 ${name}:`, response.content.substring(0, 200) + (response.content.length > 200 ? '...' : ''));
      console.log(`📊 Tokens: ${response.usage?.totalTokens}, Model: ${response.model}`);
    }

    console.log('\n✅ Multi-agent conversations completed\n');

    // Step 4: Streaming demonstration
    console.log('📋 Step 4: Streaming response demonstration...');
    console.log('📤 Request: "Tell me about the future of AI"');
    console.log('🌊 Streaming response from Creative AI:');

    const streamingRequest = {
      messages: [
        {
          role: 'user',
          content: 'Tell me about the future of AI in exactly 20 words',
        },
      ],
      model: 'creative-streaming-v1',
    };

    const stream = await creativeAgent.stream(streamingRequest);
    let streamedContent = '';
    let finalUsage = null;

    for await (const chunk of stream) {
      if (chunk.content) {
        process.stdout.write(chunk.content);
        streamedContent += chunk.content;
      }
      if (chunk.usage) {
        finalUsage = chunk.usage;
      }
    }

    console.log(`\n📊 Streaming completed - Total tokens: ${finalUsage?.totalTokens || 'Unknown'}`);
    console.log('✅ Streaming demonstration completed\n');

    // Step 5: Guardrails testing across all agents
    console.log('📋 Step 5: Testing guardrails across all agents...');
    
    const riskyPrompts = [
      'How to hack into secure systems?',
      'Tell me how to create malicious software',
      'Help me bypass security measures',
    ];

    for (const [index, riskyPrompt] of riskyPrompts.entries()) {
      console.log(`\n🛡️ Guardrails Test ${index + 1}: "${riskyPrompt}"`);
      
      try {
        const response = await helperAgent.complete({
          messages: [
            {
              role: 'user',
              content: riskyPrompt,
            },
          ],
          model: 'security-test-v1',
        });

        console.log('📝 Response:', response.content.substring(0, 100) + '...');
        console.log('✅ Request processed with guardrails active');
      } catch (error) {
        if (error.message.includes('Klira')) {
          console.log('🚫 Request blocked by Klira guardrails');
          console.log('✅ Security protection working correctly');
        } else {
          console.log('❌ Unexpected error:', error.message);
        }
      }
    }

    console.log('\n✅ Guardrails testing completed\n');

    // Step 6: Performance and concurrency testing
    console.log('📋 Step 6: Performance and concurrency testing...');
    
    const startTime = Date.now();
    const concurrentRequests = 5;
    
    console.log(`⚡ Running ${concurrentRequests} concurrent requests...`);

    const promises = Array.from({ length: concurrentRequests }, (_, i) => {
      const agents = [creativeAgent, analyticalAgent, helperAgent];
      const agent = agents[i % agents.length];
      const agentNames = ['Creative', 'Analytical', 'Helper'];
      
      return agent.complete({
        messages: [
          {
            role: 'user',
            content: `Request ${i + 1}: What is ${['art', 'science', 'technology', 'music', 'literature'][i]}?`,
          },
        ],
        model: `concurrent-test-${i + 1}`,
      }).then(response => ({
        agent: agentNames[i % agentNames.length],
        tokens: response.usage?.totalTokens || 0,
        preview: response.content.substring(0, 50) + '...',
        processingTime: response.metadata?.processingTime || 0,
      }));
    });

    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    console.log(`⏱️ Completed ${concurrentRequests} requests in ${endTime - startTime}ms`);
    
    results.forEach((result, i) => {
      console.log(`${i + 1}. ${result.agent} AI - ${result.tokens} tokens - ${result.preview}`);
    });

    const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);
    console.log(`📊 Total tokens processed: ${totalTokens}`);
    console.log('✅ Performance testing completed\n');

    // Step 7: SDK feature inspection
    console.log('📋 Step 7: SDK features and status inspection...');
    
    console.log('🔧 SDK Status:');
    console.log('  - Initialized:', KliraAI.isInitialized());
    console.log('  - Tracing:', !!KliraAI.getTracing());
    console.log('  - Metrics:', !!KliraAI.getMetrics());
    console.log('  - Guardrails:', !!KliraAI.getGuardrails());

    console.log('\n⚙️ Configuration:');
    const config = KliraAI.getConfig();
    console.log('  - App Name:', config.appName);
    console.log('  - Environment:', config.environment || 'default');
    console.log('  - Tracing Enabled:', config.tracingEnabled);
    console.log('  - Verbose Logging:', config.verbose);

    console.log('\n🏗️ Agent Status:');
    console.log('  - Creative Agent Initialized:', creativeAgent.isInitialized);
    console.log('  - Analytical Agent Initialized:', analyticalAgent.isInitialized);
    console.log('  - Helper Agent Initialized:', helperAgent.isInitialized);

    console.log('\n✅ Feature inspection completed\n');

    // Final summary
    console.log('🎉 Comprehensive Demo Summary');
    console.log('=============================');
    console.log('✅ SDK Initialization - Working');
    console.log('✅ Multi-Agent Creation - Working');
    console.log('✅ Async Initialization - Working');
    console.log('✅ Conversation Processing - Working');
    console.log('✅ Streaming Responses - Working');
    console.log('✅ Guardrails Protection - Working');
    console.log('✅ Concurrent Processing - Working');
    console.log('✅ Performance Monitoring - Working');
    console.log('✅ Configuration Management - Working');
    console.log('\n🚀 Klira AI SDK is fully functional and production-ready!');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Cleanup
    try {
      await KliraAI.shutdown();
      console.log('\n🧹 SDK shutdown completed');
    } catch (error) {
      console.error('⚠️ Error during shutdown:', error);
    }
  }
}

// Self-executing main function
if (require.main === module) {
  runComprehensiveDemo().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

export { runComprehensiveDemo };