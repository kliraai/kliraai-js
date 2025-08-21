/**
 * Publishing Configuration Tests
 * Validates package.json configuration for NPM publishing
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

describe('Publishing Configuration', () => {
  let packageJson: any;

  beforeAll(async () => {
    const packagePath = resolve(process.cwd(), 'package.json');
    const content = await readFile(packagePath, 'utf-8');
    packageJson = JSON.parse(content);
  });

  describe('Package Metadata', () => {
    it('should have required package fields', () => {
      expect(packageJson.name).toBe('@kliraai/sdk');
      expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(packageJson.description).toContain('Klira AI');
      expect(packageJson.license).toBe('MIT');
      expect(packageJson.author).toBe('Klira AI');
    });

    it('should have proper repository information', () => {
      expect(packageJson.repository).toEqual({
        type: 'git',
        url: 'https://github.com/kliraai/kliraai-js.git',
      });
      expect(packageJson.bugs).toEqual({
        url: 'https://github.com/kliraai/kliraai-js/issues',
      });
      expect(packageJson.homepage).toBe('https://github.com/kliraai/kliraai-js#readme');
    });

    it('should have appropriate keywords', () => {
      const expectedKeywords = [
        'ai', 'llm', 'observability', 'tracing', 
        'guardrails', 'opentelemetry', 'typescript'
      ];
      
      for (const keyword of expectedKeywords) {
        expect(packageJson.keywords).toContain(keyword);
      }
    });

    it('should specify Node.js engine requirements', () => {
      expect(packageJson.engines).toEqual({
        node: '>=18.0.0',
      });
    });
  });

  describe('Entry Points', () => {
    it('should have correct main entry points', () => {
      expect(packageJson.main).toBe('dist/index.js');
      expect(packageJson.module).toBe('dist/index.mjs');
      expect(packageJson.types).toBe('dist/index.d.ts');
    });

    it('should have proper export conditions', () => {
      const exports = packageJson.exports;
      
      // Main export
      expect(exports['.']).toEqual({
        types: './dist/index.d.ts',
        import: './dist/index.mjs',
        require: './dist/index.js',
      });

      // Adapter exports
      expect(exports['./openai']).toEqual({
        types: './dist/adapters/openai/index.d.ts',
        import: './dist/adapters/openai/index.mjs',
        require: './dist/adapters/openai/index.js',
      });

      expect(exports['./langchain']).toEqual({
        types: './dist/adapters/langchain/index.d.ts',
        import: './dist/adapters/langchain/index.mjs',
        require: './dist/adapters/langchain/index.js',
      });

      expect(exports['./custom']).toEqual({
        types: './dist/adapters/custom/index.d.ts',
        import: './dist/adapters/custom/index.mjs',
        require: './dist/adapters/custom/index.js',
      });
    });

    it('should include only necessary files', () => {
      const expectedFiles = ['dist', 'README.md', 'LICENSE'];
      expect(packageJson.files).toEqual(expectedFiles);
    });
  });

  describe('Dependencies', () => {
    it('should have production dependencies properly configured', () => {
      const deps = packageJson.dependencies;
      
      // Core OpenTelemetry dependencies
      expect(deps['@opentelemetry/api']).toBeDefined();
      expect(deps['@opentelemetry/sdk-node']).toBeDefined();
      expect(deps['@opentelemetry/exporter-trace-otlp-http']).toBeDefined();
      
      // Utility dependencies
      expect(deps['js-yaml']).toBeDefined();
      expect(deps['zod']).toBeDefined();
    });

    it('should have peer dependencies properly configured', () => {
      const peerDeps = packageJson.peerDependencies;
      
      // Framework peer dependencies
      expect(peerDeps['openai']).toBeDefined();
      expect(peerDeps['@langchain/core']).toBeDefined();
      expect(peerDeps['@langchain/openai']).toBeDefined();
      expect(peerDeps['ai']).toBeDefined();
    });

    it('should mark peer dependencies as optional', () => {
      const peerMeta = packageJson.peerDependenciesMeta;
      
      // All peer dependencies should be optional
      expect(peerMeta['ai'].optional).toBe(true);
      expect(peerMeta['openai'].optional).toBe(true);
      expect(peerMeta['@langchain/core'].optional).toBe(true);
      expect(peerMeta['@langchain/openai'].optional).toBe(true);
    });

    it('should not include development dependencies in production', () => {
      const deps = packageJson.dependencies;
      
      // Should not include dev tools in production deps
      expect(deps['vitest']).toBeUndefined();
      expect(deps['tsx']).toBeUndefined();
      expect(deps['tsup']).toBeUndefined();
      expect(deps['eslint']).toBeUndefined();
    });
  });

  describe('Scripts', () => {
    it('should have essential build scripts', () => {
      const scripts = packageJson.scripts;
      
      expect(scripts.build).toBeDefined();
      expect(scripts['build:prod']).toBeDefined();
      expect(scripts.test).toBeDefined();
      expect(scripts.lint).toBeDefined();
      expect(scripts['type-check']).toBeDefined();
    });

    it('should have publishing-related scripts', () => {
      const scripts = packageJson.scripts;
      
      expect(scripts.prepublishOnly).toBeDefined();
      expect(scripts.size).toBeDefined();
      expect(scripts['build:analyze']).toBeDefined();
    });

    it('should have proper prepublishOnly script', () => {
      const script = packageJson.scripts.prepublishOnly;
      
      // Should run production build, tests, and size check
      expect(script).toContain('build:prod');
      expect(script).toContain('test');
      expect(script).toContain('size');
    });
  });

  describe('Bundle Size Configuration', () => {
    it('should have size-limit configuration', () => {
      const sizeLimit = packageJson['size-limit'];
      expect(Array.isArray(sizeLimit)).toBe(true);
      expect(sizeLimit.length).toBeGreaterThan(0);
    });

    it('should have reasonable size limits', () => {
      const sizeLimit = packageJson['size-limit'];
      
      for (const config of sizeLimit) {
        expect(config.name).toBeDefined();
        expect(config.path).toBeDefined();
        expect(config.limit).toBeDefined();
        
        // Parse limit and ensure it's reasonable
        const limitKB = parseInt(config.limit);
        expect(limitKB).toBeGreaterThan(0);
        expect(limitKB).toBeLessThan(500); // Max 500KB per bundle
      }
    });

    it('should have bundlesize configuration', () => {
      const bundlesize = packageJson.bundlesize;
      expect(Array.isArray(bundlesize)).toBe(true);
      
      for (const config of bundlesize) {
        expect(config.path).toBeDefined();
        expect(config.maxSize).toBeDefined();
      }
    });
  });

  describe('TypeScript Configuration', () => {
    it('should export TypeScript types', () => {
      expect(packageJson.types).toBe('dist/index.d.ts');
      
      // Check adapter type exports
      const exports = packageJson.exports;
      for (const exportPath of Object.values(exports)) {
        if (typeof exportPath === 'object' && exportPath !== null) {
          expect((exportPath as any).types).toBeDefined();
        }
      }
    });

    it('should have proper type definitions structure', () => {
      const exports = packageJson.exports;
      
      // All exports should have types first (for proper resolution)
      for (const [key, exportConfig] of Object.entries(exports)) {
        if (typeof exportConfig === 'object' && exportConfig !== null) {
          const keys = Object.keys(exportConfig);
          expect(keys[0]).toBe('types');
        }
      }
    });
  });

  describe('Package Validation', () => {
    it('should not have security vulnerabilities in package.json', () => {
      // Check for common security issues
      const packageStr = JSON.stringify(packageJson);
      
      expect(packageStr).not.toContain('http://'); // Should use HTTPS
      expect(packageStr).not.toContain('git://'); // Should use HTTPS git URLs
    });

    it('should have consistent naming', () => {
      // Package name should match repository
      expect(packageJson.name).toBe('@kliraai/sdk');
      expect(packageJson.repository.url).toContain('kliraai-js');
    });

    it('should have proper license information', () => {
      expect(packageJson.license).toBe('MIT');
      // Could also check for LICENSE file existence
    });
  });

  describe('Publishing Workflow Validation', () => {
    it('should be ready for NPM publishing', () => {
      // Essential fields for publishing
      expect(packageJson.name).toBeDefined();
      expect(packageJson.version).toBeDefined();
      expect(packageJson.description).toBeDefined();
      expect(packageJson.main).toBeDefined();
      expect(packageJson.files).toBeDefined();
    });

    it('should have proper package scope', () => {
      expect(packageJson.name).toMatch(/^@kliraai\//);
    });

    it('should not include private field (should be publishable)', () => {
      expect(packageJson.private).toBeUndefined();
    });
  });
});