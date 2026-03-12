/**
 * Klira SDK v2 — Adapter barrel exports.
 */

export {
  withLLMSpan,
  setRequestAttributes,
  setResponseAttributes,
  augmentMessages,
} from './base-llm.js';

export { createOpenAIAdapter } from './openai/index.js';
export { createAnthropicAdapter } from './anthropic/index.js';
export { createGeminiAdapter } from './gemini/index.js';
export { createOllamaAdapter } from './ollama/index.js';
export { createLiteLLMAdapter } from './litellm/index.js';

// Framework adapters
export { createVercelAIAdapter } from './vercel-ai/index.js';
export { createLangChainAdapter } from './langchain/index.js';
export { instrumentLLMCall, createCustomAdapter } from './custom/index.js';
