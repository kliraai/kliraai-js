// Copyright 2024 Klira AI
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Guardrails lifecycle contract — state machine specification for guardrails processing.
 *
 * Defines the expected sequence of operations, span creation, and data flow
 * for guardrails evaluation. This contract is validated by dedicated tests in
 * tests/contracts/ — it is not enforced at runtime by the engine.
 *
 * States:
 *   IDLE → EVALUATING → DECIDED → AUDIT_SCHEDULED → DONE
 *
 * Key invariants:
 *   - Guidelines pass via explicit GuardrailProcessingResult.guidelines,
 *     NEVER via OTel context. (Learning #7)
 *   - augmentation_applied set ONLY after verifying injection. (Learning #7)
 *   - Compliance audit spans are always async — never block hot path. (Learning #20)
 *   - Two policy actions only: block or allow. No "warn".
 *
 * Ported from Python SDK v2: klira/sdk/contracts/guardrails_lifecycle.py
 */

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export const GuardrailState = {
  IDLE: 'idle',
  EVALUATING: 'evaluating',
  DECIDED: 'decided',
  AUDIT_SCHEDULED: 'audit_scheduled',
  DONE: 'done',
} as const;

export type GuardrailState = (typeof GuardrailState)[keyof typeof GuardrailState];

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export interface GuardrailTransition {
  readonly fromState: GuardrailState;
  readonly toState: GuardrailState;
  readonly description: string;
  readonly spanCreated?: string;
  readonly isAsync?: boolean;
}

export const VALID_TRANSITIONS: readonly GuardrailTransition[] = [
  {
    fromState: GuardrailState.IDLE,
    toState: GuardrailState.EVALUATING,
    description:
      'FastRulesEngine starts evaluation. Creates guardrails.input or guardrails.output span.',
    spanCreated: 'klira.guardrails.input',
  },
  {
    fromState: GuardrailState.EVALUATING,
    toState: GuardrailState.DECIDED,
    description:
      'DecisionRouter determines action from FastRulesEngine results. ' +
      'Sets decision/allowed attributes on parent span. ' +
      'Returns GuardrailProcessingResult.',
  },
  {
    fromState: GuardrailState.DECIDED,
    toState: GuardrailState.AUDIT_SCHEDULED,
    description:
      'Compliance audit span scheduled asynchronously. ' +
      'Never blocks the hot path. Span type depends on decision: ' +
      'klira.compliance.{allowed|blocked|augmented|llm_fallback}.',
    spanCreated: 'klira.compliance.*',
    isAsync: true,
  },
  {
    fromState: GuardrailState.AUDIT_SCHEDULED,
    toState: GuardrailState.DONE,
    description: 'Result returned to caller. Lifecycle complete.',
  },
];

// ---------------------------------------------------------------------------
// Lifecycle tracker
// ---------------------------------------------------------------------------

/**
 * Tracks and validates guardrails lifecycle state transitions.
 *
 * @example
 * ```ts
 * const lifecycle = new GuardrailLifecycle();
 * lifecycle.transitionTo(GuardrailState.EVALUATING);
 * lifecycle.transitionTo(GuardrailState.DECIDED);
 * lifecycle.transitionTo(GuardrailState.AUDIT_SCHEDULED);
 * lifecycle.transitionTo(GuardrailState.DONE);
 * ```
 */
export class GuardrailLifecycle {
  private _state: GuardrailState = GuardrailState.IDLE;
  private readonly _validTransitions: Map<string, GuardrailTransition>;

  constructor() {
    this._validTransitions = new Map(
      VALID_TRANSITIONS.map(t => [`${t.fromState}->${t.toState}`, t]),
    );
  }

  get state(): GuardrailState {
    return this._state;
  }

  /**
   * Transition to a new state.
   *
   * @param newState - The target state.
   * @returns The transition that was applied.
   * @throws Error if the transition is not valid from the current state.
   */
  transitionTo(newState: GuardrailState): GuardrailTransition {
    const key = `${this._state}->${newState}`;
    const transition = this._validTransitions.get(key);

    if (!transition) {
      const validTargets = VALID_TRANSITIONS
        .filter(t => t.fromState === this._state)
        .map(t => t.toState);
      throw new Error(
        `Invalid transition: ${this._state} → ${newState}. ` +
        `Valid transitions from ${this._state}: [${validTargets.join(', ')}]`,
      );
    }

    this._state = newState;
    return transition;
  }

  /** Reset the lifecycle to IDLE state. */
  reset(): void {
    this._state = GuardrailState.IDLE;
  }

  /** Whether the lifecycle has reached DONE state. */
  get isComplete(): boolean {
    return this._state === GuardrailState.DONE;
  }
}
