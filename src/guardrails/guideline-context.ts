/**
 * Klira SDK — guideline transport via AsyncLocalStorage.
 *
 * Mirrors Python `klira/sdk/guardrails/guideline_context.py`. Guardrails
 * deposit augmentation guidelines for the *next* outbound LLM call into
 * an AsyncLocalStorage cell; the LLM adapter reads-and-clears them at
 * request time. Decoupling guardrails from the adapter constructor lets
 * the same engine instance feed any number of LLM clients.
 */

import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage<{ guidelines: string[] | null }>();

/** Run `fn` inside a fresh guideline cell. */
export function runWithGuidelines<T>(guidelines: string[] | null, fn: () => T): T {
  return storage.run({ guidelines: guidelines ? [...guidelines] : null }, fn);
}

/** Set guidelines on the active cell. No-op outside `runWithGuidelines`. */
export function setGuidelines(guidelines: readonly string[] | null): void {
  const cell = storage.getStore();
  if (!cell) return;
  cell.guidelines = guidelines ? [...guidelines] : null;
}

/**
 * Read-and-clear: the consuming adapter pulls the guidelines for its
 * single call, then the cell is reset to null so a follow-up call in
 * the same async scope doesn't accidentally re-augment.
 */
export function getAndClearGuidelines(): string[] | null {
  const cell = storage.getStore();
  if (!cell || !cell.guidelines) return null;
  const taken = cell.guidelines;
  cell.guidelines = null;
  return taken;
}
