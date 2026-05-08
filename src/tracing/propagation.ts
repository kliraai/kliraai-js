/**
 * Klira SDK — OTel-context propagation keys.
 *
 * Mirrors Python `klira/sdk/tracing/propagation.py:29-31`. Every Klira
 * wrapper reads these from the active context and stamps them onto the
 * span it creates, so child spans automatically inherit the user_id /
 * conversation_id / framework that the root span set.
 *
 * `klira.in_trace` is a boolean sentinel — `workflow()` checks it to
 * decide whether to auto-create a `klira.user.message` root span.
 */

import { context, createContextKey, type Context } from '@opentelemetry/api';

export const KLIRA_USER_ID_KEY = createContextKey('klira.user_id');
export const KLIRA_CONVERSATION_ID_KEY = createContextKey('klira.conversation_id');
export const KLIRA_FRAMEWORK_KEY = createContextKey('klira.framework');
export const KLIRA_IN_TRACE_KEY = createContextKey('klira.in_trace');

export interface KliraContextValues {
  readonly userId?: string;
  readonly conversationId?: string;
  readonly framework?: string;
}

export function setKliraContext(ctx: Context, values: KliraContextValues): Context {
  let next = ctx;
  if (values.userId !== undefined) next = next.setValue(KLIRA_USER_ID_KEY, values.userId);
  if (values.conversationId !== undefined) next = next.setValue(KLIRA_CONVERSATION_ID_KEY, values.conversationId);
  if (values.framework !== undefined) next = next.setValue(KLIRA_FRAMEWORK_KEY, values.framework);
  return next;
}

export function markInTrace(ctx: Context): Context {
  return ctx.setValue(KLIRA_IN_TRACE_KEY, true);
}

export function getKliraUserId(ctx: Context = context.active()): string | undefined {
  const v = ctx.getValue(KLIRA_USER_ID_KEY);
  return typeof v === 'string' ? v : undefined;
}

export function getKliraConversationId(ctx: Context = context.active()): string | undefined {
  const v = ctx.getValue(KLIRA_CONVERSATION_ID_KEY);
  return typeof v === 'string' ? v : undefined;
}

export function getKliraFramework(ctx: Context = context.active()): string | undefined {
  const v = ctx.getValue(KLIRA_FRAMEWORK_KEY);
  return typeof v === 'string' ? v : undefined;
}

export function isInKliraTrace(ctx: Context = context.active()): boolean {
  return ctx.getValue(KLIRA_IN_TRACE_KEY) === true;
}
