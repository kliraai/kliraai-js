/**
 * Core types for the Klira AI SDK
 */

// Base configuration interface
export interface KliraConfig {
  apiKey?: string;
  appName?: string;
  openTelemetryEndpoint?: string;
  tracingEnabled?: boolean;
  telemetryEnabled?: boolean;
  policiesPath?: string;
  policyEnforcement?: boolean;
  verbose?: boolean;
  debugMode?: boolean;
  environment?: string;
}

// Guardrails types
export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  pattern?: string;
  action: 'block' | 'warn' | 'transform';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface PolicyViolation {
  ruleId: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blocked: boolean;
  transformedContent?: string;
  metadata?: Record<string, any>;
}

export interface GuardrailResult {
  allowed: boolean;
  blocked: boolean;
  violations: PolicyViolation[];
  transformedInput?: any;
  guidelines?: string[];
  reason?: string;
}

export interface GuardrailOptions {
  checkInput?: boolean;
  checkOutput?: boolean;
  augmentPrompt?: boolean;
  onInputViolation?: 'exception' | 'alternative' | 'block';
  onOutputViolation?: 'exception' | 'alternative' | 'redact';
  violationResponse?: string;
  outputViolationResponse?: string;
  injectionStrategy?: 'auto' | 'instructions' | 'completion';
  policies?: string[];
}

// Observability types
export interface TraceMetadata {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  model?: string;
  provider?: string;
  framework?: string;
  [key: string]: any;
}

export interface SpanAttributes {
  'klira.framework': string;
  'klira.model'?: string;
  'klira.provider'?: string;
  'klira.input.tokens'?: number;
  'klira.output.tokens'?: number;
  'klira.cost.input'?: number;
  'klira.cost.output'?: number;
  'klira.guardrails.enabled'?: boolean;
  'klira.guardrails.violations'?: number;
  [key: string]: any;
}

// Framework adapter types
export interface FrameworkAdapter {
  name: string;
  detect(): boolean;
  wrap<T>(target: T, options?: any): T;
  applyGuardrails(input: any, options?: GuardrailOptions): Promise<GuardrailResult>;
  captureMetrics(metadata: TraceMetadata): Promise<void>;
}

// Streaming types
export interface StreamChunk {
  type: 'text' | 'tool_call' | 'finish' | 'error';
  content: string;
  metadata?: Record<string, any>;
}

export interface StreamProcessor {
  process<T>(stream: AsyncIterable<T>, options?: GuardrailOptions): AsyncIterable<T>;
}

// Error types
export class KliraPolicyViolation extends Error {
  public readonly violations: PolicyViolation[];
  public readonly code = 'POLICY_VIOLATION';

  constructor(message: string, violations: PolicyViolation[] = []) {
    super(message);
    this.name = 'KliraPolicyViolation';
    this.violations = violations;
  }
}

export class KliraConfigError extends Error {
  public readonly code = 'CONFIG_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'KliraConfigError';
  }
}

export class KliraInitializationError extends Error {
  public readonly code = 'INITIALIZATION_ERROR';

  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'KliraInitializationError';
  }
}

// Utility types
export type AsyncFunction = (...args: any[]) => Promise<any>;
export type SyncFunction = (...args: any[]) => any;
export type AnyFunction = AsyncFunction | SyncFunction;

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}