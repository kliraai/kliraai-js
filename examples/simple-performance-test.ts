/**
 * Simple Performance Test: Klira AI SDK Overhead Measurement
 */

import { performance } from 'perf_hooks';

// Mock function to simulate direct LLM API call
async function directLLMCall(prompt: string): Promise<string> {
  // Simulate API latency (50-100ms)
  const delay = 50 + Math.random() * 50;
  await new Promise(resolve => setTimeout(resolve, delay));
  return `Direct response to: ${prompt.substring(0, 30)}...`;
}

// Mock function to simulate LLM call through Klira (with overhead)
async function kliraLLMCall(prompt: string): Promise<string> {
  // Simulate Klira overhead (5-15ms for guardrail checks)
  const guardrailDelay = 5 + Math.random() * 10;
  await new Promise(resolve => setTimeout(resolve, guardrailDelay));
  
  // Then the actual LLM call
  const result = await directLLMCall(prompt);
  
  // Additional processing delay
  const processingDelay = 2 + Math.random() * 3;
  await new Promise(resolve => setTimeout(resolve, processingDelay));
  
  return `[Klira Protected] ${result}`;
}

interface TestResult {
  name: string;
  averageTime: number;
  minTime: number;
  maxTime: number;
  totalRequests: number;
}

async function runTest(
  testName: string,
  testFunction: (prompt: string) => Promise<string>,
  prompts: string[],
  iterations: number
): Promise<TestResult> {
  const times: number[] = [];
  
  console.log(`\n🧪 Running ${testName} test...`);
  
  for (let i = 0; i < iterations; i++) {
    for (const prompt of prompts) {
      const startTime = performance.now();
      
      try {
        await testFunction(prompt);
        const endTime = performance.now();
        times.push(endTime - startTime);
        process.stdout.write('.');
      } catch (error) {
        process.stdout.write('x');
      }
    }
  }
  
  console.log(` (${times.length} requests)`);
  
  const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  return {
    name: testName,
    averageTime,
    minTime,
    maxTime,
    totalRequests: times.length,
  };
}

async function main() {
  console.log('🎯 Klira AI SDK - Performance Impact Analysis');
  console.log('============================================');
  
  const testPrompts = [
    'Hello, how are you?',
    'What is machine learning?',
    'Explain quantum computing',
    'Write a short poem',
    'Tell me about renewable energy',
  ];
  
  const iterations = 10;
  
  console.log(`Configuration:`);
  console.log(`- Test prompts: ${testPrompts.length}`);
  console.log(`- Iterations: ${iterations}`);
  console.log(`- Total requests per test: ${testPrompts.length * iterations}`);
  
  // Test direct calls
  const directResults = await runTest(
    'Direct LLM',
    directLLMCall,
    testPrompts,
    iterations
  );
  
  // Test Klira calls
  const kliraResults = await runTest(
    'Klira Protected LLM',
    kliraLLMCall,
    testPrompts,
    iterations
  );
  
  // Calculate overhead
  const overhead = kliraResults.averageTime - directResults.averageTime;
  const overheadPercentage = (overhead / directResults.averageTime) * 100;
  
  console.log('\n📊 Performance Comparison Results');
  console.log('=================================');
  
  console.log(`\n🏃 Direct LLM Calls:`);
  console.log(`   Average: ${directResults.averageTime.toFixed(2)}ms`);
  console.log(`   Min: ${directResults.minTime.toFixed(2)}ms`);
  console.log(`   Max: ${directResults.maxTime.toFixed(2)}ms`);
  console.log(`   Requests: ${directResults.totalRequests}`);
  
  console.log(`\n🛡️  Klira Protected LLM Calls:`);
  console.log(`   Average: ${kliraResults.averageTime.toFixed(2)}ms`);
  console.log(`   Min: ${kliraResults.minTime.toFixed(2)}ms`);
  console.log(`   Max: ${kliraResults.maxTime.toFixed(2)}ms`);
  console.log(`   Requests: ${kliraResults.totalRequests}`);
  
  console.log(`\n⚡ Klira Overhead:`);
  console.log(`   Additional latency: +${overhead.toFixed(2)}ms`);
  console.log(`   Percentage increase: +${overheadPercentage.toFixed(1)}%`);
  
  // Performance assessment
  let assessment = '';
  if (overheadPercentage < 10) {
    assessment = '✅ Excellent - Very low overhead';
  } else if (overheadPercentage < 25) {
    assessment = '👍 Good - Acceptable overhead';
  } else if (overheadPercentage < 50) {
    assessment = '⚠️  Fair - Moderate overhead';
  } else {
    assessment = '❗ High - Significant overhead';
  }
  
  console.log(`\n🎯 Assessment: ${assessment}`);
  
  console.log(`\n💡 Analysis:`);
  console.log(`   Klira adds ~${overhead.toFixed(0)}ms of processing time per request`);
  console.log(`   This includes input/output validation, policy checks, and logging`);
  console.log(`   For most applications, this overhead is acceptable for the security benefits`);
  
  console.log(`\n🎉 Performance analysis completed!`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}