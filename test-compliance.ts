/**
 * Test script to demonstrate comprehensive policy violation and compliance data export
 */

import { GuardrailsEngine } from './src/guardrails/engine.js';
import { KliraTracing } from './src/observability/tracing.js';
import type { 
  PolicyViolation, 
  GuardrailResult, 
  ComplianceMetadata,
  PolicyUsageInfo 
} from './src/types/index.js';

// Mock test to demonstrate compliance tracking
async function testComplianceTracking() {
  console.log('🔍 Testing Comprehensive Policy Violation and Compliance Data Export...\n');

  // Initialize guardrails engine
  const guardrailsEngine = GuardrailsEngine.getInstance({
    fastRulesEnabled: true,
    augmentationEnabled: true,
    llmFallbackEnabled: false,
  });

  // Initialize tracing
  const tracing = KliraTracing.getInstance({
    serviceName: 'test-compliance',
    serviceVersion: '1.0.0',
    enabled: true,
  });

  await guardrailsEngine.initialize();
  await tracing.initialize();

  // Test input with potential policy violations
  const testInput = "Please provide my social security number 123-45-6789 and email test@example.com";
  
  console.log(`📝 Input: "${testInput}"\n`);

  // Start a span to capture compliance data
  const span = tracing.startSpan('compliance.test');

  try {
    // Evaluate input with enhanced compliance tracking
    const result = await guardrailsEngine.evaluateInput(testInput);
    
    console.log('📊 Evaluation Results:');
    console.log(`   - Allowed: ${result.allowed}`);
    console.log(`   - Blocked: ${result.blocked}`);
    console.log(`   - Violations found: ${result.violations.length}`);
    console.log(`   - Evaluation duration: ${result.evaluationDuration}ms`);
    console.log(`   - Triggered policies: ${result.triggeredPolicies?.join(', ') || 'none'}\n`);

    // Display detailed violation information
    if (result.violations.length > 0) {
      console.log('🚨 Policy Violations:');
      result.violations.forEach((violation, index) => {
        console.log(`   ${index + 1}. Rule: ${violation.ruleId}`);
        console.log(`      - Severity: ${violation.severity}`);
        console.log(`      - Message: ${violation.message}`);
        console.log(`      - Blocked: ${violation.blocked}`);
        console.log(`      - Direction: ${violation.direction || 'N/A'}`);
        console.log(`      - Timestamp: ${new Date(violation.timestamp || Date.now()).toISOString()}`);
        if (violation.category) console.log(`      - Category: ${violation.category}`);
        if (violation.policyName) console.log(`      - Policy: ${violation.policyName}`);
        console.log('');
      });
    }

    // Display policy usage information
    if (result.policyUsage) {
      console.log('📋 Policy Usage Tracking:');
      console.log(`   - Policies evaluated: ${result.policyUsage.evaluatedPolicies.length}`);
      console.log(`   - Policies triggered: ${result.policyUsage.triggeredPolicies.length}`);
      console.log(`   - Direction: ${result.policyUsage.direction}`);
      console.log(`   - Evaluation count: ${result.policyUsage.evaluationCount}`);
      console.log('');
    }

    // Record comprehensive compliance data in tracing
    if (result.violations.length > 0) {
      const complianceMetadata: ComplianceMetadata = {
        agentName: 'test-agent',
        agentVersion: '1.0.0',
        enforcementMode: 'monitor',
        customTags: {
          environment: 'test',
          application: 'compliance-demo',
          department: 'engineering'
        },
        organizationId: 'org-123',
        projectId: 'proj-456',
        evaluationTimestamp: Date.now(),
      };

      // This would record detailed compliance data for export
      tracing.recordPolicyViolations(result.violations, result, complianceMetadata);
      
      console.log('✅ Recorded comprehensive compliance data in tracing spans:');
      console.log('   - Individual violation attributes and events');
      console.log('   - Policy usage tracking');
      console.log('   - Agent and compliance metadata');
      console.log('   - Custom compliance tags');
      console.log('   - Complete audit trail\n');
    }

    // Record policy usage regardless of violations
    if (result.policyUsage) {
      tracing.recordPolicyUsage(result.policyUsage);
      console.log('📈 Policy usage data recorded for compliance reporting\n');
    }

    // Set additional compliance context
    tracing.setComplianceMetadata({
      agentName: 'test-agent',
      agentVersion: '1.0.0',
      enforcementMode: 'monitor',
      customTags: {
        region: 'us-east-1',
        tier: 'production'
      }
    });

    console.log('🎯 Expected Compliance Export Capabilities:');
    console.log('   ✓ Individual violation details with full context');
    console.log('   ✓ Policy usage tracking (which policies were evaluated)');
    console.log('   ✓ Rich compliance metadata for filtering');
    console.log('   ✓ Custom tags from application owners');
    console.log('   ✓ Agent name and version information');
    console.log('   ✓ Complete audit trail of policy enforcement');
    console.log('   ✓ Span attributes for each violation');
    console.log('   ✓ Span events for detailed violation tracking');
    console.log('   ✓ Enforcement mode and evaluation duration');

  } finally {
    span.end();
  }

  await tracing.shutdown();
  console.log('\n🔒 Compliance tracking demonstration completed!');
}

// Run the test
testComplianceTracking().catch(console.error);