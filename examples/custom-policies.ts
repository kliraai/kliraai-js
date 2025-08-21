/**
 * Custom policies and advanced guardrails example for Klira AI SDK
 */

import { KliraAI } from '@kliraai/sdk';
import { createKliraVercelAI } from '@kliraai/sdk/vercel-ai';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

// Initialize Klira AI SDK
async function initializeKlira() {
  await KliraAI.init({
    apiKey: process.env.KLIRA_API_KEY || 'klira_demo_key',
    appName: 'klira-custom-policies-demo',
    tracingEnabled: true,
    policyEnforcement: true,
    verbose: true,
  });
  
  console.log('✅ Klira AI SDK initialized for custom policies demo');
}

// Example 1: Adding custom fast rules
async function customFastRulesExample() {
  console.log('\n🚀 Example 1: Adding Custom Fast Rules');
  
  const guardrails = KliraAI.getGuardrails();
  const fastRules = guardrails.getFastRules();

  // Add custom company-specific rules
  fastRules.addRule({
    id: 'company-api-keys',
    pattern: /\b(API[_-]?KEY[_-]?\w{8,}|SECRET[_-]?\w{8,})\b/gi,
    action: 'block',
    severity: 'critical',
    description: 'Company API key or secret detected',
    replacement: '[API_KEY_REDACTED]',
  });

  fastRules.addRule({
    id: 'internal-project-names',
    pattern: /\b(project[_-]?(alpha|beta|gamma|delta|omega))\b/gi,
    action: 'warn',
    severity: 'medium',
    description: 'Internal project codename detected',
    replacement: '[PROJECT_NAME_REDACTED]',
  });

  fastRules.addRule({
    id: 'competitor-mentions',
    pattern: /\b(competitor[_-]?corp|rival[_-]?tech|enemy[_-]?inc)\b/gi,
    action: 'warn',
    severity: 'low',
    description: 'Competitor mention detected',
  });

  // Test the custom rules
  const testInputs = [
    'Our API_KEY_ABC123XYZ is confidential',
    'Project Alpha launch is scheduled for next month',
    'Competitor Corp has a similar feature',
    'This is completely safe content about renewable energy',
  ];

  console.log('Testing custom fast rules:');
  for (const input of testInputs) {
    const result = await KliraAI.evaluateContent(input);
    
    console.log(`\nInput: "${input}"`);
    console.log(`Status: ${result.blocked ? '🚫 BLOCKED' : result.violations.length > 0 ? '⚠️ WARNINGS' : '✅ ALLOWED'}`);
    
    if (result.violations.length > 0) {
      result.violations.forEach(v => {
        console.log(`  - ${v.ruleId}: ${v.message} (${v.severity})`);
      });
    }
    
    if (result.transformedContent !== input) {
      console.log(`  Transformed: "${result.transformedContent}"`);
    }
  }
}

// Example 2: Custom policy augmentation guidelines
async function customAugmentationExample() {
  console.log('\n📝 Example 2: Custom Policy Augmentation Guidelines');
  
  const guardrails = KliraAI.getGuardrails();
  const augmentation = guardrails.getAugmentation();

  // Add custom guidelines for different scenarios
  augmentation.addGuideline({
    id: 'company-brand-voice',
    category: 'brand',
    guideline: 'Always maintain a professional, helpful, and environmentally conscious tone that aligns with our sustainability mission.',
    priority: 8,
  });

  augmentation.addGuideline({
    id: 'data-privacy-compliance',
    category: 'privacy',
    guideline: 'Never request, store, or process personally identifiable information. Redirect users to official privacy-compliant channels when needed.',
    priority: 9,
  });

  augmentation.addGuideline({
    id: 'technical-accuracy',
    category: 'accuracy',
    guideline: 'Provide technically accurate information about renewable energy, sustainability, and environmental topics. Cite sources when possible.',
    priority: 7,
  });

  augmentation.addGuideline({
    id: 'financial-disclaimers',
    category: 'legal',
    guideline: 'When discussing financial or investment topics, always include appropriate disclaimers about consulting financial professionals.',
    priority: 6,
  });

  // Test augmentation with different topics
  const kliraAI = createKliraVercelAI({
    checkInput: true,
    augmentPrompt: true,
  });

  const safeGenerateText = kliraAI.wrapGenerateText(generateText);

  const testPrompts = [
    'Tell me about investing in renewable energy stocks',
    'How can I calculate my carbon footprint?',
    'What are the privacy implications of smart home energy systems?',
    'Explain the technical principles behind wind turbine efficiency',
  ];

  console.log('Testing custom augmentation guidelines:');
  for (const prompt of testPrompts) {
    console.log(`\n🧪 Testing prompt: "${prompt}"`);
    
    try {
      const result = await safeGenerateText({
        model: openai('gpt-4o-mini'),
        prompt,
        maxTokens: 150,
      });

      console.log(`✅ Response: ${result.text.substring(0, 200)}...`);
    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
    }
  }
}

// Example 3: Dynamic rule management
async function dynamicRulesExample() {
  console.log('\n🔄 Example 3: Dynamic Rule Management');
  
  const guardrails = KliraAI.getGuardrails();
  const fastRules = guardrails.getFastRules();

  // Simulate different operational modes
  const operationalModes = [
    {
      name: 'Development Mode',
      rules: [
        {
          id: 'dev-verbose-logging',
          pattern: /\b(debug|trace|verbose)\b/gi,
          action: 'warn' as const,
          severity: 'low' as const,
          description: 'Development logging terms detected',
        },
      ],
    },
    {
      name: 'Production Mode',
      rules: [
        {
          id: 'prod-internal-urls',
          pattern: /https?:\/\/internal\./gi,
          action: 'block' as const,
          severity: 'high' as const,
          description: 'Internal URL detected in production',
          replacement: '[INTERNAL_URL_REDACTED]',
        },
        {
          id: 'prod-staging-references',
          pattern: /\b(staging|dev|test)\b/gi,
          action: 'warn' as const,
          severity: 'medium' as const,
          description: 'Non-production environment reference',
        },
      ],
    },
  ];

  for (const mode of operationalModes) {
    console.log(`\n🔧 Switching to ${mode.name}:`);
    
    // Clear existing custom rules (keep built-in rules)
    // In practice, you'd have a method to manage rule sets
    
    // Add rules for current mode
    mode.rules.forEach(rule => {
      fastRules.addRule(rule);
      console.log(`  ➕ Added rule: ${rule.id}`);
    });

    // Test with mode-specific content
    const testContent = mode.name === 'Development Mode' 
      ? 'Enable debug logging for this feature'
      : 'Check the staging environment at https://internal.company.com';

    const result = await KliraAI.evaluateContent(testContent);
    
    console.log(`  📝 Test: "${testContent}"`);
    console.log(`  📊 Result: ${result.blocked ? 'BLOCKED' : result.violations.length > 0 ? 'WARNINGS' : 'ALLOWED'}`);
    
    if (result.violations.length > 0) {
      result.violations.forEach(v => {
        console.log(`    - ${v.ruleId}: ${v.severity}`);
      });
    }
  }
}

// Example 4: Content classification and routing
async function contentClassificationExample() {
  console.log('\n🏷️ Example 4: Content Classification and Routing');
  
  const guardrails = KliraAI.getGuardrails();
  const fastRules = guardrails.getFastRules();

  // Add classification rules that don't block but categorize
  const classificationRules = [
    {
      id: 'technical-content',
      pattern: /\b(algorithm|software|programming|code|technical|engineering)\b/gi,
      action: 'allow' as const,
      severity: 'info' as const,
      description: 'Technical content detected',
      metadata: { category: 'technical', expertise_required: 'high' },
    },
    {
      id: 'financial-content',
      pattern: /\b(investment|money|cost|price|budget|financial|economy)\b/gi,
      action: 'allow' as const,
      severity: 'info' as const,
      description: 'Financial content detected',
      metadata: { category: 'financial', requires_disclaimer: true },
    },
    {
      id: 'environmental-content',
      pattern: /\b(climate|environment|sustainable|renewable|green|carbon|eco)\b/gi,
      action: 'allow' as const,
      severity: 'info' as const,
      description: 'Environmental content detected',
      metadata: { category: 'environmental', priority: 'high' },
    },
  ];

  classificationRules.forEach(rule => {
    fastRules.addRule(rule);
  });

  // Test content classification
  const testContents = [
    'How do machine learning algorithms optimize renewable energy distribution?',
    'What are the financial benefits of investing in solar panel installations?',
    'Climate change impacts on biodiversity in marine ecosystems',
    'Simple cooking recipes for beginners',
  ];

  console.log('Classifying content:');
  for (const content of testContents) {
    const result = await KliraAI.evaluateContent(content);
    
    console.log(`\n📄 Content: "${content}"`);
    
    const categories = result.violations
      .filter(v => v.severity === 'info')
      .map(v => v.ruleId.replace('-content', ''));
    
    if (categories.length > 0) {
      console.log(`🏷️ Categories: ${categories.join(', ')}`);
      
      // Simulate routing based on categories
      if (categories.includes('technical')) {
        console.log('  🔄 Routing: Technical expert queue');
      } else if (categories.includes('financial')) {
        console.log('  🔄 Routing: Financial advisor with disclaimers');
      } else if (categories.includes('environmental')) {
        console.log('  🔄 Routing: Environmental specialist (high priority)');
      }
    } else {
      console.log('🏷️ Categories: general');
      console.log('  🔄 Routing: General assistant');
    }
  }
}

// Example 5: Conditional policies based on context
async function conditionalPoliciesExample() {
  console.log('\n🎯 Example 5: Conditional Policies Based on Context');
  
  // Simulate different user contexts
  const userContexts = [
    { role: 'public', region: 'US', age_verified: false },
    { role: 'employee', region: 'EU', age_verified: true },
    { role: 'admin', region: 'US', age_verified: true },
  ];

  const kliraAI = createKliraVercelAI({
    checkInput: true,
    checkOutput: true,
  });

  const safeGenerateText = kliraAI.wrapGenerateText(generateText);

  for (const context of userContexts) {
    console.log(`\n👤 Testing with context: ${JSON.stringify(context)}`);
    
    // Adjust guardrails based on context
    const guardrails = KliraAI.getGuardrails();
    const fastRules = guardrails.getFastRules();
    
    // Add context-specific rules
    if (context.region === 'EU') {
      fastRules.addRule({
        id: 'gdpr-compliance',
        pattern: /\b(gdpr|data protection|personal data)\b/gi,
        action: 'warn',
        severity: 'high',
        description: 'GDPR-related content requires special handling',
      });
    }
    
    if (context.role === 'public' && !context.age_verified) {
      fastRules.addRule({
        id: 'age-restricted-content',
        pattern: /\b(investment|financial advice|legal advice)\b/gi,
        action: 'block',
        severity: 'high',
        description: 'Age verification required for financial content',
      });
    }

    // Test with context-sensitive content
    const testPrompt = context.role === 'employee' 
      ? 'Explain our data protection policies for customer information'
      : 'What are some good investment strategies for beginners?';

    try {
      const result = await safeGenerateText({
        model: openai('gpt-4o-mini'),
        prompt: testPrompt,
        maxTokens: 100,
      });

      console.log(`✅ Allowed: ${result.text.substring(0, 100)}...`);
    } catch (error) {
      console.log(`🚫 Blocked: ${error.message}`);
    }
  }
}

// Main execution
async function main() {
  try {
    await initializeKlira();
    
    await customFastRulesExample();
    await customAugmentationExample();
    await dynamicRulesExample();
    await contentClassificationExample();
    await conditionalPoliciesExample();
    
    console.log('\n🎉 All custom policies examples completed successfully!');
  } catch (error) {
    console.error('❌ Custom policies demo failed:', error);
  } finally {
    // Clean shutdown
    await KliraAI.shutdown();
    console.log('👋 Klira AI SDK shut down');
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  initializeKlira,
  customFastRulesExample,
  customAugmentationExample,
  dynamicRulesExample,
  contentClassificationExample,
  conditionalPoliciesExample,
};