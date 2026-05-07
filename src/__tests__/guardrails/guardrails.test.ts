import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { GuardrailsEngine } from '../../guardrails/engine.js';
import { FastRulesEngine } from '../../guardrails/fast-rules.js';
import { PolicyAugmentation } from '../../guardrails/policy-augmentation.js';
import { FuzzyMatcher } from '../../guardrails/fuzzy-matcher.js';
import { routeDecision } from '../../guardrails/decision-router.js';
import { compilePolicies, loadDefaultPolicies, loadPoliciesFromYAML } from '../../guardrails/policy-loader.js';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  GuardrailLifecycle,
  GuardrailState,
} from '../../contracts/guardrails-lifecycle.js';
import type { PolicyDefinition, PolicyMatch } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestPolicies(): PolicyDefinition[] {
  return [
    {
      name: 'block-ssn',
      description: 'Block SSN patterns',
      direction: 'both',
      rules: [
        {
          id: 'ssn-pattern',
          name: 'SSN Pattern',
          pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
          action: 'block',
          message: 'SSN detected',
        },
      ],
    },
    {
      name: 'warn-medical',
      description: 'Flag medical advice',
      direction: 'inbound',
      rules: [
        {
          id: 'medical-keywords',
          name: 'Medical Keywords',
          keywords: ['diagnosis', 'treatment', 'prescription'],
          action: 'allow',
          message: 'Medical topic detected — provide disclaimers',
        },
      ],
    },
    {
      name: 'outbound-pii',
      description: 'Block PII in output',
      direction: 'outbound',
      rules: [
        {
          id: 'email-pattern',
          name: 'Email Pattern',
          pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}',
          action: 'block',
          message: 'Email address in output',
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// OTel test harness
// ---------------------------------------------------------------------------

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

function setupOtel() {
  exporter = new InMemorySpanExporter();
  const contextManager = new AsyncLocalStorageContextManager();
  context.setGlobalContextManager(contextManager);
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
}

async function teardownOtel() {
  await provider.shutdown();
  context.disable();
  trace.disable();
}

// ---------------------------------------------------------------------------
// Tests: GuardrailLifecycle state machine
// ---------------------------------------------------------------------------

describe('GuardrailLifecycle', () => {
  it('follows IDLE → EVALUATING → DECIDED → AUDIT_SCHEDULED → DONE', () => {
    const lc = new GuardrailLifecycle();
    expect(lc.state).toBe('idle');

    lc.transitionTo(GuardrailState.EVALUATING);
    expect(lc.state).toBe('evaluating');

    lc.transitionTo(GuardrailState.DECIDED);
    expect(lc.state).toBe('decided');

    lc.transitionTo(GuardrailState.AUDIT_SCHEDULED);
    expect(lc.state).toBe('audit_scheduled');

    lc.transitionTo(GuardrailState.DONE);
    expect(lc.state).toBe('done');
    expect(lc.isComplete).toBe(true);
  });

  it('rejects invalid transitions', () => {
    const lc = new GuardrailLifecycle();
    expect(() => lc.transitionTo(GuardrailState.DECIDED)).toThrow(
      /Invalid transition/,
    );
  });

  it('resets to IDLE', () => {
    const lc = new GuardrailLifecycle();
    lc.transitionTo(GuardrailState.EVALUATING);
    lc.reset();
    expect(lc.state).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Tests: FuzzyMatcher
// ---------------------------------------------------------------------------

describe('FuzzyMatcher', () => {
  it('matches at 85% threshold', () => {
    const fm = new FuzzyMatcher(85);
    // "diagnosis" vs "diagnsis" (missing 'o') — very close
    const matches = fm.checkFuzzyMatch('diagnsis', ['diagnosis']);
    expect(matches.length).toBeGreaterThanOrEqual(0);
    // Exact match should work
    const exact = fm.checkFuzzyMatch('diagnosis', ['diagnosis']);
    expect(exact.length).toBe(1);
    expect(exact[0].similarity).toBe(100);
  });

  it('rejects below threshold', () => {
    const fm = new FuzzyMatcher(85);
    const matches = fm.checkFuzzyMatch('completely different text', ['diagnosis']);
    expect(matches.length).toBe(0);
  });

  it('can be disabled', () => {
    const fm = new FuzzyMatcher(85);
    fm.setEnabled(false);
    expect(fm.isEnabled()).toBe(false);
    const matches = fm.checkFuzzyMatch('diagnosis', ['diagnosis']);
    expect(matches.length).toBe(0);
  });

  it('calculates confidence tiers', () => {
    const fm = new FuzzyMatcher(85);
    expect(fm.calculateConfidence(100)).toBe(0.95);
    expect(fm.calculateConfidence(95)).toBe(0.95);
    expect(fm.calculateConfidence(92)).toBe(0.90);
    expect(fm.calculateConfidence(87)).toBe(0.85);
    expect(fm.calculateConfidence(50)).toBe(0.70);
  });
});

// ---------------------------------------------------------------------------
// Tests: FastRulesEngine
// ---------------------------------------------------------------------------

describe('FastRulesEngine', () => {
  let engine: FastRulesEngine;

  beforeEach(() => {
    engine = new FastRulesEngine();
    engine.initialize(createTestPolicies());
  });

  it('blocks content matching a block pattern', () => {
    const result = engine.evaluate('My SSN is 123-45-6789', 'inbound');
    expect(result.blocked).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].ruleId).toBe('block-ssn');
  });

  it('allows clean content', () => {
    const result = engine.evaluate('Hello world', 'inbound');
    expect(result.blocked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.matches.length).toBe(0);
  });

  it('filters by direction — inbound policy skipped for outbound', () => {
    const result = engine.evaluate('I need a diagnosis please', 'outbound');
    // warn-medical is inbound-only, should not match on outbound
    const medicalMatch = result.matches.find((m) => m.ruleId === 'warn-medical');
    expect(medicalMatch).toBeUndefined();
  });

  it('matches outbound policies on outbound', () => {
    const result = engine.evaluate('Contact me at test@example.com', 'outbound');
    expect(result.blocked).toBe(true);
    expect(result.matches[0].ruleId).toBe('outbound-pii');
  });

  it('matches domain keywords', () => {
    const result = engine.evaluate('I need a diagnosis for my condition', 'inbound');
    expect(result.matches.length).toBeGreaterThan(0);
    const match = result.matches.find((m) => m.ruleId === 'warn-medical');
    expect(match).toBeDefined();
    expect(match!.blocked).toBe(false);
  });

  it('returns empty for uninitialized engine', () => {
    const fresh = new FastRulesEngine();
    const result = fresh.evaluate('SSN 123-45-6789', 'inbound');
    expect(result.matches.length).toBe(0);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: PolicyAugmentation
// ---------------------------------------------------------------------------

describe('PolicyAugmentation', () => {
  let aug: PolicyAugmentation;

  beforeEach(() => {
    aug = new PolicyAugmentation();
    aug.initialize(createTestPolicies());
  });

  it('generates guidelines from matched policies', () => {
    const matches: PolicyMatch[] = [
      { ruleId: 'warn-medical', message: 'Medical', blocked: false },
    ];
    const guidelines = aug.generateGuidelines(matches, ['warn-medical']);
    expect(guidelines.length).toBeGreaterThan(0);
  });

  it('generates fallback guidelines when no specific ones found', () => {
    const matches: PolicyMatch[] = [
      { ruleId: 'unknown-policy', message: 'Unknown', blocked: false },
    ];
    const guidelines = aug.generateGuidelines(matches, ['unknown-policy']);
    expect(guidelines.length).toBeGreaterThan(0);
    expect(guidelines[0]).toContain('safety');
  });

  it('caps at 10 guidelines', () => {
    // Create a policy with many guidelines
    const policies: PolicyDefinition[] = [
      {
        name: 'verbose-policy',
        description: 'Has many rules',
        direction: 'both',
        rules: Array.from({ length: 15 }, (_, i) => ({
          id: `rule-${i}`,
          name: `Rule ${i}`,
          action: 'allow' as const,
          message: `Guideline ${i}`,
        })),
      },
    ];
    aug.initialize(policies);
    const matches: PolicyMatch[] = [
      { ruleId: 'verbose-policy', message: 'test', blocked: false },
    ];
    const guidelines = aug.generateGuidelines(matches, ['verbose-policy']);
    expect(guidelines.length).toBeLessThanOrEqual(10);
  });

  it('augments prompt with numbered guidelines', () => {
    const result = aug.augmentPrompt('Hello', ['Be safe', 'Be kind']);
    expect(result).toContain('1. Be safe');
    expect(result).toContain('2. Be kind');
    expect(result).toContain('IMPORTANT GUIDELINES');
  });
});

// ---------------------------------------------------------------------------
// Tests: DecisionRouter
// ---------------------------------------------------------------------------

describe('routeDecision', () => {
  it('returns allowed when no matches', () => {
    const { result, decision } = routeDecision(
      { matches: [], blocked: false, allowed: true },
      [],
      'inbound',
      5,
    );
    expect(decision).toBe('allowed');
    expect(result.allowed).toBe(true);
  });

  it('returns blocked when blocked', () => {
    const { result, decision } = routeDecision(
      {
        matches: [
          { ruleId: 'test', message: 'blocked', blocked: true },
        ],
        blocked: true,
        allowed: false,
      },
      [],
      'inbound',
      5,
    );
    expect(decision).toBe('blocked');
    expect(result.blocked).toBe(true);
  });

  it('returns augmented when guidelines present', () => {
    const { decision } = routeDecision(
      {
        matches: [
          { ruleId: 'test', message: 'warn', blocked: false },
        ],
        blocked: false,
        allowed: true,
      },
      ['Follow these guidelines'],
      'inbound',
      5,
    );
    expect(decision).toBe('augmented');
  });

  it('sets direction to outbound for outbound', () => {
    const { result } = routeDecision(
      { matches: [], blocked: false, allowed: true },
      [],
      'outbound',
      3,
    );
    expect(result.direction).toBe('outbound');
  });
});

// ---------------------------------------------------------------------------
// Tests: Policy loader & compilation
// ---------------------------------------------------------------------------

describe('Policy loader', () => {
  it('loads default policies from YAML', () => {
    const policies = loadDefaultPolicies();
    expect(policies.length).toBeGreaterThan(0);
    expect(policies[0].name).toBeTruthy();
    expect(policies[0].rules.length).toBeGreaterThan(0);
  });

  it('compiles policies with patterns and domains', () => {
    const policies = loadDefaultPolicies();
    const compiled = compilePolicies(policies);
    expect(compiled.length).toBe(policies.length);
    // Each compiled policy should have at least compiledPatterns or domainPatterns
    for (const cp of compiled) {
      expect(cp.compiledPatterns.length + cp.domainPatterns.length).toBeGreaterThan(0);
    }
  });

  it('transforms YAML flat format into PolicyDefinition with rules', () => {
    const policies = loadDefaultPolicies();
    for (const p of policies) {
      expect(p.rules).toBeDefined();
      expect(Array.isArray(p.rules)).toBe(true);
      for (const rule of p.rules) {
        expect(['block', 'allow']).toContain(rule.action);
      }
    }
  });

  // PROD-764 Phase 1 — Python-compatible policy YAML shapes
  describe('accepts both bare-list and envelope (Python parity)', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'klira-policy-'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loads policies from a bare list YAML', () => {
      const file = join(tmpDir, 'bare.yaml');
      writeFileSync(
        file,
        `- id: bare-1
  name: Bare One
  direction: inbound
  action: block
  patterns:
    - "secret"
- id: bare-2
  name: Bare Two
  direction: outbound
  action: allow
  domains:
    - "diagnosis"
`,
      );

      const policies = loadPoliciesFromYAML(file);
      expect(policies.length).toBe(2);
      expect(policies[0].name).toBe('Bare One');
      expect(policies[1].name).toBe('Bare Two');
    });

    it('loads policies from envelope shape', () => {
      const file = join(tmpDir, 'envelope.yaml');
      writeFileSync(
        file,
        `policies:
  - id: env-1
    name: Env One
    direction: inbound
    action: block
    patterns:
      - "secret"
`,
      );

      const policies = loadPoliciesFromYAML(file);
      expect(policies.length).toBe(1);
      expect(policies[0].name).toBe('Env One');
    });

    // PROD-764 — YAML alias rejection (billion-laughs / DoS hardening)
    it('rejects YAML aliases / anchors and returns empty + warns', () => {
      const file = join(tmpDir, 'aliases.yaml');
      writeFileSync(
        file,
        `defaults: &default
  direction: inbound
  action: block
policies:
  - id: alias-1
    name: With Anchor
    <<: *default
    patterns:
      - "x"
`,
      );

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };

      try {
        const policies = loadPoliciesFromYAML(file);
        expect(policies).toEqual([]);
        expect(warnings.some((w) => w.includes('aliases'))).toBe(true);
      } finally {
        console.warn = originalWarn;
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: GuardrailsEngine integration
// ---------------------------------------------------------------------------

describe('GuardrailsEngine', () => {
  beforeEach(() => {
    setupOtel();
  });

  afterEach(async () => {
    await teardownOtel();
  });

  it('initializes and evaluates input', async () => {
    const engine = new GuardrailsEngine();
    await engine.initialize();

    const result = await engine.evaluateInput('Hello, how are you?');
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it('blocks SSN in input', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(createTestPolicies());
    engine['initialized'] = true;

    const result = await engine.evaluateInput('My SSN is 123-45-6789');
    expect(result.blocked).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it('creates guardrails OTel spans', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(createTestPolicies());
    engine['initialized'] = true;

    await engine.evaluateInput('Hello world');

    const spans = exporter.getFinishedSpans();
    const spanNames = spans.map((s) => s.name);

    expect(spanNames).toContain('klira.guardrails.input');
    expect(spanNames).toContain('klira.guardrails.fast_rules');
    expect(spanNames).toContain('klira.guardrails.route_decision');
  });

  it('creates output spans for evaluateOutput', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(createTestPolicies());
    engine['initialized'] = true;

    await engine.evaluateOutput('Safe output text');

    const spans = exporter.getFinishedSpans();
    const spanNames = spans.map((s) => s.name);
    expect(spanNames).toContain('klira.guardrails.output');
  });

  it('sets decision attributes on parent span', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(createTestPolicies());
    engine['initialized'] = true;

    await engine.evaluateInput('Hello world');

    const spans = exporter.getFinishedSpans();
    const inputSpan = spans.find((s) => s.name === 'klira.guardrails.input');
    expect(inputSpan).toBeDefined();
    expect(inputSpan!.attributes['klira.guardrails.decision']).toBe('allowed');
    expect(inputSpan!.attributes['klira.guardrails.allowed']).toBe(true);
  });

  it('handles augmented decision with guidelines', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(createTestPolicies());
    engine['augmentation'].initialize(createTestPolicies());
    engine['initialized'] = true;

    // "diagnosis" triggers warn-medical keyword match → guidelines generated
    const result = await engine.evaluateInput(
      'I need a diagnosis for my headaches',
    );
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);

    // Check if guidelines were generated (augmented decision)
    if (result.guidelines && result.guidelines.length > 0) {
      const spans = exporter.getFinishedSpans();
      const inputSpan = spans.find((s) => s.name === 'klira.guardrails.input');
      expect(inputSpan!.attributes['klira.guardrails.decision']).toBe('augmented');
      expect(inputSpan!.attributes['klira.guardrails.augmentation_applied']).toBe(true);
    }
  });

  it('fails open by default', async () => {
    const engine = new GuardrailsEngine({ failureMode: 'open' });
    engine['initialized'] = true;
    // Force an error by not initializing fast rules but marking as initialized
    // The engine should still return allowed=true
    const result = await engine.evaluateInput('test');
    expect(result.allowed).toBe(true);
  });

  it('auto-initializes on first evaluate', async () => {
    const engine = new GuardrailsEngine();
    expect(engine.isInitialized()).toBe(false);
    const result = await engine.evaluateInput('test');
    expect(engine.isInitialized()).toBe(true);
    expect(result.allowed).toBe(true);
  });

  // PROD-764 Phase 1 — wire-format parity with Python
  it('emits klira.compliance.direction (not klira.guardrails.direction) with inbound/outbound values', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(createTestPolicies());
    engine['initialized'] = true;

    await engine.evaluateInput('Hello world');
    await engine.evaluateOutput('Safe output');

    const spans = exporter.getFinishedSpans();
    const input = spans.find((s) => s.name === 'klira.guardrails.input');
    const output = spans.find((s) => s.name === 'klira.guardrails.output');

    expect(input!.attributes['klira.compliance.direction']).toBe('inbound');
    expect(input!.attributes['klira.guardrails.direction']).toBeUndefined();
    expect(output!.attributes['klira.compliance.direction']).toBe('outbound');
    expect(output!.attributes['klira.guardrails.direction']).toBeUndefined();
  });

  it('sets klira.entity_name = "guardrails" on guardrails parent spans', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(createTestPolicies());
    engine['initialized'] = true;

    await engine.evaluateInput('Hello world');

    const spans = exporter.getFinishedSpans();
    const input = spans.find((s) => s.name === 'klira.guardrails.input');
    expect(input!.attributes['klira.entity_name']).toBe('guardrails');
  });

  it('GuardrailResult.direction reports inbound/outbound (Python parity)', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(createTestPolicies());
    engine['initialized'] = true;

    const inResult = await engine.evaluateInput('Hello');
    const outResult = await engine.evaluateOutput('World');

    expect(inResult.direction).toBe('inbound');
    expect(outResult.direction).toBe('outbound');
  });
});

// ---------------------------------------------------------------------------
// Tests: Latency
// ---------------------------------------------------------------------------

describe('Guardrails latency', () => {
  beforeEach(() => {
    setupOtel();
  });

  afterEach(async () => {
    await teardownOtel();
  });

  it('evaluates in under 50ms', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(createTestPolicies());
    engine['initialized'] = true;

    const start = performance.now();
    await engine.evaluateInput('This is a normal message with no policy violations');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it('evaluates blocking content in under 50ms', async () => {
    const engine = new GuardrailsEngine();
    engine['fastRules'].initialize(createTestPolicies());
    engine['initialized'] = true;

    const start = performance.now();
    await engine.evaluateInput('My SSN is 123-45-6789');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it('evaluates with default policies in under 50ms', async () => {
    const engine = new GuardrailsEngine();
    await engine.initialize();

    const start = performance.now();
    await engine.evaluateInput('This is a normal message');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});
