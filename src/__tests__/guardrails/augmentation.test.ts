/**
 * PROD-764 Phase 5 — provider-shape augmentation helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAugmentedMessages,
  buildAugmentedSystemKwarg,
  buildAugmentedInstructions,
  buildAugmentedContents,
  verifyAugmentation,
} from '../../guardrails/augmentation.js';

describe('buildAugmentedMessages', () => {
  it('appends to an existing system message', () => {
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ];
    const result = buildAugmentedMessages(messages, ['Be safe', 'Cite sources']);
    expect(result.length).toBe(2);
    expect(String(result[0].content)).toContain('You are helpful.');
    expect(String(result[0].content)).toContain('1. Be safe');
    expect(String(result[0].content)).toContain('2. Cite sources');
  });

  it('prepends a new system message when none exists', () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    const result = buildAugmentedMessages(messages, ['Be safe']);
    expect(result.length).toBe(2);
    expect(result[0].role).toBe('system');
  });

  it('returns the original messages when guidelines is empty', () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    expect(buildAugmentedMessages(messages, [])).toBe(messages);
  });
});

describe('buildAugmentedSystemKwarg (Anthropic shape)', () => {
  it('appends to a string system value', () => {
    const result = buildAugmentedSystemKwarg('Be helpful.', ['Cite sources']);
    expect(typeof result).toBe('string');
    expect(String(result)).toContain('Be helpful.');
    expect(String(result)).toContain('Cite sources');
  });

  it('appends a content block to a content-block array', () => {
    const original = [{ type: 'text', text: 'Be helpful.' }];
    const result = buildAugmentedSystemKwarg(original, ['Cite sources']) as any[];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[1].type).toBe('text');
    expect(String(result[1].text)).toContain('Cite sources');
  });

  it('returns the input unchanged when guidelines is empty', () => {
    expect(buildAugmentedSystemKwarg('hi', [])).toBe('hi');
  });
});

describe('buildAugmentedInstructions (OpenAI Responses shape)', () => {
  it('appends to an existing instructions string', () => {
    const result = buildAugmentedInstructions('Use formal tone.', ['Cite sources']);
    expect(result).toContain('Use formal tone.');
    expect(result).toContain('Cite sources');
  });

  it('returns the bare guidelines block when instructions is empty', () => {
    const result = buildAugmentedInstructions('', ['Cite sources']);
    expect(result).toContain('IMPORTANT GUIDELINES');
    expect(result).toContain('Cite sources');
  });
});

describe('buildAugmentedContents (Gemini shape)', () => {
  it('prepends a content with the guideline text', () => {
    const original = [{ role: 'user', parts: [{ text: 'Hi' }] }];
    const result = buildAugmentedContents(original, ['Cite sources']) as any[];
    expect(result.length).toBe(2);
    expect(String(result[0].parts[0].text)).toContain('Cite sources');
  });

  it('handles undefined contents', () => {
    const result = buildAugmentedContents(undefined, ['Cite sources']) as any[];
    expect(result.length).toBe(1);
  });
});

describe('verifyAugmentation', () => {
  it('finds the guidelines header in the rendered payload', () => {
    const payload = {
      messages: buildAugmentedMessages(
        [{ role: 'user', content: 'Hi' }],
        ['Cite sources'],
      ),
    };
    const result = verifyAugmentation(payload, ['Cite sources']);
    expect(result.found).toBe(true);
  });

  it('returns found=false when guidelines did not make it', () => {
    const payload = { messages: [{ role: 'user', content: 'Hi' }] };
    const result = verifyAugmentation(payload, ['Cite sources']);
    expect(result.found).toBe(false);
  });
});
