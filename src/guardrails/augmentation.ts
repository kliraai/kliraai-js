/**
 * Klira SDK — Provider-shape augmentation helpers.
 *
 * Mirrors Python `klira/sdk/guardrails/augmentation.py`. Each helper
 * injects guideline text into the *natural* shape for the target
 * provider's API rather than always falling back to a system message.
 */

const HEADER = 'IMPORTANT GUIDELINES:';
const FOOTER = 'Please follow these guidelines in your response.';

function formatGuidelines(guidelines: readonly string[]): string {
  const numbered = guidelines.map((g, i) => `${i + 1}. ${g}`).join('\n');
  return `\n${HEADER}\n${numbered}\n${FOOTER}`;
}

export type ChatMessage = Record<string, unknown> & {
  role?: string;
  content?: unknown;
};

export function buildAugmentedMessages(
  messages: ChatMessage[],
  guidelines: readonly string[],
): ChatMessage[] {
  if (guidelines.length === 0) return messages;

  const text = formatGuidelines(guidelines);
  const result = [...messages];
  const idx = result.findIndex((m) => m.role === 'system');
  if (idx >= 0) {
    result[idx] = {
      ...result[idx],
      content: `${String(result[idx]?.content ?? '')}${text}`,
    };
  } else {
    result.unshift({ role: 'system', content: text.trim() });
  }
  return result;
}

/**
 * Anthropic native `system` kwarg: either a string or a content-block list.
 */
export function buildAugmentedSystemKwarg(
  systemValue: unknown,
  guidelines: readonly string[],
): unknown {
  if (guidelines.length === 0) return systemValue;
  const text = formatGuidelines(guidelines);

  if (typeof systemValue === 'string') {
    return `${systemValue}${text}`;
  }
  if (Array.isArray(systemValue)) {
    return [...systemValue, { type: 'text', text: text.trim() }];
  }
  return text.trim();
}

/**
 * OpenAI Responses API `instructions` kwarg.
 */
export function buildAugmentedInstructions(
  instructions: unknown,
  guidelines: readonly string[],
): string {
  if (guidelines.length === 0) return String(instructions ?? '');
  const text = formatGuidelines(guidelines);
  return instructions ? `${String(instructions)}${text}` : text.trim();
}

/**
 * Gemini `contents` array: merge guideline text into the first user turn
 * rather than prepending a synthetic user turn.
 *
 * Gemini's API rejects requests with two consecutive `user` turns, so the
 * earlier `unshift({ role: 'user', parts: [{text}] })` would 400 against
 * any request whose first content was already a user turn. We instead
 * concatenate the guideline block into the first user turn's first text
 * part, falling back to creating a single user turn when `contents` is
 * empty or starts with a non-user role (Gemini also requires the first
 * turn to be `role: 'user'`).
 *
 * If your project has a `systemInstruction` channel available (Gemini
 * models support it as a top-level kwarg), prefer that — it's the
 * cleanest mapping and matches what Anthropic does. We fold here rather
 * than reach for `systemInstruction` because the adapter doesn't see the
 * top-level `generateContent` kwargs, only the `contents` field.
 */
export function buildAugmentedContents(
  contents: unknown[] | undefined,
  guidelines: readonly string[],
): unknown[] {
  const list = Array.isArray(contents) ? [...contents] : [];
  if (guidelines.length === 0) return list;
  const text = formatGuidelines(guidelines).trim();

  // Empty or non-user first turn → create a single user turn.
  const first = list[0] as { role?: string; parts?: Array<{ text?: string }> } | undefined;
  if (!first || first.role !== 'user') {
    return [{ role: 'user', parts: [{ text }] }, ...list];
  }

  // Merge into first user turn's first text part.
  const parts = Array.isArray(first.parts) ? [...first.parts] : [];
  if (parts.length > 0 && typeof parts[0]?.text === 'string') {
    parts[0] = { ...parts[0], text: `${text}\n\n${parts[0].text}` };
  } else {
    parts.unshift({ text });
  }
  list[0] = { ...first, parts };
  return list;
}

/**
 * Wire-level verification — does the rendered payload contain the header?
 */
export function verifyAugmentation(
  payload: unknown,
  guidelines: readonly string[],
): { found: boolean; location: string } {
  if (guidelines.length === 0) return { found: true, location: 'noop' };
  const haystack = JSON.stringify(payload);
  return {
    found: haystack.includes(HEADER),
    location: haystack.includes('"system"')
      ? 'system'
      : haystack.includes('"instructions"')
        ? 'instructions'
        : haystack.includes('"contents"')
          ? 'contents'
          : 'messages',
  };
}
