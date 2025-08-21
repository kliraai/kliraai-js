import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/vercel-ai/index': 'src/adapters/vercel-ai/index.ts',
    'adapters/langchain/index': 'src/adapters/langchain/index.ts',
    'adapters/openai/index': 'src/adapters/openai/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: [
    // Core AI SDKs that are peer dependencies
    'ai',
    '@ai-sdk/openai',
    '@ai-sdk/anthropic', 
    '@ai-sdk/google',
    '@langchain/core',
    '@langchain/openai',
    'openai',
    // Node.js built-ins
    'node:*',
    'fs',
    'path',
    'crypto',
    'events',
    'stream',
    'util',
  ],
  esbuildOptions(options) {
    options.conditions = ['module'];
  },
});