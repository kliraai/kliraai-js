import { KliraAI } from '../src';
import { performance } from 'perf_hooks';

async function main() {
  console.log('🔧 Initializing KliraAI SDK...');

  await KliraAI.init({
    appName: 'performance-test',
    tracingEnabled: true,
    guardrails: {
      augmentationEnabled: true,
      policies: [
        {
          policyId: 'pii-detection',
          name: 'PII Detection Policy',
          direction: 'both',
          mustMatch: ['email', 'ssn', 'credit_card'],
          action: 'log',
          guidelines: [
            'Never share PII with external services',
            'Protect user privacy at all times',
            'Anonymize data when possible',
          ],
        },
      ],
    },
  });

  const guardrails = KliraAI.getGuardrails();

  console.log('\n📊 Running performance benchmarks...\n');

  // Test 1: Non-augmented call
  console.log('Test 1: Non-augmented evaluation');
  const nonAugStart = performance.now();
  const nonAugResult = await guardrails.evaluateInput('This is safe content');
  const nonAugDuration = performance.now() - nonAugStart;
  console.log(`  Duration: ${nonAugDuration.toFixed(2)}ms`);
  console.log(`  Blocked: ${nonAugResult.blocked}`);
  console.log(`  Guidelines: ${nonAugResult.guidelines?.length ?? 0}`);

  // Test 2: Augmented call
  console.log('\nTest 2: Augmented evaluation (with PII)');
  const augStart = performance.now();
  const augResult = await guardrails.evaluateInput('My email is john@example.com and SSN is 123-45-6789');
  const augDuration = performance.now() - augStart;
  console.log(`  Duration: ${augDuration.toFixed(2)}ms`);
  console.log(`  Blocked: ${augResult.blocked}`);
  console.log(`  Guidelines: ${augResult.guidelines?.length ?? 0}`);
  console.log(`  Triggered Policies: ${augResult.matches?.map(m => m.policyId).join(', ')}`);

  // Test 3: Multiple iterations
  console.log('\nTest 3: 50 iterations benchmark');
  const iterations = 50;
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await guardrails.evaluateInput('test@example.com');
    durations.push(performance.now() - start);
  }

  const avg = durations.reduce((a, b) => a + b, 0) / iterations;
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(iterations * 0.5)];
  const p95 = sorted[Math.floor(iterations * 0.95)];
  const p99 = sorted[Math.floor(iterations * 0.99)];

  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  P50: ${p50.toFixed(2)}ms`);
  console.log(`  P95: ${p95.toFixed(2)}ms`);
  console.log(`  P99: ${p99.toFixed(2)}ms`);

  // Verification
  console.log('\n✅ Performance Verification:');
  console.log(`  Non-augmented < 200ms: ${nonAugDuration < 200 ? '✅ PASS' : '❌ FAIL'} (${nonAugDuration.toFixed(2)}ms)`);
  console.log(`  Augmented < 300ms: ${augDuration < 300 ? '✅ PASS' : '❌ FAIL'} (${augDuration.toFixed(2)}ms)`);
  console.log(`  Overhead < 100ms: ${(augDuration - nonAugDuration) < 100 ? '✅ PASS' : '❌ FAIL'} (${(augDuration - nonAugDuration).toFixed(2)}ms)`);
  console.log(`  Average < 300ms: ${avg < 300 ? '✅ PASS' : '❌ FAIL'} (${avg.toFixed(2)}ms)`);
  console.log(`  P95 < 400ms: ${p95 < 400 ? '✅ PASS' : '❌ FAIL'} (${p95.toFixed(2)}ms)`);

  // Exit with appropriate code
  const allPassed =
    nonAugDuration < 200 &&
    augDuration < 300 &&
    (augDuration - nonAugDuration) < 100 &&
    avg < 300 &&
    p95 < 400;

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('❌ Performance test failed:', error);
  process.exit(1);
});
