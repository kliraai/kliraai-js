# Klira AI JavaScript/TypeScript SDK

The official JavaScript/TypeScript SDK for [Klira AI](https://getklira.com) - providing comprehensive **guardrails**, **observability**, and **compliance** for your GenAI applications.

## Requirements

- **Node.js**: 18.0.0 or higher
- **Package Manager**: npm, yarn, or pnpm
- **TypeScript**: 5.5.0+ (recommended)

## 🚀 Installation

Install directly from the GitHub repository:

```bash
npm install github:kliraai/kliraai-js
```

**Note**: The package will be built automatically using the `prepare` script. Ensure you have Node.js 18.0.0+ installed.

### What's Included

The SDK includes everything you need:
- Core guardrails engine with PII detection, content safety, and prompt injection protection
- OpenTelemetry integration for distributed tracing
- Custom adapter for framework-agnostic integration with any LLM provider
- Adapters for Vercel AI SDK, LangChain.js, and OpenAI SDK
- Decorator pattern support (works standalone, no framework required)
- Configuration management with environment variable support
- Custom policy framework

### Framework Dependencies (Optional)

The SDK works standalone with the **Custom Adapter** and **Decorator Pattern** - no additional dependencies required! Framework integrations are optional peer dependencies:

```bash
# For Custom Adapter (Framework-Agnostic) - NO additional dependencies needed!
# Works out of the box with: import { createKliraAgent } from 'klira/custom'

# For Vercel AI SDK integration
npm install ai @ai-sdk/openai

# For LangChain.js integration
npm install @langchain/core @langchain/openai

# For OpenAI SDK integration
npm install openai
```

**Note**: The **Custom Adapter** requires ZERO additional dependencies - perfect for custom LLM implementations, local models, or any AI provider. Framework adapters only need to be installed if using that specific integration.

## 🚀 Quick Start

### 1. Initialize the SDK

```typescript
import { KliraAI } from 'klira';

await KliraAI.init({
  apiKey: process.env.KLIRA_API_KEY, // Get your key at https://hub.getklira.com
  appName: 'my-ai-app',
  tracingEnabled: true,
  policyEnforcement: true,
});
```

### 2. Choose Your Integration Pattern

#### Option A: Vercel AI SDK (Recommended)

```typescript
import { createKliraVercelAI } from 'klira/vercel-ai';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const kliraAI = createKliraVercelAI({
  checkInput: true,
  checkOutput: true,
  augmentPrompt: true,
});

const safeGenerateText = kliraAI.wrapGenerateText(generateText);

const result = await safeGenerateText({
  model: openai('gpt-4'),
  prompt: 'Tell me about renewable energy',
});

console.log(result.text); // Safe, compliant response
```

#### Option B: LangChain.js

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { KliraCallbackHandler } from 'klira/langchain';

const model = new ChatOpenAI({
  callbacks: [new KliraCallbackHandler({
    guardrails: { enabled: true },
    observability: { enabled: true },
  })],
});

const response = await model.invoke('Your prompt here');
```

#### Option C: OpenAI SDK

```typescript
import { KliraOpenAI } from 'klira/openai';

const client = new KliraOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  guardrails: { enabled: true },
  observability: { enabled: true },
});

const completion = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Your prompt here' }],
});
```

#### Option D: Decorator Pattern

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
    return result;
  }
}
```

#### Option E: Custom Adapter (Framework-Agnostic)

**Perfect for: Custom LLM implementations, local models, or any AI provider**

```typescript
import { createKliraAgent, FunctionLLMProvider } from 'klira/custom';

// Wrap your custom LLM logic
const customLLM = async (request) => {
  // Your custom AI code here (API calls, local models, etc.)
  const response = await myCustomAIFunction(request.messages);

  return {
    content: response,
    model: 'my-custom-model',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  };
};

// Create Klira agent with full guardrails
const provider = new FunctionLLMProvider('my-provider', customLLM);
const agent = createKliraAgent({
  provider,
  checkInput: true,
  checkOutput: true,
  augmentPrompt: true,
  observability: { enabled: true },
});

// Use it like any other provider
const response = await agent.complete({
  messages: [{ role: 'user', content: 'Your prompt here' }],
});
```

**Key Benefits:**
- ✅ Works with **any LLM provider** (OpenAI-compatible, Anthropic, local models, custom APIs)
- ✅ **No framework dependencies** - use your existing code as-is
- ✅ Full guardrails, observability, and compliance support
- ✅ Streaming support with real-time guardrails
- ✅ Built-in providers: `HttpLLMProvider`, `FunctionLLMProvider`, or implement custom `LLMProvider`

See [Custom Adapter Examples](#custom-adapter-framework-agnostic) for more details.

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
- **🔧 Custom Adapter** (Framework-Agnostic) - Works with any LLM provider or custom code
- **LangChain.js** - Callback-based instrumentation
- **OpenAI SDK** - Direct wrapper support
- **Decorator Pattern** - Declarative guardrails for any function

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

### Custom Adapter (Framework-Agnostic)

**Perfect for custom LLM implementations, local models, or any AI provider without framework dependencies.**

The Custom Adapter provides a flexible, provider-agnostic way to integrate Klira AI guardrails with **any** LLM implementation - whether it's a custom API, local model, or proprietary system.

#### Quick Start

```typescript
import { createKliraAgent, FunctionLLMProvider } from 'klira/custom';

// Define your custom LLM logic
const customLLM = async (request) => {
  // Your existing LLM code here - API calls, local models, etc.
  const userMessage = request.messages.find(m => m.role === 'user')?.content;
  const response = await yourCustomAIFunction(userMessage);

  return {
    content: response,
    model: 'your-model-name',
    usage: {
      promptTokens: estimateTokens(userMessage),
      completionTokens: estimateTokens(response),
      totalTokens: estimateTokens(userMessage + response),
    },
  };
};

// Create provider and agent
const provider = new FunctionLLMProvider('my-custom-provider', customLLM);
const agent = createKliraAgent({
  provider,
  checkInput: true,         // Enable input guardrails
  checkOutput: true,        // Enable output guardrails
  augmentPrompt: true,      // Add safety guidelines to prompts
  observability: {
    enabled: true,          // Track in Klira dashboard
  },
});

// Use it!
const response = await agent.complete({
  messages: [
    { role: 'user', content: 'Your prompt here' },
  ],
});

console.log(response.content);
```

#### Provider Types

**1. Function-Based Provider** (Simplest)

```typescript
import { FunctionLLMProvider } from 'klira/custom';

const provider = new FunctionLLMProvider('my-provider', async (request) => {
  // Your custom logic
  return {
    content: 'AI response',
    model: 'custom-model',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  };
});
```

**2. HTTP-Based Provider** (For REST APIs)

```typescript
import { HttpLLMProvider } from 'klira/custom';

const provider = new HttpLLMProvider(
  'my-api',
  'https://api.example.com/v1/chat/completions',
  {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  }
);
```

**3. Custom Provider Class** (Full Control)

```typescript
import { type LLMProvider, type LLMRequest, type LLMResponse } from 'klira/custom';

class MyCustomProvider implements LLMProvider {
  name = 'my-custom-provider';

  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Your implementation here
    const response = await this.callYourAPI(request.messages);

    return {
      content: response.text,
      model: request.model || 'default-model',
      usage: {
        promptTokens: response.usage.input,
        completionTokens: response.usage.output,
        totalTokens: response.usage.total,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<Partial<LLMResponse>> {
    // Optional: implement streaming
    const stream = await this.streamYourAPI(request.messages);
    for await (const chunk of stream) {
      yield { content: chunk.text };
    }
  }

  private async callYourAPI(messages: any[]) {
    // Your API call logic
  }
}

const provider = new MyCustomProvider();
const agent = createKliraAgent({ provider });
```

#### Streaming Support

The Custom Adapter supports real-time streaming with guardrails:

```typescript
const streamingProvider = new FunctionLLMProvider(
  'streaming-provider',
  async (request) => {
    /* complete function */
  },
  async function* (request) {
    // Streaming function
    const words = ['Hello', 'world', 'from', 'custom', 'provider'];
    for (const word of words) {
      yield { content: word + ' ' };
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    yield { usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } };
  }
);

const agent = createKliraAgent({
  provider: streamingProvider,
  streaming: {
    enableGuardrails: true,    // Check output during streaming
    checkInterval: 3,          // Check every 3 chunks
    onViolation: 'interrupt',  // Stop stream on violation
  },
});

const stream = await agent.stream({
  messages: [{ role: 'user', content: 'Tell me a story' }],
});

for await (const chunk of stream) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
}
```

#### Advanced Configuration

```typescript
const agent = createKliraAgent({
  provider: myProvider,

  // Guardrails options
  checkInput: true,
  checkOutput: true,
  augmentPrompt: true,
  onInputViolation: 'exception',   // 'exception' | 'block' | 'continue'
  onOutputViolation: 'redact',     // 'exception' | 'redact' | 'continue'

  // Observability
  observability: {
    enabled: true,
    traceMetadata: true,
    trackTokenUsage: true,
  },

  // Streaming
  streaming: {
    enableGuardrails: true,
    checkInterval: 5,
    onViolation: 'interrupt',      // 'interrupt' | 'continue' | 'replace'
  },

  // MCP Protection (memory leak prevention)
  mcpProtection: {
    enabled: true,
    strictMode: false,
  },
});
```

#### Multi-turn Conversations

```typescript
let messages = [
  { role: 'user', content: 'Hello, tell me about AI safety' },
];

// First turn
let response = await agent.complete({ messages });
messages.push({ role: 'assistant', content: response.content });

// Second turn
messages.push({ role: 'user', content: 'What are the main challenges?' });
response = await agent.complete({ messages });
```

#### Use Cases

Perfect for:
- **Custom AI APIs**: Wrap proprietary or internal LLM APIs
- **Local Models**: Integrate Ollama, llama.cpp, or other local models
- **OpenAI-Compatible APIs**: Use with Together AI, Anyscale, Groq, etc.
- **Hybrid Systems**: Combine multiple LLM providers with custom logic
- **Legacy Systems**: Add guardrails to existing AI implementations
- **Testing & Development**: Mock LLM responses for testing

#### Complete Example

See our [custom-agent-example.ts](./examples/custom-agent-example.ts) for complete working examples including:
- OpenAI-compatible provider
- Local Llama/Ollama integration
- Function-based custom logic
- HTTP REST API integration
- Streaming with guardrails
- Multi-turn conversations
- Error handling and retries

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

# Custom policies path
KLIRA_POLICIES_PATH=/path/to/custom-policies.yaml

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

The SDK includes comprehensive default policies covering:
- PII detection (SSN, credit cards, emails, phone numbers, addresses)
- Content safety (hate speech, toxicity, harassment)
- Professional domain restrictions (medical, legal, financial advice)
- HR bias and discrimination prevention
- Security vulnerability protection
- Harmful content and self-harm prevention
- MCP memory leak prevention (context spillage, credential leakage)

### Using Custom Policies

You can optionally provide your own policies file to extend or override defaults:

```yaml
# custom-policies.yaml
version: "0.1.0"
updated_at: "2025-10-31"
policies:
  - id: "company_secrets_001"
    name: "Company Confidential Information Protection"
    direction: "both"
    domains: ["confidential", "proprietary", "internal", "secret"]
    description: "Prevent leakage of company-specific confidential information"
    action: "block"
    guidelines:
      - "Never share internal company codenames or project names"
      - "Do not disclose proprietary algorithms or business logic"
      - "Redact internal system names and infrastructure details"
    patterns:
      - "(?i)\\bPROJECT-[A-Z]+-\\d+\\b"
      - "(?i)\\b(CONFIDENTIAL|PROPRIETARY|INTERNAL ONLY)\\b"
      - "(?i)\\b(api-key-prod-[a-z0-9]+)\\b"

  - id: "brand_voice_001"
    name: "Brand Voice and Tone Guidelines"
    direction: "outbound"
    domains: ["communication", "brand", "voice", "tone"]
    description: "Ensure AI outputs align with company brand guidelines"
    action: "allow"
    guidelines:
      - "Maintain a professional yet approachable tone"
      - "Use inclusive and accessible language"
      - "Avoid technical jargon when communicating with end-users"
```

### Configure Custom Policies

**Via environment variable:**
```bash
KLIRA_POLICIES_PATH=/path/to/custom-policies.yaml
```

**Via initialization:**
```typescript
await KliraAI.init({
  apiKey: process.env.KLIRA_API_KEY,
  policiesPath: './config/custom-policies.yaml',
});

// Alternative: via guardrails config
await KliraAI.init({
  apiKey: process.env.KLIRA_API_KEY,
  guardrails: {
    policyPath: './config/custom-policies.yaml',
  },
});
```

### Policy File Schema

Each policy includes:
- **id**: Unique identifier for the policy
- **name**: Human-readable policy name
- **direction**: `"inbound"`, `"outbound"`, or `"both"`
- **domains**: Keywords for policy categorization and LLM fallback evaluation
- **description**: Policy purpose and compliance references
- **action**: `"block"` (reject content) or `"allow"` (permit with guidelines)
- **guidelines**: Instructions for LLM on how to handle related content
- **patterns**: Regex patterns for fast local pattern matching (optional)

### Policy Behavior

1. **Fast Rules**: Regex patterns are evaluated locally for privacy and performance
2. **LLM Fallback**: When `OPENAI_API_KEY` is set, complex content is evaluated using domain keywords and guidelines
3. **Policy Augmentation**: Guidelines are injected into prompts to proactively guide AI behavior
4. **Hierarchical Enforcement**: Custom policies supplement (not replace) built-in protections

**Note**: If no custom policies file is provided, the SDK uses comprehensive default policies suitable for most applications.

### Programmatic Policy Management

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

## 📦 Module System Support

The SDK supports both ESM and CommonJS:

### ES Modules (Recommended)

```typescript
import { KliraAI } from 'klira';
import { createKliraVercelAI } from 'klira/vercel-ai';
```

### CommonJS

```javascript
const { KliraAI } = require('klira');
const { createKliraVercelAI } = require('klira/vercel-ai');
```

## 📏 Bundle Size

The SDK is optimized for minimal bundle impact:

- **Core SDK**: ~150 KB (ESM, gzipped)
- **Custom Adapter**: ~75 KB (Framework-agnostic)
- **Vercel AI Adapter**: ~75 KB
- **LangChain Adapter**: ~50 KB
- **OpenAI Adapter**: ~75 KB

Tree-shaking is supported when using ES modules.

## 📚 Examples

Check out our [examples directory](./examples/) for complete working examples:

- **[Custom Agent](./examples/custom-agent-example.ts)** - Framework-agnostic integration with custom LLM providers
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

## ⚙️ TypeScript Configuration

For optimal TypeScript support:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true
  }
}
```

## 🔍 Verification

Verify your installation:

```typescript
import { KliraAI } from 'klira';

await KliraAI.init({
  apiKey: process.env.KLIRA_API_KEY,
  appName: 'test-app',
  verbose: true, // Enable debug logging
});

console.log('Klira AI SDK initialized successfully');
console.log('Version:', require('klira/package.json').version);
```

## 🛠️ Troubleshooting

### Common Issues

**Module not found errors:**
```bash
# Clear npm cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**TypeScript decorator errors:**
```json
// Add to tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

**Peer dependency warnings:**
Install the specific framework integration you need (warnings for unused frameworks can be ignored).

**OpenTelemetry initialization errors:**
Ensure Node.js version is 18.0.0 or higher.

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

This project is licensed under the Apache License 2.0 - see the [LICENSE](./LICENSE) file for details.

## 🆘 Support

- **Documentation**: [https://docs.getklira.com](https://docs.getklira.com)
- **GitHub Issues**: [https://github.com/kliraai/kliraai-js/issues](https://github.com/kliraai/kliraai-js/issues)
- **Email Support**: [ricardo@getklira.com](mailto:ricardo@getklira.com)

---

<div align="center">

**Built with ❤️ by the Klira AI team**

[Website](https://getklira.com) • [Documentation](https://docs.getklira.com) • [Twitter](https://twitter.com/kliraai) • [LinkedIn](https://linkedin.com/company/klira-ai)

</div>
