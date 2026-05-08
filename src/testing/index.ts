/**
 * Klira SDK — testing-only escape hatches.
 *
 * Anything exposed from `klira/testing` is **not part of the public, semver-
 * stable surface**. The signatures and behaviors may change in any minor
 * release without notice. Production code should not import from here.
 *
 * The intended use is:
 *   - Test harnesses that need to attach an extra `SpanProcessor` / exporter.
 *   - Cross-SDK parity diffs (see `new-sdk-testing/healthcare-agent-js/`).
 *   - Dev-time observability inspection.
 */

export { getProviderForTesting } from '../observability/pipeline.js';
