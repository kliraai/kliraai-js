/**
 * Klira SDK v2 — userMessage() HOF
 *
 * Creates the klira.user.message root span for a user interaction.
 */

import { withSpan } from './context.js';
import type { UserMessageOptions } from '../types/index.js';

export function userMessage<TArgs extends unknown[], TReturn>(
  options: UserMessageOptions,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs): Promise<TReturn> => {
    const result = withSpan(
      'klira.user.message',
      {
        'klira.entity_type': 'user_message',
        'klira.user_id': options.userId,
        'klira.conversation_id': options.conversationId,
        'klira.message_id': options.messageId,
      },
      async (_span) => {
        return await fn(...args);
      },
    );
    return result as Promise<TReturn>;
  };
}
