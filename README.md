# Klira AI JavaScript/TypeScript SDK

[![npm version](https://badge.fury.io/js/@kliraai%2Fsdk.svg)](https://badge.fury.io/js/@kliraai%2Fsdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The official JavaScript/TypeScript SDK for [Klira AI](https://getklira.com) - providing comprehensive **guardrails**, **observability**, and **compliance** for your GenAI applications.

## 🚀 Quick Start

### Installation

```bash
npm install klira

# For Vercel AI SDK integration (recommended)
npm install klira ai @ai-sdk/openai

# For LangChain.js integration
npm install klira @langchain/core @langchain/openai
```

### Basic Usage

```typescript
import { KliraAI } from 'klira';
import { createKliraVercelAI } from 'klira/vercel-ai';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

// 1. Initialize Klira AI
await KliraAI.init({
  apiKey: process.env.KLIRA_API_KEY, // Get your key at https://hub.getklira.com
  appName: 'my-ai-app',
  tracingEnabled: true,
});

// 2. Wrap your AI SDK with Klira guardrails
const kliraAI = createKliraVercelAI({
  checkInput: true,
  checkOutput: true,
  augmentPrompt: true,
});

const safeGenerateText = kliraAI.wrapGenerateText(generateText);

// 3. Use AI safely with automatic guardrails
const result = await safeGenerateText({
  model: openai('gpt-4'),
  prompt: 'Tell me about renewable energy',
});

console.log(result.text); // Safe, compliant response
```

## 🛡️ Features

### Comprehensive Guardrails
- **PII Detection & Redaction**: Automatically detect and handle emails, SSNs, phone numbers, credit cards
- **Content Safety**: Block harmful, violent, or inappropriate content
- **Prompt Injection Protection**: Defend against prompt manipulation attacks
- **Custom Policies**: Define your own rules and patterns
- **Real-time Streaming**: Apply guardrails to streaming responses

### Advanced Observability
- **OpenTelemetry Integration**: Full distributed tracing support
- **Automatic Instrumentation**: Zero-config observability for AI calls
- **Custom Metrics**: Track tokens, costs, latency, and violations
- **Framework Detection**: Automatic detection of AI frameworks in use

### Multi-Framework Support
- **🎯 Vercel AI SDK** (Primary focus) - Deep integration with middleware
- **LangChain.js** - Callback-based instrumentation
- **OpenAI SDK** - Direct wrapper support
- **Custom Applications** - Decorator and manual integration

### TypeScript-First
- **Full Type Safety**: Comprehensive TypeScript definitions
- **Decorator Support**: Clean, declarative guardrail application
- **Modern ESM**: Native ES modules with CommonJS compatibility

## 📖 Framework Integrations

### Vercel AI SDK (Recommended)

The Vercel AI SDK is our primary integration target, offering the smoothest developer experience:

```typescript
import { createKliraVercelAI } from 'klira/vercel-ai';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const kliraAI = createKliraVercelAI({
  checkInput: true,
  checkOutput: true,
  enableStreamingGuardrails: true,
});

// Streaming with real-time guardrails
const stream = kliraAI.wrapStreamText(streamText);
for await (const chunk of stream({
  model: openai('gpt-4'),
  prompt: 'Write a story about AI safety',
})) {
  console.log(chunk.textDelta);
}
```

### LangChain.js Integration

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { KliraCallbackHandler } from 'klira/langchain';

const model = new ChatOpenAI({
  callbacks: [new KliraCallbackHandler({
    guardrails: { enabled: true },
    observability: { enabled: true }
  })],
});
```

### OpenAI SDK Integration

```typescript
import { KliraOpenAI } from 'klira/openai';

const client = new KliraOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  guardrails: { enabled: true },
  observability: { enabled: true }
});
```

## 🎭 Decorator Usage

Apply guardrails declaratively using TypeScript decorators:

```typescript
import { guardrails } from 'klira';

class AIService {
  @guardrails({
    checkInput: true,
    checkOutput: true,
    onInputViolation: 'exception',
  })
  async generateContent(prompt: string): Promise<string> {
    // Your AI generation logic
    return await generateText({ model: openai('gpt-4'), prompt });
  }

  @guardrails({
    policies: ['pii-protection', 'content-safety'],
    augmentPrompt: true,
  })
  async sensitiveGeneration(input: string): Promise<string> {
    // Automatically enhanced with policy guidelines
    return await generateText({ model: openai('gpt-4'), prompt: input });
  }
}
```

## 📊 Observability & Monitoring

Klira AI provides comprehensive observability out of the box:

### Automatic Metrics
- **Request Metrics**: Success/failure rates, latency percentiles
- **Token Usage**: Input/output tokens, cost tracking
- **Guardrail Metrics**: Violation rates by type and severity
- **Performance**: P95/P99 latency, throughput

### OpenTelemetry Tracing
```typescript
// Traces are automatically generated for:
// - AI model calls (generateText, streamText, etc.)
// - Guardrail evaluations (input/output checks)
// - Framework-specific operations

// Set conversation ID for trace grouping (recommended)
const guardrails = KliraAI.getGuardrails();
guardrails.setConversationId('conv-abc123');

// If no conversation ID is provided, one will be auto-generated
// using timestamp: conv_1730405000000_abc123xyz

// Add custom metadata
KliraAI.setTraceMetadata({
  userId: 'user-123',
  sessionId: 'session-456',
  requestId: 'req-789',
});
```

### Custom Instrumentation
```typescript
const tracing = KliraAI.getTracing();

await tracing.traceLLMCall('custom-operation', metadata, async () => {
  // Your custom AI logic
  return await myCustomAIFunction();
});
```

## ⚙️ Configuration

### Environment Variables
```bash
# Required
KLIRA_API_KEY=klira_your_api_key_here

# Optional
KLIRA_APP_NAME=my-ai-application
KLIRA_TRACING_ENABLED=true
KLIRA_POLICY_ENFORCEMENT=true
KLIRA_VERBOSE=false
KLIRA_OPENTELEMETRY_ENDPOINT=https://api.getklira.com/v1/traces

# For LLM fallback evaluation (optional)
OPENAI_API_KEY=your_openai_key
```

### Programmatic Configuration
```typescript
await KliraAI.init({
  apiKey: 'klira_your_api_key',
  appName: 'my-ai-app',
  tracingEnabled: true,
  policyEnforcement: true,
  policiesPath: './custom-policies',
  verbose: true,
  environment: 'production',
});
```

## 🔧 Custom Policies

Define custom guardrail rules:

```typescript
const guardrails = KliraAI.getGuardrails();

// Add custom fast rule
guardrails.getFastRules().addRule({
  id: 'company-secrets',
  pattern: /\b(API-KEY-\w+|SECRET-\w+)\b/gi,
  action: 'block',
  severity: 'critical',
  description: 'Company secret pattern detected',
  replacement: '[REDACTED]',
});

// Add custom augmentation guideline
guardrails.getAugmentation().addGuideline({
  id: 'company-policy',
  category: 'compliance',
  guideline: 'Always follow company data handling policies.',
  priority: 9,
});
```

## 📚 Examples

Check out our [examples directory](./examples/) for complete working examples:

- **[Basic Usage](./examples/basic-usage.ts)** - Getting started with guardrails
- **[Streaming](./examples/streaming.ts)** - Real-time guardrails for streaming
- **[Custom Policies](./examples/custom-policies.ts)** - Defining custom rules
- **[Multi-Framework](./examples/multi-framework.ts)** - Using multiple AI frameworks

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- --grep "guardrails"

# Run in watch mode
npm test -- --watch
```

## 📖 API Reference

### Core Classes

- **`KliraAI`** - Main SDK class for initialization and global access
- **`GuardrailsEngine`** - Policy evaluation and enforcement
- **`KliraTracing`** - OpenTelemetry integration
- **`VercelAIAdapter`** - Vercel AI SDK integration

### Decorators

- **`@guardrails(options)`** - Declarative guardrail application

### Utilities

- **`createKliraVercelAI(options)`** - Vercel AI SDK wrapper factory
- **`evaluateContent(content, options)`** - Manual content evaluation

For detailed API documentation, see our [TypeScript definitions](./dist/index.d.ts).

## 🔒 Security & Privacy

- **No Data Storage**: Klira AI doesn't store your AI inputs or outputs
- **On-Device Processing**: Fast rules run locally for privacy
- **Configurable Endpoints**: Use your own infrastructure if needed
- **Audit Logging**: Comprehensive logs for compliance requirements

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🆘 Support

- **Documentation**: [https://docs.getklira.com](https://docs.getklira.com)
- **GitHub Issues**: [https://github.com/kliraai/kliraai-js/issues](https://github.com/kliraai/kliraai-js/issues)
- **Email Support**: [support@getklira.com](mailto:support@getklira.com)

## 🗺️ Roadmap

- [ ] Browser/Edge Runtime Support
- [ ] Additional Framework Adapters (Anthropic Claude, Google GenAI)
- [ ] Visual Policy Builder
- [ ] Advanced Streaming Analytics
- [ ] Multi-Language Detection
- [ ] Custom LLM Integration for Guardrails

---

<div align="center">

**Built with ❤️ by the Klira AI team**

[Website](https://getklira.com) • [Documentation](https://docs.getklira.com) • [Twitter](https://twitter.com/kliraai) • [LinkedIn](https://linkedin.com/company/klira-ai)

</div>