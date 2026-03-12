/**
 * Klira SDK v2 — Core types
 *
 * Ground-up rewrite. No v1 types carried over except proven business logic types.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface KliraInitOptions {
  apiKey?: string;
  appName: string;
  environment?: string;
  tracingEnabled?: boolean;
  endpoint?: string;
  verbose?: boolean;
  debugMode?: boolean;

  // Policy loading
  policiesPath?: string;
  policyApiEndpoint?: string;

  // Guardrails
  guardrails?: {
    fastRulesEnabled?: boolean;
    augmentationEnabled?: boolean;
    llmFallbackEnabled?: boolean;
    failureMode?: 'open' | 'closed';
  };
}

/** Immutable config — frozen after Klira.init() */
export interface KliraConfig {
  readonly apiKey: string | undefined;
  readonly appName: string;
  readonly environment: string;
  readonly tracingEnabled: boolean;
  readonly endpoint: string;
  readonly verbose: boolean;
  readonly debugMode: boolean;
  readonly policiesPath: string | undefined;
  readonly policyApiEndpoint: string | undefined;
  readonly guardrails: Readonly<{
    fastRulesEnabled: boolean;
    augmentationEnabled: boolean;
    llmFallbackEnabled: boolean;
    failureMode: 'open' | 'closed';
  }>;
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

export interface PolicyMatch {
  readonly ruleId: string;
  readonly message: string;
  readonly blocked: boolean;
  readonly matched?: string;
  readonly metadata?: Record<string, unknown>;
  readonly description?: string;
  readonly policyName?: string;
  readonly category?: string;
  readonly direction?: 'input' | 'output';
  readonly position?: { start: number; end: number };
  readonly timestamp?: number;
}

export interface GuardrailResult {
  readonly allowed: boolean;
  readonly blocked: boolean;
  readonly matches: readonly PolicyMatch[];
  readonly guidelines?: readonly string[];
  readonly transformedInput?: string;
  readonly evaluationDuration?: number;
  readonly triggeredPolicies?: readonly string[];
  readonly direction?: 'input' | 'output';
}

export interface GuardrailOptions {
  checkInput?: boolean;
  checkOutput?: boolean;
  augmentPrompt?: boolean;
  policies?: string[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Wrapper options
// ---------------------------------------------------------------------------

export interface UserMessageOptions {
  userId: string;
  conversationId: string;
  messageId: string;
}

export interface ToolOptions {
  fhirResourceType?: string;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class KliraConfigError extends Error {
  public readonly code = 'CONFIG_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'KliraConfigError';
  }
}

export class KliraInitializationError extends Error {
  public readonly code = 'INITIALIZATION_ERROR' as const;
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'KliraInitializationError';
  }
}

export class KliraPolicyViolation extends Error {
  public readonly code = 'POLICY_VIOLATION' as const;
  public readonly matches: readonly PolicyMatch[];
  constructor(message: string, matches: PolicyMatch[] = []) {
    super(message);
    this.name = 'KliraPolicyViolation';
    this.matches = matches;
  }
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ---------------------------------------------------------------------------
// Policy types (carried over from v1 for YAML loading)
// ---------------------------------------------------------------------------

export interface PolicyDefinition {
  readonly name: string;
  readonly description?: string;
  readonly direction: 'inbound' | 'outbound' | 'both';
  readonly rules: readonly PolicyRule[];
}

export interface PolicyRule {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly pattern?: string;
  readonly keywords?: readonly string[];
  readonly action: 'block' | 'allow';
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Adapter types
// ---------------------------------------------------------------------------

export interface LLMCallOptions {
  model: string;
  messages?: Array<Record<string, unknown>>;
  guidelines?: readonly string[];
}

export interface LLMCallResult {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReasons?: string[];
  output?: string;
}

// ---------------------------------------------------------------------------
// Re-exports from contracts
// ---------------------------------------------------------------------------

export type {
  SpanAttribute,
  SpanDefinition,
  SpanValidationError,
} from '../contracts/trace-schema.js';

export type {
  GuardrailTransition,
} from '../contracts/guardrails-lifecycle.js';

export type {
  PhiEntityResult,
  PhiScanResult,
  PhiSpanAttributes,
} from '../contracts/phi-pipeline.js';

export type {
  BaseLLMAdapter,
  BaseFrameworkAdapter,
} from '../contracts/adapter-interfaces.js';
