import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
import { PolicyDefinition, PolicyFile, CompiledPolicy } from '../types/policies.js';

export interface PolicyAPIConfig {
  endpoint: string;
  apiKey: string;
  refreshInterval?: number;
  cachePolicy?: 'memory' | 'disk' | 'both';
}

export class PolicyCache {
  private compiledPatterns: Map<string, RegExp> = new Map();
  private domainPatterns: Map<string, RegExp> = new Map();
  private maxSize: number = 1000;

  compileWithCache(pattern: string): RegExp {
    if (this.compiledPatterns.has(pattern)) {
      return this.compiledPatterns.get(pattern)!;
    }

    try {
      // Clean up the pattern by removing unsupported JS regex features
      const cleanedPattern = this.cleanPattern(pattern);
      const regex = new RegExp(cleanedPattern, 'gi');
      
      // Implement simple LRU by clearing cache when full
      if (this.compiledPatterns.size >= this.maxSize) {
        const firstKey = this.compiledPatterns.keys().next().value;
        if (firstKey) {
          this.compiledPatterns.delete(firstKey);
        }
      }
      
      this.compiledPatterns.set(pattern, regex);
      return regex;
    } catch (error) {
      console.warn(`Failed to compile regex pattern: ${pattern}`, error);
      // Return a safe fallback regex that never matches
      return /(?!.*)/;
    }
  }

  /**
   * Clean regex pattern to be compatible with JavaScript
   */
  private cleanPattern(pattern: string): string {
    // Remove inline case-insensitive modifier (?i) since we use 'i' flag
    let cleaned = pattern.replace(/\(\?i\)/g, '');
    
    // Remove other unsupported inline modifiers that might be in Python patterns
    cleaned = cleaned.replace(/\(\?[a-zA-Z]+\)/g, '');
    
    return cleaned;
  }

  compileDomainPattern(domain: string): RegExp {
    const cacheKey = `domain:${domain}`;
    if (this.domainPatterns.has(cacheKey)) {
      return this.domainPatterns.get(cacheKey)!;
    }

    try {
      // Create a case-insensitive word boundary pattern for the domain
      const pattern = `\\b${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
      const regex = new RegExp(pattern, 'gi');
      
      if (this.domainPatterns.size >= this.maxSize) {
        const firstKey = this.domainPatterns.keys().next().value;
        if (firstKey) {
          this.domainPatterns.delete(firstKey);
        }
      }
      
      this.domainPatterns.set(cacheKey, regex);
      return regex;
    } catch (error) {
      console.warn(`Failed to compile domain pattern: ${domain}`, error);
      return /(?!.*)/;
    }
  }

  precompileAll(policies: PolicyDefinition[]): void {
    for (const policy of policies) {
      if (policy.patterns) {
        for (const pattern of policy.patterns) {
          this.compileWithCache(pattern);
        }
      }
      if (policy.domains) {
        for (const domain of policy.domains) {
          this.compileDomainPattern(domain);
        }
      }
    }
  }

  clear(): void {
    this.compiledPatterns.clear();
    this.domainPatterns.clear();
  }

  getStats(): { patternsCount: number; domainsCount: number } {
    return {
      patternsCount: this.compiledPatterns.size,
      domainsCount: this.domainPatterns.size,
    };
  }
}

export class PolicyLoader {
  private cache: PolicyCache = new PolicyCache();
  private apiConfig?: PolicyAPIConfig;
  private loadedPolicies: Map<string, PolicyFile> = new Map();

  constructor(apiConfig?: PolicyAPIConfig) {
    this.apiConfig = apiConfig;
  }

  async loadFromYAML(filePath: string): Promise<PolicyFile> {
    try {
      // Check if already loaded
      if (this.loadedPolicies.has(filePath)) {
        return this.loadedPolicies.get(filePath)!;
      }

      const absolutePath = path.resolve(filePath);
      const fileContent = await fs.readFile(absolutePath, 'utf8');
      
      const parsed = yaml.load(fileContent) as PolicyFile;
      
      if (!this.validatePolicyFile(parsed)) {
        throw new Error(`Invalid policy file format: ${filePath}`);
      }

      // Cache the loaded file
      this.loadedPolicies.set(filePath, parsed);
      
      return parsed;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new Error(`Policy file not found: ${filePath}`);
      }
      throw new Error(`Failed to load policy file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async loadFromJSON(filePath: string): Promise<PolicyFile> {
    try {
      const absolutePath = path.resolve(filePath);
      const fileContent = await fs.readFile(absolutePath, 'utf8');
      
      const parsed = JSON.parse(fileContent) as PolicyFile;
      
      if (!this.validatePolicyFile(parsed)) {
        throw new Error(`Invalid policy file format: ${filePath}`);
      }

      this.loadedPolicies.set(filePath, parsed);
      return parsed;
    } catch (error) {
      throw new Error(`Failed to load JSON policy file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async loadFromAPI(endpoint?: string): Promise<PolicyFile> {
    if (!this.apiConfig && !endpoint) {
      throw new Error('API configuration not provided');
    }

    const apiEndpoint = endpoint || this.apiConfig!.endpoint;
    const apiKey = this.apiConfig?.apiKey;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(apiEndpoint, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const policyFile = await response.json() as PolicyFile;
      
      if (!this.validatePolicyFile(policyFile)) {
        throw new Error('Invalid policy file format from API');
      }

      return policyFile;
    } catch (error) {
      throw new Error(`Failed to load policies from API: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  compilePolicies(policies: PolicyDefinition[]): CompiledPolicy[] {
    return policies.map(policy => this.compilePolicy(policy));
  }

  private compilePolicy(policy: PolicyDefinition): CompiledPolicy {
    const compiled: CompiledPolicy = { ...policy };

    // Compile regex patterns
    if (policy.patterns && policy.patterns.length > 0) {
      compiled.compiledPatterns = policy.patterns.map(pattern => 
        this.cache.compileWithCache(pattern)
      );
    }

    // Compile domain patterns
    if (policy.domains && policy.domains.length > 0) {
      compiled.domainPatterns = policy.domains.map(domain => 
        this.cache.compileDomainPattern(domain)
      );
    }

    return compiled;
  }

  private validatePolicyFile(policyFile: any): policyFile is PolicyFile {
    if (!policyFile || typeof policyFile !== 'object') {
      return false;
    }

    if (!policyFile.version || typeof policyFile.version !== 'string') {
      return false;
    }

    if (!Array.isArray(policyFile.policies)) {
      return false;
    }

    // Validate each policy
    for (const policy of policyFile.policies) {
      if (!this.validatePolicy(policy)) {
        return false;
      }
    }

    return true;
  }

  private validatePolicy(policy: any): policy is PolicyDefinition {
    if (!policy || typeof policy !== 'object') {
      return false;
    }

    const requiredFields = ['id', 'name', 'direction', 'description', 'action'];
    for (const field of requiredFields) {
      if (!policy[field] || typeof policy[field] !== 'string') {
        return false;
      }
    }

    const validDirections = ['inbound', 'outbound', 'both'];
    if (!validDirections.includes(policy.direction)) {
      return false;
    }

    const validActions = ['block', 'warn', 'allow'];
    if (!validActions.includes(policy.action)) {
      return false;
    }

    if (policy.severity) {
      const validSeverities = ['low', 'medium', 'high', 'critical'];
      if (!validSeverities.includes(policy.severity)) {
        return false;
      }
    }

    if (policy.patterns && !Array.isArray(policy.patterns)) {
      return false;
    }

    if (policy.domains && !Array.isArray(policy.domains)) {
      return false;
    }

    if (policy.guidelines && !Array.isArray(policy.guidelines)) {
      return false;
    }

    return true;
  }

  async loadDefault(): Promise<PolicyFile> {
    // Module-relative paths for both ESM and CJS
    const moduleDir = typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));

    // Try paths in priority order:
    // 1. dist/guardrails/ (npm package structure)
    // 2. src/guardrails/ (development structure)
    // 3. Legacy paths (backward compatibility)
    const possiblePaths = [
      // Production paths (npm package after build)
      path.join(moduleDir, '../guardrails/default_policies.yaml'),
      path.join(moduleDir, '../../guardrails/default_policies.yaml'),
      path.join(moduleDir, 'default_policies.yaml'),

      // Development paths (running from src/)
      path.join(moduleDir, '../src/guardrails/default_policies.yaml'),
      path.join(process.cwd(), 'src/guardrails/default_policies.yaml'),

      // Legacy paths (backward compatibility)
      './src/guardrails/default_policies.yaml',
      './guardrails/default_policies.yaml',
      '../guardrails/default_policies.yaml',
    ];

    for (const filePath of possiblePaths) {
      try {
        return await this.loadFromYAML(filePath);
      } catch (error) {
        // Continue to next path
        continue;
      }
    }

    throw new Error('Could not find default policies file in any expected location. Searched paths: ' + possiblePaths.join(', '));
  }

  clearCache(): void {
    this.cache.clear();
    this.loadedPolicies.clear();
  }

  getCacheStats() {
    return {
      cache: this.cache.getStats(),
      loadedFiles: this.loadedPolicies.size,
    };
  }
}