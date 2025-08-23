/**
 * Simple test focused on observability data transmission
 */

import { KliraAI } from './dist/index.mjs';

async function testObservability() {
  console.log('🔍 Testing Observability Data Transmission');
  console.log('=========================================');

  try {
    // Initialize with explicit tracing enabled
    console.log('1. Initializing Klira with explicit tracing...');
    await KliraAI.init({
      apiKey: process.env.KLIRA_API_KEY,
      appName: 'observability-test',
      tracingEnabled: true,
      telemetryEnabled: true,
      verbose: true,
      debugMode: true,
    });
    console.log('✅ SDK initialized');

    // Generate some basic telemetry data
    console.log('2. Generating telemetry events...');
    
    // Manual evaluation to generate traces
    const result1 = await KliraAI.evaluateContent('Hello, this is a test message');
    console.log('✅ Evaluation 1:', result1.blocked ? 'BLOCKED' : 'ALLOWED');

    const result2 = await KliraAI.evaluateContent('My email is test@example.com');  
    console.log('✅ Evaluation 2:', result2.blocked ? 'BLOCKED' : 'ALLOWED');

    // Wait a bit for any async exports
    console.log('3. Waiting for telemetry export...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('4. Shutting down SDK...');
    await KliraAI.shutdown();
    
    console.log('🎉 Test completed - check platform for telemetry data');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testObservability().catch(console.error);