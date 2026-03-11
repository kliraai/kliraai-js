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
 * Adapter interface contracts — abstract base interfaces for LLM and framework adapters.
 *
 * Every LLM adapter (OpenAI, etc.) implements BaseLLMAdapter.
 * Every framework adapter (Vercel AI, LangChain, Custom) implements BaseFrameworkAdapter.
 *
 * Key invariants:
 *   - LLM adapters patch client methods and verify the patch took effect. (Learning #14)
 *   - Framework adapters suppress native telemetry and verify suppression. (Learning #13)
 *   - adapt_tool() must preserve callability — framework objects are stored
 *     as metadata, never replace the callable. (Learning #12)
 *   - Adapters only adapt — core span creation logic stays in wrappers.
 *
 * Ported from Python SDK v2:
 *   - klira/sdk/adapters/base_llm.py
 *   - klira/sdk/adapters/base_framework.py
 */

import type { Span } from '@opentelemetry/api';

// ---------------------------------------------------------------------------
// Truncation limits (shared across all adapters)
// ---------------------------------------------------------------------------

export const PROMPT_TRUNCATION_LIMIT = 10000;
export const OUTPUT_TRUNCATION_LIMIT = 5000;

// ---------------------------------------------------------------------------
// BaseLLMAdapter
// ---------------------------------------------------------------------------

/**
 * Abstract interface for LLM client adapters.
 *
 * Implementations must provide:
 *   - patch(): Monkey-patch the client's API call method.
 *   - verifyPatch(): Confirm the patch took effect.
 *
 * The base provides shared utilities for span creation, attribute
 * setting, and outbound guardrails execution so that all adapters produce
 * identical span structures. (Learning #1: define trace schema as contract.)
 */
export interface BaseLLMAdapter {
  /**
   * Monkey-patch the client's API call method.
   *
   * After patching, must call verifyPatch() to confirm it took effect.
   * Throws if verification fails. (Learning #14)
   */
  patch(clientClass: unknown): void;

  /**
   * Confirm the patch took effect.
   *
   * @returns true if the patch is active. Throws if not.
   */
  verifyPatch(clientClass: unknown): boolean;

  /**
   * Set standard request attributes on an LLM span.
   *
   * @param span - The active LLM span.
   * @param model - Model name (no provider prefix).
   * @param messages - Optional message list for prompt capture.
   */
  setRequestAttributes(
    span: Span,
    model: string,
    messages?: Array<Record<string, unknown>>,
  ): void;

  /**
   * Set standard response attributes on an LLM span.
   *
   * @param span - The active LLM span.
   * @param attrs - Response attributes to set.
   */
  setResponseAttributes(
    span: Span,
    attrs: {
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      finishReasons?: string[];
    },
  ): void;
}

// ---------------------------------------------------------------------------
// BaseFrameworkAdapter
// ---------------------------------------------------------------------------

/**
 * Abstract interface for framework adapters.
 *
 * Implementations must provide:
 *   - adaptWorkflow(): Wrap workflow for framework-specific behavior.
 *   - adaptAgent(): Wrap agent for framework-specific behavior.
 *   - adaptTask(): Wrap task for framework-specific behavior.
 *   - adaptTool(): Wrap tool for framework-specific behavior.
 *   - patchFramework(): Apply patches AND disable native telemetry.
 *   - verifySuppression(): Confirm native telemetry is disabled.
 *
 * Key invariants:
 *   - adaptTool() must preserve callability — framework objects are
 *     stored as metadata, never replace the callable. (Learning #12)
 *   - patchFramework() must disable the framework's native telemetry
 *     to prevent duplicate traces. (Learning #13)
 */
export interface BaseFrameworkAdapter {
  /** The framework name (e.g., 'vercel-ai', 'langchain'). */
  readonly frameworkName: string;

  /** Wrap a workflow function for framework-specific behavior. */
  adaptWorkflow<T extends (...args: unknown[]) => unknown>(fn: T): T;

  /** Wrap an agent function for framework-specific behavior. */
  adaptAgent<T extends (...args: unknown[]) => unknown>(fn: T): T;

  /** Wrap a task function for framework-specific behavior. */
  adaptTask<T extends (...args: unknown[]) => unknown>(fn: T): T;

  /**
   * Wrap a tool function for framework-specific behavior.
   *
   * CRITICAL: The returned value must be callable with the same
   * signature as the original function. Framework-specific objects
   * must be stored as metadata on the function, NOT returned in
   * place of the callable. (Learning #12)
   */
  adaptTool<T extends (...args: unknown[]) => unknown>(fn: T): T;

  /**
   * Apply class-level patches to the framework AND disable the
   * framework's native telemetry.
   *
   * Must call verifySuppression() after patching to confirm native
   * telemetry is disabled. (Learning #13)
   *
   * Known native telemetry to suppress:
   *   - Vercel AI SDK: Don't pass experimental_telemetry (opt-in)
   *   - LangChain.js: Set LANGCHAIN_TRACING_V2=false
   *
   * @throws Error if verifySuppression() fails.
   */
  patchFramework(): void;

  /**
   * Confirm native telemetry is disabled.
   *
   * @returns true if suppression is active. Throws if not.
   */
  verifySuppression(): boolean;
}
