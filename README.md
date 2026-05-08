# Klira SDK (JavaScript / TypeScript)

The official JavaScript / TypeScript SDK for [Klira AI](https://getklira.com) — guardrails, tracing, and PHI-aware observability for GenAI applications. Wire-format compatible with the [Python SDK](https://github.com/kliraai/python-sdk).

## Requirements

- Node.js 18 or higher
- TypeScript 5.5+ (recommended)

## Installation

```bash
npm install @klira-ai/sdk
```

## Quick start

```ts
import { Klira, workflow, withGuardrails } from '@klira-ai/sdk';
import OpenAI from 'openai';

await Klira.init({
  apiKey: process.env.KLIRA_API_KEY,
  appName: 'my-app',
});

// Klira auto-patches installed LLM SDKs at init — no manual wrapping needed.
const openai = new OpenAI();

const chat = workflow('chat', async (prompt: string) => {
  return withGuardrails(async () => {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices[0].message.content ?? '';
  })(prompt);
});

console.log(await chat('Tell me about renewable energy.'));
```

`Klira.init` is idempotent — call once at process start. The SDK auto-creates a `klira.user.message` root span when a workflow runs outside an explicit `userMessage()` scope, so every trace has the same shape.

## Trace structure

Every Klira trace has a stable hierarchy. For a single-LLM-call workflow:

```
klira.user.message (root)
└── klira.workflow.{name}
    ├── klira.guardrails.input
    │   └── klira.compliance.{allowed|augmented|blocked|llm_fallback}
    ├── klira.llm.{provider}
    └── klira.guardrails.output
        └── klira.compliance.{allowed|augmented|blocked|llm_fallback}
```

Healthcare flows can layer in `klira.tool.*` (with FHIR resource type), `klira.agent.*`, and `klira.task.*` spans as children of the workflow span.

## Wrappers

All wrappers are higher-order functions — they take a function and return an instrumented function with the same signature.

| Wrapper | Span produced | When to use |
|---|---|---|
| `userMessage(opts, fn)` | `klira.user.message` | Outermost handler in a request — sets `userId`, `conversationId`, `messageId` |
| `workflow(name, fn)` | `klira.workflow.{name}` | Logical unit of work; auto-creates `klira.user.message` if outside one |
| `agent(name, fn)` | `klira.agent.{name}` | Multi-step agent execution |
| `task(name, fn)` | `klira.task.{name}` | A discrete sub-step inside an agent |
| `tool(name, fn, opts?)` | `klira.tool.{name}` | A tool/function call. `opts.fhir` stamps `klira.fhir.resource_type` |
| `withGuardrails(fn)` | `klira.guardrails.input` + `klira.guardrails.output` | Wraps an LLM call with input/output policy checks |

```ts
import { userMessage, workflow, agent, task, tool, withGuardrails } from '@klira-ai/sdk';

const handleRequest = userMessage(
  { userId: 'u-123', conversationId: 'c-1', messageId: 'm-1' },
  workflow('triage', async (input: string) => {
    return agent('clinical-agent', async () => {
      const patient = await tool('lookup-patient', fetchPatient, { fhir: 'Patient' })(input);
      return task('summarize', () => summarize(patient))();
    })();
  }),
);

await handleRequest('Patient ID 42 — recent visit summary');
```

## LLM adapters

Klira auto-patches OpenAI, Anthropic, and Google Gemini SDKs at `Klira.init()` — every call to those clients is automatically wrapped in a `klira.llm.{provider}` span.

For LiteLLM, Ollama, or a fully custom provider, wrap the client manually:

```ts
import { createLiteLLMAdapter } from '@klira-ai/sdk/litellm';
import { createOllamaAdapter } from '@klira-ai/sdk/ollama';
import { createCustomAdapter } from '@klira-ai/sdk/custom';

const litellm = createLiteLLMAdapter(yourLiteLLMClient);
const ollama = createOllamaAdapter(yourOllamaClient);

// Anything else — pass a request handler
const custom = createCustomAdapter({
  provider: 'my-llm',
  call: async (req) => myCustomLLM(req),
});
```

Framework-level adapters are available for Vercel AI and LangChain.js:

```ts
import { createVercelAIAdapter } from '@klira-ai/sdk/vercel-ai';
import { createLangChainAdapter } from '@klira-ai/sdk/langchain';
```

## Guardrails

`withGuardrails(fn)` checks the inbound prompt before the LLM call and the outbound response after — both run through the same policy engine. The engine evaluates in three layers:

1. **Fast rules** — regex / pattern policies (PII, prompt injection, etc.) loaded from YAML or the Klira API.
2. **Augmentation** — when a policy matches in `augment` mode, contextual guidelines are injected into the prompt instead of blocking the call.
3. **LLM fallback** — for cases where fast rules are inconclusive, an evaluator LLM (configured via `llmFallback`) makes the final allow / block decision.

Each guardrails span emits a `klira.compliance.{allowed|augmented|blocked|llm_fallback}` child span describing the decision.

```ts
await Klira.init({
  apiKey: process.env.KLIRA_API_KEY,
  appName: 'my-app',
  guardrails: {
    fastRulesEnabled: true,
    augmentationEnabled: true,
    failureMode: 'open',  // 'open' fails open on engine errors; 'closed' blocks
  },
  llmFallback: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
    onError: 'allow',
  },
});
```

By default, policies are loaded from the Klira platform (`https://api.getklira.com/v1/policies`). To load from a local YAML file instead:

```ts
await Klira.init({
  appName: 'my-app',
  useRemotePolicies: false,
  policiesPath: './policies.yaml',
});
```

## PHI anonymization

For HIPAA-sensitive workloads, enable PHI scrubbing at export — detected protected health information is removed from spans before they leave the process:

```ts
await Klira.init({
  apiKey: process.env.KLIRA_API_KEY,
  appName: 'clinical-app',
  anonymization: 'redact',     // 'redact' | 'mask' | 'hash' | 'remove'
  phiExportEntityDetails: false,  // when false, only `klira.phi.detected` is exported
});
```

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `appName` | `string` | required | Service name — emitted as the OTLP `service.name` resource attribute |
| `apiKey` | `string` | `KLIRA_API_KEY` env | Klira API key (must start with `klira_`) |
| `environment` | `string` | `NODE_ENV` or `"development"` | Environment label |
| `tracingEnabled` | `boolean` | `true` | When false, no OTel pipeline is initialized |
| `endpoint` | `string` | `https://api.getklira.com` | OTLP endpoint base URL |
| `framework` | `string` | — | Stamped as `klira.framework` on every Klira span |
| `clinicalDomain` | `string` | — | Stamped on workflow spans for healthcare flows |
| `evalsRun` | `string` | — | When set, traces route to `/evals/v1/traces` and the run ID is stamped on the root |
| `useRemotePolicies` | `boolean` | `true` | Load policies from the Klira platform |
| `policiesEndpoint` | `string` | `https://api.getklira.com/v1/policies` | Remote policies endpoint |
| `policiesPath` | `string` | — | Local YAML path (used when `useRemotePolicies` is false) |
| `anonymization` | `'redact' \| 'mask' \| 'hash' \| 'remove'` | — | PHI anonymization method |
| `phiExportEntityDetails` | `boolean` | `false` | When true, exports per-entity PHI details alongside `klira.phi.detected` |
| `llmFallback` | `{ provider, model, apiKey, onError }` | — | Built-in LLM fallback evaluator config |
| `guardrails.failureMode` | `'open' \| 'closed'` | `'open'` | Behavior when the engine fails internally |
| `disableExternalTracing` | `boolean` | `false` | Disable any non-Klira OTel tracer the host already installed |

All options also read from environment variables — see the type definitions for `KliraInitOptions`.

## Module systems

ES Modules:

```ts
import { Klira, workflow } from '@klira-ai/sdk';
import { createOpenAIAdapter } from '@klira-ai/sdk/openai';
```

CommonJS:

```js
const { Klira, workflow } = require('@klira-ai/sdk');
const { createOpenAIAdapter } = require('@klira-ai/sdk/openai');
```

## Examples

The [`examples/`](./examples) directory contains runnable end-to-end scripts: basic usage, custom policies, multi-framework, performance benchmarks, and streaming.

## Testing

```bash
npm test                # vitest, watch mode
npm test -- --run       # single pass (CI)
npm run lint
npm run type-check
```

## Compatibility

The JS SDK is wire-format compatible with the Klira Python SDK — span names, attributes, and resource attributes are emitted in lockstep. Cross-SDK parity is verified by an end-to-end diff harness; both SDKs produce identical OTLP for equivalent code paths.

## License

[Apache 2.0](./LICENSE)

## Support

- Documentation: https://docs.getklira.com
- Issues: https://github.com/kliraai/js-sdk/issues
- Email: ricardo@getklira.com
