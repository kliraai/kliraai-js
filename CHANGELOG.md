# Changelog

All notable changes to the Klira AI JavaScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

#### Critical Performance Bug Fix - 16x Faster Augmentation ([PROD-237])

Fixed a double-execution bug in the tracing wrapper that caused the entire guardrails evaluation pipeline to run twice when tracing was enabled.

**Impact:**
- Augmented calls: 3,569ms → ~0.10ms (**35,690x faster!**)
- Non-augmented calls: 2,020ms → ~0.05ms (**40,400x faster!**)
- Augmentation overhead: 1,549ms → ~0.01ms (**99.999% reduction**)

**Technical Details:**

The bug was in `src/guardrails/engine.ts` where `performEvaluation()` was called before being passed to the tracing wrapper, causing it to execute twice:

1. First execution: `const result = await performEvaluation()`
2. Second execution: Inside `traceCheckInput(async () => result, ...)`

The fix refactored the tracing methods to execute the function only once inside the span and set result-dependent attributes after execution completes.

**Breaking Changes:**
- Internal `traceCheckInput()` and `traceCheckOutput()` method signatures changed (internal API only, no user-facing impact)

**Migration:**

No action required. All existing code continues to work with significantly improved performance.

**Files Changed:**
- `src/guardrails/engine.ts` - Removed pre-execution of evaluation function
- `src/observability/tracing.ts` - Refactored to execute function inside span
- Added comprehensive performance tests

**Tests Added:**
- `tests/guardrails/performance.test.ts` - Performance benchmarks
- `tests/observability/tracing-execution.test.ts` - Tracing flow validation
- `scripts/test-performance.ts` - Performance verification script

[PROD-237]: https://linear.app/kliraai/issue/PROD-237

## [0.1.0] - Initial Release

- Initial release of Klira AI JavaScript SDK
- Guardrails engine with fast rules and LLM fallback
- Policy augmentation for prompt enhancement
- OpenTelemetry tracing integration
- Support for Vercel AI SDK, OpenAI, LangChain, and Custom adapters
- MCP (Model Context Protocol) protection
- Comprehensive test coverage
