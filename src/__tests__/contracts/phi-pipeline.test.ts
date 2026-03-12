import { describe, it, expect } from 'vitest';
import {
  PhiMethod,
  PHI_SCANNABLE_ATTRIBUTES,
  PHI_SCANNABLE_PATTERNS,
} from '../../contracts/phi-pipeline.js';

describe('PHI Pipeline Contract', () => {
  it('has 4 anonymization methods', () => {
    const methods = Object.values(PhiMethod);
    expect(methods).toHaveLength(4);
    expect(methods).toContain('redact');
    expect(methods).toContain('mask');
    expect(methods).toContain('replace');
    expect(methods).toContain('hash');
  });

  it('defines scannable attributes including gen_ai.prompt', () => {
    expect(PHI_SCANNABLE_ATTRIBUTES).toContain('gen_ai.prompt');
    expect(PHI_SCANNABLE_ATTRIBUTES).toContain('gen_ai.prompt.original');
    expect(PHI_SCANNABLE_ATTRIBUTES).toContain('klira.output');
    expect(PHI_SCANNABLE_ATTRIBUTES).toContain('klira.input');
  });

  it('defines scannable patterns for clinical and healthcare', () => {
    expect(PHI_SCANNABLE_PATTERNS).toContain('klira.clinical.*');
    expect(PHI_SCANNABLE_PATTERNS).toContain('klira.healthcare.*');
  });

  it('has wildcard content patterns', () => {
    expect(PHI_SCANNABLE_PATTERNS).toContain('*.content');
    expect(PHI_SCANNABLE_PATTERNS).toContain('*.text');
    expect(PHI_SCANNABLE_PATTERNS).toContain('*.message');
  });
});
