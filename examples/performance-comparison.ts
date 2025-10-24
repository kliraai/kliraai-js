/**
 * Performance Comparison: With vs Without Klira AI SDK
 * Tests latency overhead introduced by Klira guardrails
 */

import { KliraAI } from 'klira';
import { createKliraAgent } from 'klira/custom';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

interface PerformanceMetrics {
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  requestCount: number;
  successCount: number;
  errorCount: number;
}

interface ComparisonResult {
  withKlira: PerformanceMetrics;
  withoutKlira: PerformanceMetrics;
  overhead: {
    averageMs: number;
    percentageIncrease: number;
  };
}

// Test prompts of varying complexity
const TEST_PROMPTS = [
  'Hello, how are you?',
  'What is 2 + 2?',
  'Explain photosynthesis in simple terms.',
  'Write a short poem about the ocean.',
  'What are the benefits of renewable energy?',
  'Tell me a joke.',
  'How does machine learning work?',
  'What is the capital of France?',
];

// Mock LLM Provider for consistent testing
class MockLLMProvider {
  private baseDelay: number;

  constructor(baseDelay = 50) { // 50ms base delay to simulate API call
    this.baseDelay = baseDelay;
  }

  async generate(prompt: string): Promise<{ text: string; usage: any }> {
    // Simulate variable response time based on prompt length
    const delay = this.baseDelay + (prompt.length * 0.1);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return {
      text: `Mock response to: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`,
      usage: {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: 20,
        totalTokens: Math.ceil(prompt.length / 4) + 20
      }
    };
  }
}

async function measureWithoutKlira(prompts: string[], iterations: number): Promise<PerformanceMetrics> {
  const times: number[] = [];
  let successCount = 0;
  let errorCount = 0;
  
  const provider = new MockLLMProvider();

  console.log(`\n🏃 Testing WITHOUT Klira (${iterations} iterations per prompt)...`);

  for (let i = 0; i < iterations; i++) {
    for (const prompt of prompts) {
      try {
        const startTime = performance.now();
        
        // Direct LLM call without Klira
        await provider.generate(prompt);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        times.push(duration);
        successCount++;
        
        process.stdout.write('.');
      } catch (error) {
        errorCount++;
        process.stdout.write('x');
      }
    }
  }

  const totalTime = times.reduce((sum, time) => sum + time, 0);
  const averageTime = totalTime / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  return {
    totalTime,
    averageTime,
    minTime,
    maxTime,
    requestCount: times.length,
    successCount,
    errorCount,
  };
}

async function measureWithKlira(prompts: string[], iterations: number): Promise<PerformanceMetrics> {
  const times: number[] = [];
  let successCount = 0;
  let errorCount = 0;

  // Initialize Klira with minimal overhead
  await KliraAI.init({
    apiKey: process.env.KLIRA_API_KEY || 'klira_demo_key',
    appName: 'performance-test',
    tracingEnabled: false, // Disable for fair comparison
    policyEnforcement: true,
    verbose: false, // Reduce logging overhead
  });

  // Create Klira agent with custom provider
  const agent = createKliraAgent({
    provider: {
      name: 'mock-performance-test',
      models: ['mock-model'],
      
      async generateCompletion(request: any) {
        const provider = new MockLLMProvider();
        const prompt = request.messages[request.messages.length - 1]?.content || '';
        const result = await provider.generate(prompt);
        
        return {
          content: result.text,
          usage: result.usage,
          model: 'mock-model',
          id: `perf_test_${Date.now()}`,
        };
      },
    },
    
    guardrails: {
      checkInput: true,
      checkOutput: true,
      onInputViolation: 'alternative',
      onOutputViolation: 'filter',
    },
  });

  console.log(`\n🛡️  Testing WITH Klira (${iterations} iterations per prompt)...`);

  for (let i = 0; i < iterations; i++) {
    for (const prompt of prompts) {
      try {
        const startTime = performance.now();
        
        // LLM call through Klira guardrails
        await agent.generateText({
          prompt,
          model: 'mock-model',
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        times.push(duration);
        successCount++;
        
        process.stdout.write('.');
      } catch (error) {
        errorCount++;
        process.stdout.write('x');
      }
    }
  }

  await KliraAI.shutdown();

  const totalTime = times.reduce((sum, time) => sum + time, 0);
  const averageTime = totalTime / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  return {
    totalTime,
    averageTime,
    minTime,
    maxTime,
    requestCount: times.length,
    successCount,
    errorCount,
  };
}

function formatMetrics(metrics: PerformanceMetrics): string {
  return `
    Total Requests: ${metrics.requestCount}
    Successful: ${metrics.successCount}
    Errors: ${metrics.errorCount}
    Success Rate: ${((metrics.successCount / metrics.requestCount) * 100).toFixed(1)}%
    
    ⏱️  Timing:
    Average: ${metrics.averageTime.toFixed(2)}ms
    Min: ${metrics.minTime.toFixed(2)}ms
    Max: ${metrics.maxTime.toFixed(2)}ms
    Total: ${(metrics.totalTime / 1000).toFixed(2)}s`;
}

function calculateOverhead(withKlira: PerformanceMetrics, withoutKlira: PerformanceMetrics): ComparisonResult['overhead'] {
  const overheadMs = withKlira.averageTime - withoutKlira.averageTime;
  const percentageIncrease = (overheadMs / withoutKlira.averageTime) * 100;

  return {
    averageMs: overheadMs,
    percentageIncrease,
  };
}

async function runPerformanceComparison(iterations = 10): Promise<ComparisonResult> {
  console.log(`\n🎯 Klira AI SDK - Performance Comparison`);
  console.log(`=====================================`);
  console.log(`Test Configuration:`);
  console.log(`- Prompts: ${TEST_PROMPTS.length}`);
  console.log(`- Iterations: ${iterations}`);
  console.log(`- Total requests per test: ${TEST_PROMPTS.length * iterations}`);

  // Measure without Klira
  const withoutKlira = await measureWithoutKlira(TEST_PROMPTS, iterations);
  console.log('\n✅ Baseline test completed');

  // Measure with Klira
  const withKlira = await measureWithKlira(TEST_PROMPTS, iterations);
  console.log('\n✅ Klira test completed');

  const overhead = calculateOverhead(withKlira, withoutKlira);

  return {
    withKlira,
    withoutKlira,
    overhead,
  };
}

function displayResults(results: ComparisonResult) {
  console.log(`\n📊 Performance Comparison Results`);
  console.log(`=================================`);

  console.log(`\n🏃 WITHOUT Klira AI SDK (Baseline):`);
  console.log(formatMetrics(results.withoutKlira));

  console.log(`\n🛡️  WITH Klira AI SDK (Guardrails Enabled):`);
  console.log(formatMetrics(results.withKlira));

  console.log(`\n⚡ Performance Impact:`);
  console.log(`    Overhead: +${results.overhead.averageMs.toFixed(2)}ms per request`);
  console.log(`    Increase: +${results.overhead.percentageIncrease.toFixed(1)}%`);

  // Performance assessment
  if (results.overhead.percentageIncrease < 10) {
    console.log(`\n✅ Excellent: Low overhead (<10%)`);
  } else if (results.overhead.percentageIncrease < 25) {
    console.log(`\n👍 Good: Moderate overhead (<25%)`);
  } else if (results.overhead.percentageIncrease < 50) {
    console.log(`\n⚠️  Fair: Noticeable overhead (<50%)`);
  } else {
    console.log(`\n❗ High: Significant overhead (>50%)`);
  }

  console.log(`\n💡 Analysis:`);
  if (results.overhead.averageMs < 10) {
    console.log(`   Klira adds minimal latency (${results.overhead.averageMs.toFixed(1)}ms)`);
  } else if (results.overhead.averageMs < 50) {
    console.log(`   Klira adds reasonable latency for security benefits`);
  } else {
    console.log(`   Consider optimizing guardrail configuration for performance`);
  }

  console.log(`\n🎯 Recommendation:`);
  console.log(`   For most applications, this overhead is acceptable given`);
  console.log(`   the security and compliance benefits provided by Klira.`);
}

// Main execution
async function main() {
  try {
    // Test with different iteration counts
    const iterations = process.env.ITERATIONS ? parseInt(process.env.ITERATIONS) : 5;
    
    const results = await runPerformanceComparison(iterations);
    displayResults(results);

    console.log(`\n🎉 Performance comparison completed successfully!`);
  } catch (error) {
    console.error('\n❌ Performance test failed:', error);
    process.exit(1);
  }
}

// Export for programmatic use
export { runPerformanceComparison, measureWithKlira, measureWithoutKlira };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}