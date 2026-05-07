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
 * Gemini `contents` array: prepend a system-style content with the guidelines.
 */
export function buildAugmentedContents(
  contents: unknown[] | undefined,
  guidelines: readonly string[],
): unknown[] {
  const list = Array.isArray(contents) ? [...contents] : [];
  if (guidelines.length === 0) return list;
  const text = formatGuidelines(guidelines).trim();
  list.unshift({ role: 'user', parts: [{ text }] });
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
