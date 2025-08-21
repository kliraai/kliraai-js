/**
 * Tests for YAML-based policy system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PolicyLoader } from '../guardrails/policy-loader.js';
import { FastRulesEngine } from '../guardrails/fast-rules.js';
import { PolicyAugmentation } from '../guardrails/policy-augmentation.js';
import { GuardrailsEngine } from '../guardrails/engine.js';
import { setGlobalConfig, createConfig } from '../config/index.js';

describe('YAML Policy System', () => {
  beforeEach(() => {
    // Set up global config for tests
    const config = createConfig({
      appName: 'test-app',
      verbose: false,
    });
    setGlobalConfig(config);
  });

  afterEach(() => {
    // Reset singleton instances
    GuardrailsEngine.resetInstance();
  });

  describe('PolicyLoader', () => {
    let loader: PolicyLoader;

    beforeEach(() => {
      loader = new PolicyLoader();
    });

    it('should load default policies from YAML', async () => {
      const policyFile = await loader.loadDefault();
      
      expect(policyFile.version).toBeDefined();
      expect(policyFile.policies).toBeInstanceOf(Array);
      expect(policyFile.policies.length).toBeGreaterThan(0);
    });

    it('should compile policies with patterns', async () => {
      const policyFile = await loader.loadDefault();
      const compiledPolicies = loader.compilePolicies(policyFile.policies);
      
      const piiPolicy = compiledPolicies.find(p => p.id === 'pii_001');
      expect(piiPolicy).toBeDefined();
      expect(piiPolicy?.compiledPatterns).toBeDefined();
      expect(piiPolicy?.compiledPatterns!.length).toBeGreaterThan(0);
    });

    it('should handle domain patterns', async () => {
      const policyFile = await loader.loadDefault();
      const compiledPolicies = loader.compilePolicies(policyFile.policies);
      
      const piiPolicy = compiledPolicies.find(p => p.id === 'pii_001');
      expect(piiPolicy?.domainPatterns).toBeDefined();
      expect(piiPolicy?.domainPatterns!.length).toBeGreaterThan(0);
    });
  });

  describe('FastRulesEngine with YAML', () => {
    let engine: FastRulesEngine;

    beforeEach(async () => {
      engine = new FastRulesEngine();
      await engine.initialize();
    });

    it('should initialize with YAML policies', async () => {
      expect(engine.isYAMLInitialized()).toBe(true);
      
      const stats = engine.getPolicyCount();
      expect(stats.yaml).toBeGreaterThan(0);
    });

    it('should detect email addresses using YAML policies', () => {
      const content = 'My email is john.doe@example.com';
      const result = engine.evaluateWithDirection(content, 'outbound');
      
      // Should detect email in outbound direction (PII policy)
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.blocked).toBe(true);
      expect(result.matchedPolicies).toContain('pii_001');
    });

    it('should respect direction-based policies', () => {
      const content = 'Contact john.doe@example.com for help';
      
      // Inbound should not trigger PII policy (outbound only)
      const inboundResult = engine.evaluateWithDirection(content, 'inbound');
      expect(inboundResult.blocked).toBe(false);
      
      // Outbound should trigger PII policy
      const outboundResult = engine.evaluateWithDirection(content, 'outbound');
      expect(outboundResult.blocked).toBe(true);
    });
  });

  describe('PolicyAugmentation with YAML', () => {
    let augmentation: PolicyAugmentation;
    let policyLoader: PolicyLoader;

    beforeEach(async () => {
      policyLoader = new PolicyLoader();
      const policyFile = await policyLoader.loadDefault();
      
      augmentation = new PolicyAugmentation();
      await augmentation.initialize(policyFile.policies);
    });

    it('should initialize with YAML policies', () => {
      expect(augmentation.isYAMLInitialized()).toBe(true);
      expect(augmentation.getPolicyGuidelinesCount()).toBeGreaterThan(0);
    });

    it('should generate guidelines from violated policies', () => {
      const violations = [{
        ruleId: 'pii_001',
        message: 'Email detected',
        severity: 'high' as const,
        blocked: true,
      }];

      const guidelines = augmentation.generateGuidelines(violations);
      expect(guidelines.length).toBeGreaterThan(0);
      expect(guidelines.some(g => g.includes('personal') || g.includes('PII'))).toBe(true);
    });
  });

  describe('GuardrailsEngine Integration', () => {
    let engine: GuardrailsEngine;

    beforeEach(async () => {
      engine = GuardrailsEngine.getInstance({
        fastRulesEnabled: true,
        augmentationEnabled: true,
        llmFallbackEnabled: false,
      });
      await engine.initialize();
    });

    it('should show policy statistics', () => {
      const stats = engine.getPolicyStats();
      
      expect(stats.totalPolicies).toBeGreaterThan(0);
      expect(stats.fastRulesStats.yaml).toBeGreaterThan(0);
      expect(stats.augmentationStats.yamlInitialized).toBe(true);
    });

    it('should evaluate outbound content with YAML policies', async () => {
      const content = 'Here is my email: secret@example.com';
      const result = await engine.evaluateOutput(content);
      
      expect(result.blocked).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].ruleId).toBe('pii_001');
    });

    it('should provide policy-based guidelines', async () => {
      const content = 'My SSN is 123-45-6789';
      const result = await engine.evaluateOutput(content, {
        augmentPrompt: true,
      });
      
      expect(result.blocked).toBe(true);
      expect(result.guidelines).toBeDefined();
      expect(result.guidelines!.length).toBeGreaterThan(0);
    });
  });
});