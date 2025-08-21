import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/vercel-ai/index': 'src/adapters/vercel-ai/index.ts',
    'adapters/langchain/index': 'src/adapters/langchain/index.ts',
    'adapters/openai/index': 'src/adapters/openai/index.ts',
    'adapters/custom/index': 'src/adapters/custom/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true, // Enable code splitting for better tree-shaking
  treeshake: true,
  minify: process.env.NODE_ENV === 'production',
  target: 'node18', // Target Node.js 18+ for better optimization
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
    'os',
    'child_process',
    'worker_threads',
  ],
  esbuildOptions(options) {
    options.conditions = ['module'];
    options.platform = 'node';
    options.treeShaking = true;
    options.bundle = true;
    // Better dead code elimination
    options.define = {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    };
  },
  // Generate separate CSS files if any
  extractCSS: true,
  // Optimize for production builds
  ...(process.env.NODE_ENV === 'production' && {
    // Production-specific optimizations
    publicDir: false,
    env: {
      NODE_ENV: 'production',
    },
  }),
});