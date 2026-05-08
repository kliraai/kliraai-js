/**
 * Klira SDK — internal logging utility.
 *
 * Two log paths exist in the SDK:
 *
 * 1. The `SimpleLogger` instance built from a `KliraConfig`, used by
 *    `Klira.init` and other hot-path code that runs after init has
 *    completed.
 *
 * 2. This `pkgLog` helper, used by code that runs *before* config is
 *    initialized — policy loading, auto-patching, anything that
 *    happens during `Klira.init` itself or independently of it.
 *
 * The split exists because `SimpleLogger` requires a `KliraConfig` and
 * isn't available during early init. `pkgLog` falls back to `console.*`
 * when no global config is set yet, but uses the SDK logger's redaction
 * + verbosity behavior when one is.
 *
 * Levels:
 *   - `warn` always emits (operator-relevant).
 *   - `info` and `debug` only emit under `verbose: true` / `debugMode: true`.
 */

import { getGlobalConfigOrNull, redactSecrets } from '../config/index.js';

function shouldEmit(level: 'warn' | 'info' | 'debug'): boolean {
  if (level === 'warn') return true;
  const cfg = getGlobalConfigOrNull();
  if (!cfg) return false;     // pre-init: skip non-warning lines
  if (level === 'debug') return cfg.debugMode || cfg.verbose;
  return cfg.verbose;
}

function emit(
  method: 'warn' | 'info' | 'debug',
  level: string,
  message: string,
  args: unknown[],
): void {
  if (!shouldEmit(method)) return;
  const safeArgs = args.map(redactSecrets);
  // eslint-disable-next-line no-console
  console[method](`[Klira:${level}] ${message}`, ...safeArgs);
}

export const pkgLog = {
  warn(message: string, ...args: unknown[]): void {
    emit('warn', 'WARN', message, args);
  },
  info(message: string, ...args: unknown[]): void {
    emit('info', 'INFO', message, args);
  },
  debug(message: string, ...args: unknown[]): void {
    emit('debug', 'DEBUG', message, args);
  },
};
