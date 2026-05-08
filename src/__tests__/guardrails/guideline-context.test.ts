/**
 * PROD-764 Phase 5 — AsyncLocalStorage guideline transport.
 */

import { describe, it, expect } from 'vitest';
import {
  runWithGuidelines,
  setGuidelines,
  getAndClearGuidelines,
} from '../../guardrails/guideline-context.js';

describe('guideline-context', () => {
  it('isolates guidelines between sibling async scopes', async () => {
    const seenLeft: string[] = [];
    const seenRight: string[] = [];

    await Promise.all([
      runWithGuidelines(['left-1', 'left-2'], async () => {
        const taken = getAndClearGuidelines();
        if (taken) seenLeft.push(...taken);
      }),
      runWithGuidelines(['right-1'], async () => {
        const taken = getAndClearGuidelines();
        if (taken) seenRight.push(...taken);
      }),
    ]);

    expect(seenLeft).toEqual(['left-1', 'left-2']);
    expect(seenRight).toEqual(['right-1']);
  });

  it('read-and-clear resets the cell to null', async () => {
    await runWithGuidelines(['only'], async () => {
      expect(getAndClearGuidelines()).toEqual(['only']);
      expect(getAndClearGuidelines()).toBeNull();
    });
  });

  it('setGuidelines from a child scope is observable to its descendants', async () => {
    await runWithGuidelines(null, async () => {
      setGuidelines(['set-from-child']);
      expect(getAndClearGuidelines()).toEqual(['set-from-child']);
    });
  });

  it('setGuidelines outside runWithGuidelines is a no-op', () => {
    setGuidelines(['ignored']);
    expect(getAndClearGuidelines()).toBeNull();
  });
});
