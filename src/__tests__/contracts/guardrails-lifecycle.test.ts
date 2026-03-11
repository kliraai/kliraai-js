import { describe, it, expect } from 'vitest';
import {
  GuardrailState,
  GuardrailLifecycle,
  VALID_TRANSITIONS,
} from '../../contracts/guardrails-lifecycle.js';

describe('Guardrails Lifecycle Contract', () => {
  describe('state machine states', () => {
    it('has 5 states', () => {
      const states = Object.values(GuardrailState);
      expect(states).toHaveLength(5);
      expect(states).toContain('idle');
      expect(states).toContain('evaluating');
      expect(states).toContain('decided');
      expect(states).toContain('audit_scheduled');
      expect(states).toContain('done');
    });
  });

  describe('valid transitions', () => {
    it('has 4 transitions forming a linear chain', () => {
      expect(VALID_TRANSITIONS).toHaveLength(4);
    });

    it('follows IDLE → EVALUATING → DECIDED → AUDIT_SCHEDULED → DONE', () => {
      const chain = VALID_TRANSITIONS.map(t => `${t.fromState}->${t.toState}`);
      expect(chain).toEqual([
        'idle->evaluating',
        'evaluating->decided',
        'decided->audit_scheduled',
        'audit_scheduled->done',
      ]);
    });

    it('marks DECIDED → AUDIT_SCHEDULED as async', () => {
      const auditTransition = VALID_TRANSITIONS.find(
        t => t.fromState === GuardrailState.DECIDED && t.toState === GuardrailState.AUDIT_SCHEDULED,
      );
      expect(auditTransition?.isAsync).toBe(true);
    });
  });

  describe('GuardrailLifecycle', () => {
    it('starts in IDLE state', () => {
      const lifecycle = new GuardrailLifecycle();
      expect(lifecycle.state).toBe(GuardrailState.IDLE);
    });

    it('allows valid full lifecycle', () => {
      const lifecycle = new GuardrailLifecycle();
      lifecycle.transitionTo(GuardrailState.EVALUATING);
      expect(lifecycle.state).toBe(GuardrailState.EVALUATING);

      lifecycle.transitionTo(GuardrailState.DECIDED);
      expect(lifecycle.state).toBe(GuardrailState.DECIDED);

      lifecycle.transitionTo(GuardrailState.AUDIT_SCHEDULED);
      expect(lifecycle.state).toBe(GuardrailState.AUDIT_SCHEDULED);

      lifecycle.transitionTo(GuardrailState.DONE);
      expect(lifecycle.state).toBe(GuardrailState.DONE);
      expect(lifecycle.isComplete).toBe(true);
    });

    it('rejects invalid transitions', () => {
      const lifecycle = new GuardrailLifecycle();
      expect(() => lifecycle.transitionTo(GuardrailState.DECIDED)).toThrow('Invalid transition');
      expect(() => lifecycle.transitionTo(GuardrailState.DONE)).toThrow('Invalid transition');
    });

    it('rejects skipping states', () => {
      const lifecycle = new GuardrailLifecycle();
      lifecycle.transitionTo(GuardrailState.EVALUATING);
      expect(() => lifecycle.transitionTo(GuardrailState.AUDIT_SCHEDULED)).toThrow('Invalid transition');
    });

    it('rejects backward transitions', () => {
      const lifecycle = new GuardrailLifecycle();
      lifecycle.transitionTo(GuardrailState.EVALUATING);
      lifecycle.transitionTo(GuardrailState.DECIDED);
      expect(() => lifecycle.transitionTo(GuardrailState.EVALUATING)).toThrow('Invalid transition');
    });

    it('reset() returns to IDLE', () => {
      const lifecycle = new GuardrailLifecycle();
      lifecycle.transitionTo(GuardrailState.EVALUATING);
      lifecycle.transitionTo(GuardrailState.DECIDED);
      lifecycle.reset();
      expect(lifecycle.state).toBe(GuardrailState.IDLE);
      expect(lifecycle.isComplete).toBe(false);
    });

    it('isComplete is false until DONE', () => {
      const lifecycle = new GuardrailLifecycle();
      expect(lifecycle.isComplete).toBe(false);
      lifecycle.transitionTo(GuardrailState.EVALUATING);
      expect(lifecycle.isComplete).toBe(false);
      lifecycle.transitionTo(GuardrailState.DECIDED);
      expect(lifecycle.isComplete).toBe(false);
      lifecycle.transitionTo(GuardrailState.AUDIT_SCHEDULED);
      expect(lifecycle.isComplete).toBe(false);
      lifecycle.transitionTo(GuardrailState.DONE);
      expect(lifecycle.isComplete).toBe(true);
    });
  });
});
