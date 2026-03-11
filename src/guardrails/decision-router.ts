/**
 * Klira SDK v2 — Decision router.
 *
 * Takes fast rules result → produces decision (allowed/blocked/augmented).
 */

import type { PolicyMatch, GuardrailResult } from '../types/index.js';
import type { FastRulesResult } from './fast-rules.js';

export type GuardrailDecision = 'allowed' | 'blocked' | 'augmented' | 'llm_fallback';

export function routeDecision(
  fastRulesResult: FastRulesResult,
  guidelines: readonly string[],
  direction: 'inbound' | 'outbound',
  evaluationDuration: number,
): { result: GuardrailResult; decision: GuardrailDecision } {
  const { matches, blocked, allowed } = fastRulesResult;

  let decision: GuardrailDecision;
  if (blocked) {
    decision = 'blocked';
  } else if (guidelines.length > 0) {
    decision = 'augmented';
  } else {
    decision = 'allowed';
  }

  const triggeredPolicies = [...new Set(matches.map((m) => m.ruleId))];

  const result: GuardrailResult = {
    allowed: !blocked,
    blocked,
    matches,
    guidelines: guidelines.length > 0 ? guidelines : undefined,
    evaluationDuration,
    triggeredPolicies,
    direction: direction === 'inbound' ? 'input' : 'output',
  };

  return { result, decision };
}
