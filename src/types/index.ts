/**
 * Klira SDK v2 — Core types
 *
 * Ground-up rewrite. No v1 types carried over except proven business logic types.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type PhiAnonymizationMethod = 'redact' | 'mask' | 'hash' | 'remove';

export interface KliraInitOptions {
  apiKey?: string;
  appName: string;
  environment?: string;
  tracingEnabled?: boolean;
  /**
   * Telemetry endpoint *base URL* — `/v1/traces` (or `/evals/v1/traces`
   * when `evalsRun` is set) is appended at export time. Legacy values
   * with a trailing `/v1/traces` are accepted for backward compatibility.
   */
  endpoint?: string;
  verbose?: boolean;
  debugMode?: boolean;

  // Policy loading
  policiesPath?: string;
  policyApiEndpoint?: string;

  // PROD-764 Phase 6 — Python parity surface
  /** Framework label propagated as `klira.framework` onto every Klira span. */
  framework?: string;
  /** Clinical domain hint stamped onto user-message spans. */
  clinicalDomain?: string;
  /** When set, traces are routed to `/evals/v1/traces` and tagged. */
  evalsRun?: string;
  /** Eval dataset identifier — surfaced on user-message spans. */
  datasetId?: string;
  /** Enable PHI anonymization at export. `true` = default 'redact'. */
  anonymization?: PhiAnonymizationMethod | true;
  /** When false, only `klira.phi.detected` is exported. */
  phiExportEntityDetails?: boolean;
  /** Built-in LLM fallback provider configuration. */
  llmFallback?: {
    provider?: 'openai' | 'anthropic';
    model?: string;
    apiKey?: string;
    onError?: 'allow' | 'block';
  };
  /** Remote policies endpoint base URL. */
  policiesEndpoint?: string;
  /** Disable any non-Klira tracer the user may already have installed. */
  disableExternalTracing?: boolean;
  /** Force-load policies from the remote endpoint instead of YAML/default. */
  useRemotePolicies?: boolean;
  /** Override the BatchSpanProcessor's scheduledDelayMillis (default 500). */
  batchDelayMs?: number;

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
  /** Telemetry endpoint as a *base URL* (no trailing `/v1/traces`). */
  readonly endpoint: string;
  readonly verbose: boolean;
  readonly debugMode: boolean;
  readonly policiesPath: string | undefined;
  readonly policyApiEndpoint: string | undefined;

  // PROD-764 Phase 6
  readonly framework: string | undefined;
  readonly clinicalDomain: string | undefined;
  readonly evalsRun: string | undefined;
  readonly datasetId: string | undefined;
  readonly anonymization: PhiAnonymizationMethod | undefined;
  readonly phiExportEntityDetails: boolean;
  readonly llmFallback: Readonly<{
    provider: 'openai' | 'anthropic' | undefined;
    model: string | undefined;
    apiKey: string | undefined;
    onError: 'allow' | 'block';
  }>;
  readonly policiesEndpoint: string | undefined;
  readonly disableExternalTracing: boolean;
  readonly useRemotePolicies: boolean;
  readonly batchDelayMs: number;

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
  readonly direction?: 'inbound' | 'outbound';
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
  readonly direction?: 'inbound' | 'outbound';
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
  /** Framework label propagated onto every child span (e.g. "langchain"). */
  framework?: string;
}

export interface ToolOptions {
  fhirResourceType?: string;
  /** Alias for `fhirResourceType`. Matches Python `@tool(fhir="Patient")`. */
  fhir?: string;
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
