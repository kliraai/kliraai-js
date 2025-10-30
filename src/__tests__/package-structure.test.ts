/**
 * Integration tests for npm package structure
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('Package Structure', () => {
  describe('Distribution Files', () => {
    it('should have YAML policy files in dist/guardrails/', async () => {
      const yamlPath = path.join(process.cwd(), 'dist/guardrails/default_policies.yaml');

      try {
        await fs.access(yamlPath, fs.constants.R_OK);
      } catch (error) {
        throw new Error(
          `YAML policy file missing from dist/: ${yamlPath}\n` +
          'Run "npm run build" to generate distribution files.'
        );
      }
    });

    it('should have valid YAML syntax in policy files', async () => {
      const yamlPath = path.join(process.cwd(), 'dist/guardrails/default_policies.yaml');
      const fileContent = await fs.readFile(yamlPath, 'utf8');

      expect(() => yaml.load(fileContent)).not.toThrow();

      const parsed = yaml.load(fileContent) as any;
      expect(parsed.version).toBeDefined();
      expect(parsed.policies).toBeInstanceOf(Array);
      expect(parsed.policies.length).toBeGreaterThan(10);
    });

    it('should match source YAML file content', async () => {
      const sourcePath = path.join(process.cwd(), 'src/guardrails/default_policies.yaml');
      const distPath = path.join(process.cwd(), 'dist/guardrails/default_policies.yaml');

      const sourceContent = await fs.readFile(sourcePath, 'utf8');
      const distContent = await fs.readFile(distPath, 'utf8');

      expect(distContent).toBe(sourceContent);
    });
  });

  describe('PolicyLoader Integration', () => {
    it('should load default policies from dist/ in production mode', async () => {
      // This test simulates running from node_modules/klira
      const { PolicyLoader } = await import('../guardrails/policy-loader.js');
      const loader = new PolicyLoader();

      // Should not throw
      const policyFile = await loader.loadDefault();

      expect(policyFile.version).toBeDefined();
      expect(policyFile.policies.length).toBeGreaterThan(10);
    });
  });
});
