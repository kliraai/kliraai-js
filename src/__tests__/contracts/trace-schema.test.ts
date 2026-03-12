import { describe, it, expect } from 'vitest';
import {
  SCHEMA_VERSION,
  ATTRIBUTE_REGISTRY,
  SPAN_DEFINITIONS,
  validateSpan,
  AttributeType,
  type SpanDefinition,
} from '../../contracts/trace-schema.js';

describe('Trace Schema Contract', () => {
  it('has a valid schema version', () => {
    expect(SCHEMA_VERSION).toBe('0.6.1');
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has at least 20 span definitions', () => {
    expect(Object.keys(SPAN_DEFINITIONS).length).toBeGreaterThanOrEqual(20);
  });

  it('has at least 40 attributes in the registry', () => {
    expect(Object.keys(ATTRIBUTE_REGISTRY).length).toBeGreaterThanOrEqual(40);
  });

  describe('self-consistency: every span required attribute exists in registry', () => {
    for (const [spanName, defn] of Object.entries(SPAN_DEFINITIONS)) {
      for (const attr of defn.requiredAttributes) {
        it(`${spanName} → required attr "${attr.name}" is in ATTRIBUTE_REGISTRY`, () => {
          expect(ATTRIBUTE_REGISTRY[attr.name]).toBeDefined();
          expect(ATTRIBUTE_REGISTRY[attr.name].name).toBe(attr.name);
        });
      }
    }
  });

  describe('self-consistency: every span optional attribute exists in registry', () => {
    for (const [spanName, defn] of Object.entries(SPAN_DEFINITIONS)) {
      for (const attr of defn.optionalAttributes ?? []) {
        it(`${spanName} → optional attr "${attr.name}" is in ATTRIBUTE_REGISTRY`, () => {
          expect(ATTRIBUTE_REGISTRY[attr.name]).toBeDefined();
        });
      }
    }
  });

  describe('parent constraints reference valid span patterns', () => {
    const validPatterns = new Set<string>(['root']);
    for (const defn of Object.values(SPAN_DEFINITIONS)) {
      validPatterns.add(defn.name);
      if (defn.nameTemplate) {
        // e.g., 'klira.workflow.*' for 'klira.workflow.{name}'
        const prefix = defn.nameTemplate.split('{')[0];
        validPatterns.add(prefix + '*');
      }
    }

    for (const [spanName, defn] of Object.entries(SPAN_DEFINITIONS)) {
      for (const constraint of defn.parentConstraints) {
        it(`${spanName} parent constraint "${constraint}" is a known span pattern`, () => {
          const isValid = validPatterns.has(constraint) ||
            [...validPatterns].some(p => {
              if (p.endsWith('*')) {
                return constraint.startsWith(p.slice(0, -1));
              }
              return constraint === p;
            });
          expect(isValid).toBe(true);
        });
      }
    }
  });

  describe('attribute types are valid', () => {
    const validTypes = new Set(Object.values(AttributeType));
    for (const [name, attr] of Object.entries(ATTRIBUTE_REGISTRY)) {
      it(`${name} has a valid type`, () => {
        expect(validTypes.has(attr.attrType)).toBe(true);
      });
    }
  });

  describe('core spans are defined', () => {
    const requiredSpans = [
      'klira.user.message',
      'klira.workflow.{name}',
      'klira.agent.{name}',
      'klira.task.{name}',
      'klira.tool.{name}',
      'klira.llm.{provider}',
      'klira.guardrails.input',
      'klira.guardrails.output',
      'klira.compliance.allowed',
      'klira.compliance.blocked',
      'klira.compliance.augmented',
      'klira.evals.test_case',
    ];

    for (const span of requiredSpans) {
      it(`${span} is defined`, () => {
        expect(SPAN_DEFINITIONS[span]).toBeDefined();
      });
    }
  });

  describe('validateSpan()', () => {
    it('validates a correct user message span', () => {
      const errors = validateSpan('klira.user.message', {
        'klira.entity_type': 'user_message',
        'klira.user_id': 'user-1',
        'klira.conversation_id': 'conv-1',
        'klira.message_id': 'msg-1',
      }, null);
      expect(errors).toEqual([]);
    });

    it('rejects missing required attributes', () => {
      const errors = validateSpan('klira.user.message', {
        'klira.entity_type': 'user_message',
      }, null);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.error.includes('klira.user_id'))).toBe(true);
    });

    it('validates a templated span name', () => {
      const errors = validateSpan('klira.workflow.my-flow', {
        'klira.entity_type': 'workflow',
        'klira.entity_name': 'my-flow',
      }, null);
      expect(errors).toEqual([]);
    });

    it('rejects invalid entity_type value', () => {
      const errors = validateSpan('klira.workflow.my-flow', {
        'klira.entity_type': 'invalid_type',
        'klira.entity_name': 'my-flow',
      }, null);
      expect(errors.some(e => e.error.includes('not in allowed values'))).toBe(true);
    });

    it('validates parent constraints for nested spans', () => {
      const errors = validateSpan('klira.agent.my-agent', {
        'klira.entity_type': 'agent',
        'klira.entity_name': 'my-agent',
      }, 'klira.workflow.parent');
      expect(errors).toEqual([]);
    });

    it('rejects invalid parent for span', () => {
      const errors = validateSpan('klira.guardrails.input', {
        'klira.entity_type': 'guardrails',
        'klira.compliance.direction': 'inbound',
      }, 'klira.compliance.allowed');
      expect(errors.some(e => e.error.includes('Invalid parent'))).toBe(true);
    });

    it('rejects unknown span name', () => {
      const errors = validateSpan('klira.unknown.thing', {}, null);
      expect(errors.some(e => e.error.includes('Unknown span name'))).toBe(true);
    });

    it('validates LLM span with gen_ai attributes', () => {
      const errors = validateSpan('klira.llm.openai', {
        'klira.entity_type': 'llm',
        'gen_ai.system': 'openai',
        'gen_ai.request.model': 'gpt-4o',
      }, 'klira.workflow.my-flow');
      expect(errors).toEqual([]);
    });

    it('validates compliance span attributes', () => {
      const errors = validateSpan('klira.compliance.allowed', {
        'klira.entity_type': 'compliance',
        'klira.compliance.direction': 'inbound',
        'klira.compliance.decision.allowed': true,
        'klira.compliance.decision.action': 'allow',
        'klira.compliance.decision.layer': 'fast_rules',
        'klira.guardrails.augmentation_applied': false,
        'klira.guardrails.guidelines_count': 0,
        'klira.compliance.audit_required': false,
        'klira.compliance.human_review_required': false,
      }, 'klira.guardrails.input');
      expect(errors).toEqual([]);
    });
  });
});
