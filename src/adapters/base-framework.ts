/**
 * Klira SDK v2 — Shared framework adapter utilities.
 *
 * Framework adapters suppress native telemetry and use Klira tracing.
 */

import type { BaseFrameworkAdapter } from '../contracts/adapter-interfaces.js';

/**
 * Verify that native telemetry is suppressed.
 * Default implementation — framework-specific adapters override.
 */
export function defaultVerifySuppression(): boolean {
  return true;
}

/**
 * Identity pass-through for adapt* methods when no framework-specific
 * behavior is needed.
 */
export function identity<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return fn;
}
