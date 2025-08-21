# Klira AI SDK Examples

This directory contains comprehensive examples demonstrating how to use the Klira AI SDK with various LLM frameworks and providers.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file in the project root:
   ```env
   # Required
   OPENAI_API_KEY=your_openai_api_key_here
   
   # Optional but recommended
   KLIRA_API_KEY=your_klira_api_key_here
   
   # Optional for additional providers
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   GOOGLE_API_KEY=your_google_api_key_here
   TAVILY_API_KEY=your_tavily_api_key_here
   ```

3. **Run Examples**
   ```bash
   # OpenAI integration example
   npm run example:openai
   
   # LangChain.js integration example
   npm run example:langchain
   
   # Custom agent framework example
   npm run example:custom
   
   # Real providers demonstration
   npm run example:real-providers
   ```

## Examples Overview

### 1. OpenAI Integration (`openai-example.ts`)

Demonstrates the Klira AI SDK working with the official OpenAI Node.js SDK:

- **Basic chat completions** with guardrails
- **Streaming responses** with real-time policy enforcement
- **Function calling** with tools
- **Multi-turn conversations** with context
- **Code generation** with safety checks
- **Error handling** and policy violations

**Features showcased:**
- Input/output guardrails
- Prompt augmentation with safety guidelines
- Token usage tracking
- OpenTelemetry tracing
- Policy violation handling

### 2. LangChain.js Integration (`langchain-example.ts`)

Shows comprehensive integration with the LangChain.js framework:

- **Simple chains** with prompt templates
- **RAG (Retrieval Augmented Generation)** with vector stores
- **Tool-calling agents** with search capabilities
- **Streaming chains** with real-time monitoring
- **Multi-step research workflows**
- **Custom callback handling**

**Features showcased:**
- LangChain callback system integration
- Chain composition with guardrails
- Agent and tool monitoring
- Vector store integration
- Custom event handling

### 3. Custom Agent Framework (`custom-agent-example.ts`)

Demonstrates the framework-agnostic custom agent adapter:

- **Multiple provider types** (OpenAI-compatible, local models, HTTP APIs)
- **Function-based providers** with custom logic
- **Streaming support** across different providers
- **Multi-turn conversations** with context management
- **Error handling and retry logic**
- **Performance testing** scenarios

**Features showcased:**
- Provider abstraction layer
- Unified interface across different LLM services
- Custom business logic integration
- Resilient error handling
- Performance optimization

### 4. Real Providers Demo (`real-providers-demo.ts`)

**🔥 Production-ready example** with actual AI service integrations:

- **OpenAI GPT models** through official SDK
- **Anthropic Claude** via REST API
- **Google Gemini** via REST API
- **Multi-provider comparison** with same prompts
- **Streaming responses** with real-time guardrails
- **Error handling** and resilience testing

**Features showcased:**
- Real API integrations
- Cross-provider consistency
- Production error handling
- Rate limiting resilience
- Comprehensive observability

## Key Features Demonstrated

### 🛡️ Guardrails Engine
- **Input validation** - Check user prompts against policies
- **Output filtering** - Monitor and filter LLM responses
- **Prompt augmentation** - Add safety guidelines to system prompts
- **YAML-based policies** - Flexible, configurable policy definitions
- **Multi-layer enforcement** - FastRules, PolicyAugmentation, and LLM Fallback

### 📊 Observability & Tracing
- **OpenTelemetry integration** - Industry-standard tracing
- **Token usage tracking** - Monitor costs and usage patterns
- **Performance metrics** - Latency, throughput, error rates
- **Custom spans** - Detailed execution tracing
- **Dashboard integration** - Klira AI dashboard connectivity

### 🔄 Framework Adapters
- **OpenAI SDK** - Direct integration with official SDK
- **LangChain.js** - Callback-based integration
- **Custom Agent** - Framework-agnostic universal adapter
- **HTTP Provider** - Generic REST API integration
- **Function Provider** - Custom business logic integration

### 🌊 Streaming Support
- **Real-time guardrails** - Policy enforcement during streaming
- **Interrupt mechanisms** - Stop harmful content mid-stream
- **Content replacement** - Replace violations with safe alternatives
- **Progress tracking** - Monitor streaming progress and metrics

### ⚡ Performance Features
- **Concurrent processing** - Handle multiple requests efficiently
- **Retry mechanisms** - Automatic retry with exponential backoff
- **Error recovery** - Graceful degradation and fallback strategies
- **Memory optimization** - Efficient resource usage

## Running the Examples

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Valid API keys for the services you want to test

### Basic Usage
```bash
# Run a specific example
npx tsx examples/openai-example.ts

# Or with environment variables
OPENAI_API_KEY=your_key npx tsx examples/real-providers-demo.ts
```

### With Docker
```bash
# Build the container
docker build -t klira-examples .

# Run with environment file
docker run --env-file .env klira-examples npm run example:real-providers
```

## Example Output

### Successful Integration
```
🚀 Real Providers Demo - Klira AI SDK
=====================================
✅ Available API keys: OPENAI_API_KEY, KLIRA_API_KEY, ANTHROPIC_API_KEY

📝 Test Prompt: "Explain machine learning in exactly 2 sentences."

🔵 Example 1: OpenAI with Klira Integration
============================================
📤 Sending request to OpenAI...
✅ OpenAI Response:
Machine learning is a subset of artificial intelligence that enables computers to learn and improve from data without being explicitly programmed for each task. It uses algorithms to identify patterns in data and make predictions or decisions based on those patterns.
📊 Usage: { prompt_tokens: 25, completion_tokens: 35, total_tokens: 60 }
🔧 Model: gpt-3.5-turbo-0125
```

### Policy Violation Example
```
🛡️ Example 6: Testing Guardrails
===============================
⚠️ Input blocked by Klira guardrails: Policy violation detected - harmful content patterns
🛡️ Content blocked by guardrails: Request blocked due to policy: no-harmful-content
```

## Error Handling

All examples include comprehensive error handling:

- **API errors** - Invalid keys, rate limits, service outages
- **Network errors** - Connection timeouts, DNS failures
- **Policy violations** - Content blocked by guardrails
- **Configuration errors** - Missing environment variables

## Performance Considerations

- **Concurrent requests** - Examples handle multiple simultaneous requests
- **Memory usage** - Efficient streaming and garbage collection
- **Rate limiting** - Built-in backoff strategies
- **Caching** - Response caching where appropriate

## Contributing

To add new examples:

1. Create a new TypeScript file in the `examples/` directory
2. Follow the existing pattern for error handling and configuration
3. Include comprehensive comments and documentation
4. Add relevant tests in the `src/__tests__/` directory
5. Update this README with your example description

## Support

- **Documentation**: Check the main SDK documentation
- **Issues**: Report bugs or request features on GitHub
- **Community**: Join our Discord for discussions and support

## License

These examples are provided under the same license as the Klira AI SDK.