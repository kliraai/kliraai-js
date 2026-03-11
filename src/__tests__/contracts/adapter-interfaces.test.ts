import { describe, it, expect } from 'vitest';
import {
  PROMPT_TRUNCATION_LIMIT,
  OUTPUT_TRUNCATION_LIMIT,
} from '../../contracts/adapter-interfaces.js';

describe('Adapter Interfaces Contract', () => {
  it('has prompt truncation limit of 10000', () => {
    expect(PROMPT_TRUNCATION_LIMIT).toBe(10000);
  });

  it('has output truncation limit of 5000', () => {
    expect(OUTPUT_TRUNCATION_LIMIT).toBe(5000);
  });
});
