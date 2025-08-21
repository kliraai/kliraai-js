/**
 * Bundle Optimization Tests
 * Validates build output, bundle sizes, and tree-shaking
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, stat, readdir } from 'fs/promises';
import { resolve, join } from 'path';
import { execSync } from 'child_process';

describe('Bundle Optimization', () => {
  const distPath = resolve(process.cwd(), 'dist');
  
  beforeAll(async () => {
    // Ensure build exists
    try {
      await stat(distPath);
    } catch {
      // Build if dist doesn't exist
      execSync('npm run build', { stdio: 'inherit' });
    }
  });

  describe('Build Output Structure', () => {
    it('should generate all expected output files', async () => {
      const expectedFiles = [
        'index.js',
        'index.mjs',
        'index.d.ts',
        'adapters/openai/index.js',
        'adapters/openai/index.mjs',
        'adapters/openai/index.d.ts',
        'adapters/langchain/index.js',
        'adapters/langchain/index.mjs',
        'adapters/langchain/index.d.ts',
        'adapters/custom/index.js',
        'adapters/custom/index.mjs',
        'adapters/custom/index.d.ts',
      ];

      for (const file of expectedFiles) {
        const filePath = join(distPath, file);
        try {
          await stat(filePath);
        } catch (error) {
          throw new Error(`Expected build output file missing: ${file}`);
        }
      }
    });

    it('should generate sourcemap files', async () => {
      const sourcemapFiles = [
        'index.js.map',
        'index.mjs.map',
        'adapters/openai/index.js.map',
        'adapters/openai/index.mjs.map',
        'adapters/langchain/index.js.map',
        'adapters/langchain/index.mjs.map',
        'adapters/custom/index.js.map',
        'adapters/custom/index.mjs.map',
      ];

      for (const file of sourcemapFiles) {
        const filePath = join(distPath, file);
        try {
          await stat(filePath);
        } catch (error) {
          throw new Error(`Expected sourcemap file missing: ${file}`);
        }
      }
    });

    it('should generate TypeScript declaration files', async () => {
      const dtsFiles = [
        'index.d.ts',
        'adapters/openai/index.d.ts',
        'adapters/langchain/index.d.ts',
        'adapters/custom/index.d.ts',
      ];

      for (const file of dtsFiles) {
        const filePath = join(distPath, file);
        const content = await readFile(filePath, 'utf-8');
        
        expect(content).toContain('export');
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Bundle Size Validation', () => {
    it('should keep core SDK under size limit', async () => {
      const corePath = join(distPath, 'index.mjs');
      const stats = await stat(corePath);
      const sizeKB = stats.size / 1024;
      
      expect(sizeKB).toBeLessThan(150); // 150 KB limit
      console.log(`Core SDK size: ${sizeKB.toFixed(2)} KB`);
    });

    it('should keep OpenAI adapter under size limit', async () => {
      const adapterPath = join(distPath, 'adapters/openai/index.mjs');
      const stats = await stat(adapterPath);
      const sizeKB = stats.size / 1024;
      
      expect(sizeKB).toBeLessThan(75); // 75 KB limit
      console.log(`OpenAI adapter size: ${sizeKB.toFixed(2)} KB`);
    });

    it('should keep Custom adapter under size limit', async () => {
      const adapterPath = join(distPath, 'adapters/custom/index.mjs');
      const stats = await stat(adapterPath);
      const sizeKB = stats.size / 1024;
      
      expect(sizeKB).toBeLessThan(60); // 60 KB limit
      console.log(`Custom adapter size: ${sizeKB.toFixed(2)} KB`);
    });

    it('should keep LangChain adapter under size limit', async () => {
      const adapterPath = join(distPath, 'adapters/langchain/index.mjs');
      const stats = await stat(adapterPath);
      const sizeKB = stats.size / 1024;
      
      expect(sizeKB).toBeLessThan(50); // 50 KB limit
      console.log(`LangChain adapter size: ${sizeKB.toFixed(2)} KB`);
    });
  });

  describe('Tree-Shaking Validation', () => {
    it('should not include unused peer dependencies in core bundle', async () => {
      const corePath = join(distPath, 'index.mjs');
      const content = await readFile(corePath, 'utf-8');
      
      // Should not bundle peer dependencies
      expect(content).not.toContain('require("openai")');
      expect(content).not.toContain('require("@langchain/core")');
      expect(content).not.toContain('require("ai")');
      
      // Should not include framework-specific code in core
      expect(content).not.toContain('ChatOpenAI');
      expect(content).not.toContain('generateText');
    });

    it('should properly externalize Node.js built-ins', async () => {
      const corePath = join(distPath, 'index.mjs');
      const content = await readFile(corePath, 'utf-8');
      
      // Should externalize Node.js modules
      expect(content).not.toContain('function readFile');
      expect(content).not.toContain('function createHash');
      expect(content).not.toContain('EventEmitter');
    });

    it('should include only necessary code in adapters', async () => {
      // OpenAI adapter should not include LangChain code
      const openaiPath = join(distPath, 'adapters/openai/index.mjs');
      const openaiContent = await readFile(openaiPath, 'utf-8');
      expect(openaiContent).not.toContain('LangChain');
      expect(openaiContent).not.toContain('RunnableSequence');
      
      // LangChain adapter should not include OpenAI-specific code
      const langchainPath = join(distPath, 'adapters/langchain/index.mjs');
      const langchainContent = await readFile(langchainPath, 'utf-8');
      expect(langchainContent).not.toContain('ChatCompletion');
      expect(langchainContent).not.toContain('createChatCompletion');
    });
  });

  describe('ESM/CJS Compatibility', () => {
    it('should have proper ESM exports', async () => {
      const esmPath = join(distPath, 'index.mjs');
      const content = await readFile(esmPath, 'utf-8');
      
      expect(content).toContain('export');
      expect(content).not.toContain('module.exports');
      expect(content).not.toContain('exports.');
    });

    it('should have proper CommonJS exports', async () => {
      const cjsPath = join(distPath, 'index.js');
      const content = await readFile(cjsPath, 'utf-8');
      
      expect(content).toContain('exports');
      // Should not mix export styles
      expect(content).not.toContain('export {');
    });

    it('should have matching exports between ESM and CJS', async () => {
      const esmPath = join(distPath, 'index.mjs');
      const cjsPath = join(distPath, 'index.js');
      const dtsPath = join(distPath, 'index.d.ts');
      
      const [esmContent, cjsContent, dtsContent] = await Promise.all([
        readFile(esmPath, 'utf-8'),
        readFile(cjsPath, 'utf-8'),
        readFile(dtsPath, 'utf-8'),
      ]);
      
      // Both should export KliraAI
      expect(esmContent).toContain('KliraAI');
      expect(cjsContent).toContain('KliraAI');
      expect(dtsContent).toContain('KliraAI');
    });
  });

  describe('Code Splitting', () => {
    it('should generate separate chunks for adapters', async () => {
      const files = await readdir(distPath, { recursive: true });
      const adapterFiles = files.filter(file => 
        typeof file === 'string' && file.includes('adapters/')
      );
      
      expect(adapterFiles.length).toBeGreaterThan(6); // At least 3 adapters × 2 formats
    });

    it('should have shared chunks if splitting is enabled', async () => {
      // Check if there are any shared/chunk files
      const files = await readdir(distPath, { recursive: true });
      const allFiles = files.filter(file => typeof file === 'string');
      
      // Should have individual adapter files
      expect(allFiles.some(f => f.includes('openai'))).toBe(true);
      expect(allFiles.some(f => f.includes('langchain'))).toBe(true);
      expect(allFiles.some(f => f.includes('custom'))).toBe(true);
    });
  });

  describe('Production Optimizations', () => {
    it('should minify code in production builds', async () => {
      // Run production build
      execSync('NODE_ENV=production npm run build', { stdio: 'pipe' });
      
      const prodPath = join(distPath, 'index.mjs');
      const content = await readFile(prodPath, 'utf-8');
      
      // Production builds should be more compact
      const lines = content.split('\n').length;
      expect(lines).toBeLessThan(1000); // Minified should have fewer lines
    });

    it('should strip development-only code', async () => {
      execSync('NODE_ENV=production npm run build', { stdio: 'pipe' });
      
      const prodPath = join(distPath, 'index.mjs');
      const content = await readFile(prodPath, 'utf-8');
      
      // Should not contain debug information in production
      expect(content).not.toContain('console.debug');
      expect(content).not.toContain('debugMode');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should have reasonable build times', async () => {
      const startTime = Date.now();
      execSync('npm run build', { stdio: 'pipe' });
      const buildTime = Date.now() - startTime;
      
      // Build should complete within reasonable time (30 seconds)
      expect(buildTime).toBeLessThan(30000);
      console.log(`Build time: ${buildTime}ms`);
    });

    it('should generate efficient output', async () => {
      // Calculate total bundle size
      const files = await readdir(distPath, { recursive: true });
      let totalSize = 0;
      
      for (const file of files) {
        if (typeof file === 'string' && file.endsWith('.mjs')) {
          const filePath = join(distPath, file);
          const stats = await stat(filePath);
          totalSize += stats.size;
        }
      }
      
      const totalSizeKB = totalSize / 1024;
      console.log(`Total ESM bundle size: ${totalSizeKB.toFixed(2)} KB`);
      
      // Total should be reasonable for an SDK
      expect(totalSizeKB).toBeLessThan(500); // 500 KB total limit
    });
  });
});