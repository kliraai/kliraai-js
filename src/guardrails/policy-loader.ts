/**
 * Klira SDK v2 — Policy loader (YAML sync at init + API async).
 *
 * Policy loading is synchronous at init time for YAML (fs.readFileSync).
 * API loading is async and happens during Klira.init().
 */

import fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import type { PolicyDefinition, PolicyRule } from '../types/index.js';

// ---------------------------------------------------------------------------
// Pattern cache with compiled regexes
// ---------------------------------------------------------------------------

const MAX_CACHE_SIZE = 1000;

export interface CompiledPolicy {
  readonly definition: PolicyDefinition;
  readonly compiledPatterns: RegExp[];
  readonly domainPatterns: RegExp[];
  readonly domains: readonly string[];
}

class PolicyCache {
  private patternCache = new Map<string, RegExp>();
  private domainCache = new Map<string, RegExp>();

  compilePattern(pattern: string): RegExp {
    if (this.patternCache.has(pattern)) return this.patternCache.get(pattern)!;
    if (this.patternCache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.patternCache.keys().next().value;
      if (firstKey !== undefined) this.patternCache.delete(firstKey);
    }

    try {
      // Strip Python-style inline flags like (?i)
      const cleaned = pattern.replace(/\(\?[a-z]+\)/g, '');
      const regex = new RegExp(cleaned, 'gi');
      this.patternCache.set(pattern, regex);
      return regex;
    } catch {
      const neverMatch = /(?!.*)/;
      this.patternCache.set(pattern, neverMatch);
      return neverMatch;
    }
  }

  compileDomainPattern(domain: string): RegExp {
    if (this.domainCache.has(domain)) return this.domainCache.get(domain)!;
    if (this.domainCache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.domainCache.keys().next().value;
      if (firstKey !== undefined) this.domainCache.delete(firstKey);
    }

    const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    this.domainCache.set(domain, regex);
    return regex;
  }
}

const cache = new PolicyCache();

// ---------------------------------------------------------------------------
// YAML loading (synchronous at init per Learning #9)
// ---------------------------------------------------------------------------

interface RawYAMLPolicy {
  readonly id: string;
  readonly name: string;
  readonly direction: string;
  readonly action: string;
  readonly description?: string;
  readonly patterns?: readonly string[];
  readonly domains?: readonly string[];
  readonly guidelines?: readonly string[];
  readonly rules?: readonly PolicyRule[];
}

interface PolicyEnvelope {
  readonly policies: RawYAMLPolicy[];
}

function unwrapPolicies(data: unknown): RawYAMLPolicy[] {
  if (Array.isArray(data)) return data as RawYAMLPolicy[];
  if (data && typeof data === 'object' && 'policies' in data) {
    const envelope = data as PolicyEnvelope;
    if (Array.isArray(envelope.policies)) return envelope.policies as RawYAMLPolicy[];
  }
  return [];
}

function validateRawPolicy(p: Record<string, unknown>): boolean {
  if (!p.id || typeof p.id !== 'string') return false;
  if (!p.name || typeof p.name !== 'string') return false;
  if (!p.direction || !['inbound', 'outbound', 'both'].includes(p.direction as string)) return false;
  if (!p.action || !['block', 'allow'].includes(p.action as string)) return false;
  return true;
}

/**
 * Transform a flat YAML policy (patterns/domains at top level) into PolicyDefinition
 * with rules array.
 */
function transformYAMLPolicy(raw: RawYAMLPolicy): PolicyDefinition {
  // If already has rules array, use it directly
  if (raw.rules && raw.rules.length > 0) {
    return {
      name: raw.name,
      description: raw.description,
      direction: raw.direction as PolicyDefinition['direction'],
      rules: raw.rules,
    };
  }

  // Transform flat YAML format into a single rule with all patterns/keywords
  const rule: PolicyRule = {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    action: raw.action as PolicyRule['action'],
    keywords: raw.domains,
    message: raw.guidelines?.[0],
  };

  // Create separate rules for each pattern (so each gets its own compiled regex)
  const rules: PolicyRule[] = [];

  if (raw.patterns && raw.patterns.length > 0) {
    for (const pattern of raw.patterns) {
      rules.push({
        ...rule,
        id: `${raw.id}_pattern`,
        pattern,
      });
    }
  }

  // If no patterns but has domains, create a single rule with keywords only
  if (rules.length === 0) {
    rules.push(rule);
  } else if (raw.domains && raw.domains.length > 0) {
    // Add keywords to the first rule
    (rules as any)[0] = { ...rules[0], keywords: raw.domains };
  }

  return {
    name: raw.name,
    description: raw.description,
    direction: raw.direction as PolicyDefinition['direction'],
    rules,
  };
}

/**
 * Reject YAML aliases / anchors before parsing — Python parity hardening.
 *
 * Aliases let one node be referenced from another, which is a known
 * billion-laughs / DoS vector and lets a hostile policy file expand to
 * arbitrary size in memory. Klira policies don't need them; if a file
 * uses them we drop the load and warn rather than risk the parse.
 *
 * Lexical detection on the raw source intentionally over-rejects
 * (matches inside string literals too). That's fine — a Klira policy
 * has no legitimate reason to embed a literal `*name` token.
 */
function containsYamlAliases(content: string): boolean {
  // Strip comments before scanning to avoid `# anchor &foo` false positives.
  const stripped = content.replace(/#[^\n]*/g, '');
  // `&anchor` or `*alias` as a YAML node (preceded by whitespace or `:` and a space).
  return /(^|[\s:])[&*][A-Za-z_][\w-]*/m.test(stripped);
}

export function loadPoliciesFromYAML(filePath: string): PolicyDefinition[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (containsYamlAliases(content)) {
      console.warn(
        `[Klira] YAML aliases / anchors are not allowed in policy files (${filePath}); ignoring.`,
      );
      return [];
    }
    const data = yaml.load(content);
    return unwrapPolicies(data)
      .filter((p: any) => validateRawPolicy(p))
      .map(transformYAMLPolicy);
  } catch {
    return [];
  }
}

export function loadDefaultPolicies(): PolicyDefinition[] {
  const candidates = [
    // dist path (production)
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'guardrails', 'default_policies.yaml'),
    // src path (development)
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'default_policies.yaml'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return loadPoliciesFromYAML(candidate);
      }
    } catch {
      continue;
    }
  }
  return [];
}

export async function loadPoliciesFromAPI(
  endpoint: string,
  apiKey?: string,
): Promise<PolicyDefinition[]> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(endpoint, { headers });
    if (!response.ok) return [];
    const data = await response.json();
    return unwrapPolicies(data)
      .filter((p: any) => validateRawPolicy(p))
      .map(transformYAMLPolicy);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Policy compilation
// ---------------------------------------------------------------------------

export function compilePolicies(policies: PolicyDefinition[]): CompiledPolicy[] {
  return policies.map((definition) => {
    const compiledPatterns: RegExp[] = [];
    const domainPatterns: RegExp[] = [];
    const domains: string[] = [];

    for (const rule of definition.rules ?? []) {
      if (rule.pattern) {
        compiledPatterns.push(cache.compilePattern(rule.pattern));
      }
      if (rule.keywords) {
        for (const kw of rule.keywords) {
          domainPatterns.push(cache.compileDomainPattern(kw));
          domains.push(kw);
        }
      }
    }

    return { definition, compiledPatterns, domainPatterns, domains };
  });
}
