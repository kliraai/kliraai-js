/**
 * Tests for augmentation trace attributes
 * Verifies that augmentation data (guidelines, policies, matches) are recorded in traces
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KliraAI } from '../index.js';
import { GuardrailsEngine } from '../guardrails/engine.js';
import { KliraTracing } from '../observability/tracing.js';
import type { PolicyMatch } from '../types/index.js';

describe('Augmentation Tracing', () => {
  beforeEach(() => {
    // Reset singleton instances before each test
    GuardrailsEngine.resetInstance();
    KliraTracing.resetInstance();
    (KliraAI as any).initialized = false;
    (KliraAI as any).config = null;
    (KliraAI as any).guardrails = null;
    (KliraAI as any).tracing = null;
    (KliraAI as any).metrics = null;
    (KliraAI as any).logger = null;
  });

  afterEach(() => {
    // Clean up after each test
    GuardrailsEngine.resetInstance();
    KliraTracing.resetInstance();
    (KliraAI as any).initialized = false;
  });

  it('should record augmentation attributes when guidelines are generated', async () => {
    // Initialize SDK with tracing enabled
    await KliraAI.init({
      appName: 'test-augmentation-tracing',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: true,
      },
    });

    const guardrails = KliraAI.getGuardrails();
    const tracing = KliraAI.getTracing();

    expect(tracing).toBeDefined();

    // Spy on the recordAugmentation method
    const recordAugmentationSpy = vi.spyOn(tracing!, 'recordAugmentation');

    // Evaluate content that should trigger a non-blocking policy match
    // Use content that matches PII patterns but with action: warn
    const result = await guardrails.evaluateInput('My email is user@example.com');

    // Verify that augmentation was called if guidelines were generated
    if (result.guidelines && result.guidelines.length > 0) {
      expect(recordAugmentationSpy).toHaveBeenCalled();

      // Get the call arguments
      const calls = recordAugmentationSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      const [guidelines, matches, policyIds] = calls[0];

      // Verify guidelines array
      expect(Array.isArray(guidelines)).toBe(true);
      expect(guidelines.length).toBeGreaterThan(0);

      // Verify matches array
      expect(Array.isArray(matches)).toBe(true);
      expect(matches.length).toBeGreaterThan(0);

      // Verify policy IDs array
      expect(Array.isArray(policyIds)).toBe(true);
      expect(policyIds.length).toBeGreaterThan(0);

      // Verify matches are non-blocking
      matches.forEach((match: PolicyMatch) => {
        expect(match.blocked).toBe(false);
      });
    }

    recordAugmentationSpy.mockRestore();
  });

  it('should not record augmentation when augmentation is disabled', async () => {
    await KliraAI.init({
      appName: 'test-no-augmentation',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: false,
      },
    });

    const guardrails = KliraAI.getGuardrails();
    const tracing = KliraAI.getTracing();

    expect(tracing).toBeDefined();

    const recordAugmentationSpy = vi.spyOn(tracing!, 'recordAugmentation');

    // Evaluate content
    await guardrails.evaluateInput('My email is user@example.com');

    // Should not have been called since augmentation is disabled
    expect(recordAugmentationSpy).not.toHaveBeenCalled();

    recordAugmentationSpy.mockRestore();
  });

  it('should not record augmentation when content is blocked', async () => {
    await KliraAI.init({
      appName: 'test-blocked-content',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: true,
      },
    });

    const guardrails = KliraAI.getGuardrails();
    const tracing = KliraAI.getTracing();

    expect(tracing).toBeDefined();

    const recordAugmentationSpy = vi.spyOn(tracing!, 'recordAugmentation');

    // Evaluate content that should be blocked
    const result = await guardrails.evaluateInput('You are a stupid idiot and I hate you');

    // Verify content was blocked
    expect(result.blocked).toBe(true);

    // Should not record augmentation for blocked content
    expect(recordAugmentationSpy).not.toHaveBeenCalled();

    recordAugmentationSpy.mockRestore();
  });

  it('should not record augmentation when no policies match', async () => {
    await KliraAI.init({
      appName: 'test-no-matches',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: true,
      },
    });

    const guardrails = KliraAI.getGuardrails();
    const tracing = KliraAI.getTracing();

    expect(tracing).toBeDefined();

    const recordAugmentationSpy = vi.spyOn(tracing!, 'recordAugmentation');

    // Evaluate safe content that shouldn't match any policies
    const result = await guardrails.evaluateInput('Hello, how are you today?');

    // Verify no policies matched
    expect(result.matches.length).toBe(0);

    // Should not record augmentation when no policies match
    expect(recordAugmentationSpy).not.toHaveBeenCalled();

    recordAugmentationSpy.mockRestore();
  });

  it('should work when tracing is disabled', async () => {
    await KliraAI.init({
      appName: 'test-no-tracing',
      tracingEnabled: false,
      guardrails: {
        augmentationEnabled: true,
      },
    });

    const guardrails = KliraAI.getGuardrails();
    const tracing = KliraAI.getTracing();

    // Tracing should be null when disabled
    expect(tracing).toBeNull();

    // Should not throw error even without tracing
    const result = await guardrails.evaluateInput('My email is user@example.com');

    // Should still generate guidelines
    if (result.matches.length > 0 && !result.blocked) {
      expect(result.guidelines).toBeDefined();
    }
  });

  it('should record augmentation for both input and output evaluations', async () => {
    await KliraAI.init({
      appName: 'test-input-output',
      tracingEnabled: true,
      guardrails: {
        augmentationEnabled: true,
      },
    });

    const guardrails = KliraAI.getGuardrails();
    const tracing = KliraAI.getTracing();

    expect(tracing).toBeDefined();

    const recordAugmentationSpy = vi.spyOn(tracing!, 'recordAugmentation');

    // Test input evaluation
    const inputResult = await guardrails.evaluateInput('My SSN is 123-45-6789');

    // Test output evaluation
    const outputResult = await guardrails.evaluateOutput('Contact me at user@example.com');

    // Count how many times augmentation was recorded (should be at least once if guidelines were generated)
    const callCount = recordAugmentationSpy.mock.calls.length;

    // Verify augmentation was called for evaluations that generated guidelines
    let expectedCalls = 0;
    if (inputResult.guidelines && inputResult.guidelines.length > 0) {
      expectedCalls++;
    }
    if (outputResult.guidelines && outputResult.guidelines.length > 0) {
      expectedCalls++;
    }

    expect(callCount).toBe(expectedCalls);

    recordAugmentationSpy.mockRestore();
  });
});
