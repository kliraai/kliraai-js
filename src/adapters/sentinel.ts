/**
 * Klira SDK — Idempotency sentinel for adapter patching.
 *
 * Mirrors Python `klira/sdk/adapters/base_llm.py:41-68`. A patched client
 * carries the global `Symbol.for('klira.patched')` marker so a second
 * `Klira.init()` (or a manual `patchX(client)` re-call) returns the same
 * client untouched — no nested wrappers, no duplicate spans (PROD-483).
 *
 * Falls back to a `WeakSet` for clients that resist defineProperty
 * (frozen instances or hostile Proxies).
 */

export const KLIRA_PATCHED = Symbol.for('klira.patched');

const fallbackPatched = new WeakSet<object>();

export function isPatched(client: object): boolean {
  if (fallbackPatched.has(client)) return true;
  return (client as Record<symbol, unknown>)[KLIRA_PATCHED] === true;
}

export function markPatched(client: object): void {
  try {
    Object.defineProperty(client, KLIRA_PATCHED, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  } catch {
    fallbackPatched.add(client);
  }
}
