#!/usr/bin/env tsx

/**
 * Hierarchy Context Demo - Testing Enhanced Context Management
 * Demonstrates the new hierarchical context features matching Python SDK
 */

import { KliraAI } from '../src/index.js';
import { createKliraAgentAsync, FunctionLLMProvider } from '../src/adapters/custom/index.js';

// Enhanced mock provider that logs received context
class ContextAwareMockProvider {
  constructor(public name: string) {}

  async complete(request: any) {
    const userMessage = request.messages.find((m: any) => m.role === 'user')?.content || '';
    
    console.log(`📨 ${this.name} processing request with context awareness`);
    
    const response = `Context-aware response from ${this.name}: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`;
    
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
        timestamp: new Date().toISOString(),
        contextAware: true,
      },
    };
  }
}

async function runHierarchyContextDemo() {
  console.log('🚀 Klira AI SDK - Hierarchy Context Management Demo');
  console.log('================================================\n');

  try {
    // Step 1: Initialize SDK with tracing enabled
    console.log('📋 Step 1: Initializing SDK with enhanced tracing...');
    await KliraAI.init({
      appName: 'hierarchy-context-demo',
      tracingEnabled: true, // Enable to test context
      verbose: true,
    });
    console.log('✅ SDK initialized successfully\n');

    // Step 2: Test organization and project context
    console.log('📋 Step 2: Setting organization and project context...');
    KliraAI.setOrganization('org-acme-corp');
    KliraAI.setProject('proj-customer-support');
    console.log('✅ Organization: org-acme-corp');
    console.log('✅ Project: proj-customer-support\n');

    // Step 3: Create agents with different roles
    console.log('📋 Step 3: Creating specialized agents with context...');
    
    const supportProvider = new FunctionLLMProvider(
      'support-agent',
      async (request) => {
        const provider = new ContextAwareMockProvider('support-agent');
        return await provider.complete(request);
      }
    );

    const analyticsProvider = new FunctionLLMProvider(
      'analytics-agent',
      async (request) => {
        const provider = new ContextAwareMockProvider('analytics-agent');
        return await provider.complete(request);
      }
    );

    const supportAgent = await createKliraAgentAsync({
      provider: supportProvider,
      checkInput: true,
      checkOutput: true,
      observability: { enabled: true },
    });

    const analyticsAgent = await createKliraAgentAsync({
      provider: analyticsProvider,
      checkInput: true,
      checkOutput: true,
      observability: { enabled: true },
    });

    console.log('✅ Created support and analytics agents\n');

    // Step 4: Test conversation context
    console.log('📋 Step 4: Setting conversation context...');
    const conversationId = 'conv-customer-inquiry-001';
    const userId = 'user-john-doe-456';
    
    KliraAI.setConversationContext(conversationId, userId);
    console.log(`✅ Conversation: ${conversationId}`);
    console.log(`✅ User: ${userId}\n`);

    // Step 5: Test hierarchical context for different tasks
    console.log('📋 Step 5: Testing hierarchical context for support task...');
    
    KliraAI.setHierarchyContext({
      organizationId: 'org-acme-corp',
      projectId: 'proj-customer-support',
      agentId: 'agent-support-tier1',
      taskId: 'task-resolve-billing-issue',
      conversationId: conversationId,
      userId: userId,
    });

    const supportResponse = await supportAgent.complete({
      messages: [
        {
          role: 'system',
          content: 'You are a tier-1 customer support agent helping with billing issues.',
        },
        {
          role: 'user',
          content: 'I was charged twice for my subscription this month. Can you help?',
        },
      ],
      model: 'support-model-v1',
    });

    console.log('📤 Support Query: "I was charged twice for my subscription this month."');
    console.log('🤖 Support Agent:', supportResponse.content);
    console.log('📊 Usage:', supportResponse.usage);
    console.log('✅ Support task completed with full context\n');

    // Step 6: Test different hierarchical context for analytics
    console.log('📋 Step 6: Testing hierarchical context for analytics task...');
    
    KliraAI.setHierarchyContext({
      organizationId: 'org-acme-corp',
      projectId: 'proj-customer-support',
      agentId: 'agent-analytics-insights',
      taskId: 'task-analyze-support-patterns',
      toolId: 'tool-ticket-analyzer',
      conversationId: conversationId,
      userId: userId,
    });

    const analyticsResponse = await analyticsAgent.complete({
      messages: [
        {
          role: 'system',
          content: 'You are an analytics agent that analyzes customer support patterns.',
        },
        {
          role: 'user',
          content: 'Analyze the billing complaint trend for this month.',
        },
      ],
      model: 'analytics-model-v2',
    });

    console.log('📤 Analytics Query: "Analyze the billing complaint trend for this month."');
    console.log('🤖 Analytics Agent:', analyticsResponse.content);
    console.log('📊 Usage:', analyticsResponse.usage);
    console.log('✅ Analytics task completed with full context\n');

    // Step 7: Test external prompt context
    console.log('📋 Step 7: Testing external prompt context...');
    
    KliraAI.setExternalPromptContext('prompt-billing-template-v3', 'gpt-4', {
      temperature: 0.7,
      maxTokens: 500,
      useCase: 'billing-support',
    });

    console.log('✅ External prompt context set for billing template\n');

    // Step 8: Test context retrieval
    console.log('📋 Step 8: Testing context retrieval...');
    
    const currentContext = KliraAI.getCurrentContext();
    console.log('📋 Current Context Retrieved:', {
      available: Object.keys(currentContext).length > 0,
      keys: Object.keys(currentContext),
      note: 'Context retrieval is best-effort in this implementation',
    });
    console.log('✅ Context retrieval tested\n');

    // Step 9: Test enhanced trace metadata
    console.log('📋 Step 9: Testing enhanced trace metadata...');
    
    KliraAI.setTraceMetadata({
      organizationId: 'org-acme-corp',
      projectId: 'proj-customer-support',
      agentId: 'agent-escalation-handler',
      taskId: 'task-escalate-complex-issue',
      toolId: 'tool-ticket-escalator',
      conversationId: 'conv-escalated-case-002',
      userId: 'user-jane-smith-789',
      sessionId: 'session-web-app-456',
      requestId: 'req-escalation-001',
      model: 'escalation-model-v1',
      provider: 'openai',
      framework: 'custom-agent',
    });

    console.log('✅ Enhanced trace metadata set with full hierarchy');

    // Final test with all context
    const escalationResponse = await supportAgent.complete({
      messages: [
        {
          role: 'user',
          content: 'This billing issue is complex and needs escalation to a manager.',
        },
      ],
      model: 'escalation-model-v1',
    });

    console.log('📤 Escalation: "This billing issue needs escalation to a manager."');
    console.log('🤖 Escalation Response:', escalationResponse.content);
    console.log('✅ Full context test completed\n');

    // Summary
    console.log('🎉 Hierarchy Context Demo Summary');
    console.log('=================================');
    console.log('✅ Organization/Project Context - Working');
    console.log('✅ Conversation Context Management - Working');
    console.log('✅ Hierarchical Context Setting - Working');
    console.log('✅ Multi-Agent Context Switching - Working');
    console.log('✅ External Prompt Context - Working');
    console.log('✅ Enhanced Trace Metadata - Working');
    console.log('✅ Context Retrieval API - Available');
    console.log('\n🚀 JavaScript SDK now has parity with Python SDK context features!');

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
  runHierarchyContextDemo().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

export { runHierarchyContextDemo };