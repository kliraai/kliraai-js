# Changelog

All notable changes to the Klira AI JavaScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-05-07

### Summary

The 0.2.1 release brings the JavaScript SDK to **wire-format parity** with the Python SDK (`kliraai-sdk`). After this release, both SDKs emit byte-for-byte identical OpenTelemetry spans on the canonical scenarios — verified end-to-end by running both `healthcare_agent.py` and the JS port of the same agent and diffing the captured traces. ([PROD-764])

The release also adds the full Python parity surface that wasn't shipped in 0.1.x: the `withGuardrails` HOF, `userMessage` wrapper, OpenAI Responses adapter, auto-patching at `Klira.init`, AsyncLocalStorage guideline transport, provider-shape augmentation helpers, the `BuiltInLLMFallbackEvaluator`, full PHI scrubbing pipeline, eval-endpoint switching, and 11 new configuration knobs with `KLIRA_*` env-var equivalents.

### Added

#### Wrappers
- **`withGuardrails(name, fn)`** — inbound + outbound policy enforcement around any function. Throws `KliraPolicyViolation` on a blocked decision.
- **`userMessage({ userId, conversationId, messageId, framework? }, fn)`** — explicit root span with caller-controlled IDs, plus auto-flush on scope exit.
- **`tool(name, fn, { fhir })`** — short alias for the FHIR resource type, in addition to the existing `fhirResourceType`.

#### LLM adapters
- **OpenAI Responses adapter** (`@klira-ai/sdk/openai`'s `createOpenAIResponsesAdapter`) — wraps `client.responses.create`; emits `klira.llm.openai.responses` spans.
- **Subpath exports for Anthropic, Gemini, Ollama, LiteLLM** — `@klira-ai/sdk/anthropic`, `@klira-ai/sdk/gemini`, `@klira-ai/sdk/ollama`, `@klira-ai/sdk/litellm`.
- **Auto-patching** at `Klira.init` — any installed provider SDK is instrumented automatically (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `ollama`, `litellm`). Idempotency sentinel (`Symbol.for('klira.patched')`) prevents double-wrapping. ([PROD-483])
- **Provider-shape augmentation helpers** — `buildAugmentedMessages`, `buildAugmentedSystemKwarg` (Anthropic), `buildAugmentedInstructions` (OpenAI Responses), `buildAugmentedContents` (Gemini), `verifyAugmentation`.

#### Guardrails
- **`GuardrailsEngine.getInstance()` / `.setInstance()` / `.reset()`** — process-wide singleton.
- **AsyncLocalStorage guideline transport** — `runWithGuidelines`, `setGuidelines`, `getAndClearGuidelines`. Decouples guardrails from adapter constructor options.
- **`BuiltInLLMFallbackEvaluator`** — Python-parity LLM fallback, supports `provider` ∈ `{ "openai", "anthropic" }`, lazy-imports the provider SDK, honors `onError` ∈ `{ "allow", "block" }`. Replaces the prior OpenAI stub.
- **Synchronous compliance audit** — `klira.compliance.{decision}` span emits in the same batch as its parent. Fixes the flush race where deferred microtasks lost spans on process exit.
- **YAML alias rejection** in policy loading — billion-laughs / DoS hardening; aliases / anchors are rejected with a console warning.
- **Bare-list YAML support** — policy files accept both `[...]` and `{ policies: [...] }` shapes.
- **Engine mutex** — promise-chain serialization on `evaluate()` calls. ([PROD-482])

#### Pipeline
- **`NoneAttributeFilterProcessor`** — strips null / undefined attribute values pre-export.
- **`KliraFilteringExporter`** — drops any span whose name does not start with `klira.`.
- **`KliraOTLPSpanExporter`** — endpoint stored as a base URL; `/v1/traces` (or `/evals/v1/traces`) appended at export time.
- **TracerProvider takeover** — `Klira.init` replaces a pre-installed global provider.
- **PHI auto-wiring** — when `anonymization` is set, the OTLP exporter is wrapped in `PhiAwareExporter`.

#### Configuration surface (Python parity)
- New `KliraInitOptions` fields: `framework`, `clinicalDomain`, `evalsRun`, `datasetId`, `anonymization`, `phiExportEntityDetails`, `llmFallback.{provider,model,apiKey,onError}`, `policiesEndpoint`, `disableExternalTracing`, `useRemotePolicies`, `batchDelayMs`.
- New env vars: `KLIRA_FRAMEWORK`, `KLIRA_CLINICAL_DOMAIN`, `KLIRA_EVALS_RUN`, `KLIRA_DATASET_ID`, `KLIRA_ANONYMIZATION`, `KLIRA_PHI_EXPORT_ENTITY_DETAILS`, `KLIRA_LLM_FALLBACK_*`, `KLIRA_POLICIES_ENDPOINT`, `KLIRA_DISABLE_EXTERNAL_TRACING`, `KLIRA_USE_REMOTE_POLICIES`, `KLIRA_BATCH_DELAY_MS`.
- `redactSecrets()` and `SimpleLogger` redaction — secrets in `apiKey` / `authorization` fields are replaced with `[REDACTED]` before logging. ([PROD-477])

#### Healthcare
- Re-exported from package root: `setPatientContext`, `setClinicalContext`, `setInteractionModality`, `logClinicalDecision`, `logEscalation`, `logHandoff`, `logSafetyCheck`, `logRAGRetrieval`.
- `logClinicalDecision({ decision, reasoning, confidence?, patientId?, guidelinesUsed? })` — wire shape now matches Python.
- `logSafetyCheck({ checkType, passed, details? })` — emits `klira.clinical.{check_type,check_passed,check_details}`.
- `logRAGRetrieval({ source, query, resultCount, indexName? })` — span name `klira.clinical.rag_retrieval` (was `klira.rag.retrieval`).

### Changed (Breaking on the wire)

These are all in service of Python parity. Customer source code that doesn't reach into span attribute names continues to work; anything inspecting span attributes will need updates.

- **Span name renames:**
  - `klira.rag.retrieval` → `klira.clinical.rag_retrieval`
- **Removed JS-only spans** (Python doesn't emit these, so JS doesn't either):
  - `klira.guardrails.fast_rules`
  - `klira.guardrails.route_decision`
- **Renamed attributes:**
  - `klira.guardrails.direction` → `klira.compliance.direction`
  - Values `'input'` / `'output'` → `'inbound'` / `'outbound'`
  - `klira.clinical.decision_type` → `klira.clinical.decision`
  - `klira.clinical.rationale` → `klira.clinical.reasoning`
  - `klira.clinical.safety_check_*` → `klira.clinical.check_*`
  - `klira.rag.{source,query,result_count}` → `klira.clinical.rag_{source,query,result_count}`
  - On `klira.llm.*`: `klira.input` (prompt capture) → `gen_ai.prompt`
- **Decision attribute values:** `klira.guardrails.decision` now uses action verbs (`allow` / `block` / `augment` / `llm_fallback`), not past-tense (`allowed` / `blocked` / ...). Span name suffix on `klira.compliance.{...}` keeps the past-tense form.
- **Removed JS-only attributes:**
  - `klira.duration_ms` and `klira.guardrails.latency_ms` — Python doesn't inject these.
  - `klira.entity_name` on `klira.user.message` — root stays lean.
  - `klira.healthcare.clinical_domain` / `klira.framework` / `klira.evals.evals_run` / `klira.evals.dataset_id` on `klira.user.message` — those tags belong on workflow / tool spans, not on the root.
  - On `klira.llm.*`: `klira.entity_name`, `klira.user_id`, `klira.conversation_id`, `klira.framework` — Python's GenAI span is intentionally lean.
- **Conditional `klira.phi.detected`** — now only emitted when PHI is actually detected (was `false` on every scanned span).
- **Endpoint now stored as a base URL.** Legacy values ending in `/v1/traces` are stripped on load. The `/v1/traces` (or `/evals/v1/traces`) path is appended at export time.
- **`logClinicalDecision` parameter rename:** `decisionType` / `rationale` → `decision` / `reasoning` (with new optional `patientId`, `guidelinesUsed`).
- **Default `BatchSpanProcessor.scheduledDelayMillis`** changed from 5000ms to 500ms (Python parity).
- **Drop `[truncated]` suffix** on prompt / output truncation — silent truncation matches Python.
- **Drop `klira.schema.version`** as a resource attribute.
- **Anthropic guideline augmentation** now uses the native `system` kwarg, not a synthetic system message in `messages`.
- **OpenAI Responses guideline augmentation** uses the `instructions` kwarg.
- **Gemini guideline augmentation** prepends a guideline `contents` block.

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
