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

  // Top-level guardrails options (for backward compatibility)
  llmFallbackEnabled?: boolean;

  // Guardrails configuration options
  guardrails?: {
    fastRulesEnabled?: boolean;
    augmentationEnabled?: boolean;
    llmFallbackEnabled?: boolean;
    failureMode?: 'open' | 'closed';
    policyPath?: string; // Alternative to top-level policiesPath
    apiEndpoint?: string;
    apiKey?: string;
  };
}

// Guardrails types
export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  pattern?: string;
  action: 'block' | 'warn' | 'allow';
  // severity field removed for Python SDK parity
}

export interface PolicyMatch {
  ruleId: string;
  message: string;
  // severity field removed for Python SDK parity
  blocked: boolean;
  metadata?: Record<string, any>;
  // Additional compliance fields
  description?: string;
  policyName?: string;
  category?: string;
  direction?: 'input' | 'output' | string;  // Allow any string for flexibility
  timestamp?: number;
  // Fast rules matching fields
  matched?: string;
  position?: {
    start: number;
    end: number;
  };
}

export interface GuardrailResult {
  allowed: boolean;
  blocked: boolean;
  matches: PolicyMatch[];
  transformedInput?: any;
  guidelines?: string[];
  reason?: string;
  // Compliance metadata
  evaluationDuration?: number;
  triggeredPolicies?: string[];
  policyUsage?: PolicyUsageInfo;
  direction?: 'input' | 'output';
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
  // Compliance tracking options
  enforcementMode?: 'monitor' | 'enforce';
  customTags?: Record<string, string>;
  trackPolicyUsage?: boolean;
}

export interface VercelAIAdapterOptions extends GuardrailOptions {
  enableStreamingGuardrails?: boolean;
  streamingCheckInterval?: number; // Check every N chunks
  autoInstrumentation?: boolean;
}

// Observability types
export interface TraceMetadata {
  // Hierarchy context (matching Python SDK)
  organizationId?: string;
  projectId?: string;
  agentId?: string;
  taskId?: string;
  toolId?: string;
  
  // Conversation context
  conversationId?: string;
  userId?: string;
  sessionId?: string;
  
  // Request context
  requestId?: string;
  
  // LLM context
  model?: string;
  provider?: string;
  framework?: string;
  
  // Agent context for compliance
  agentName?: string;
  agentVersion?: string;
  
  // Additional metadata
  [key: string]: any;
}

// Hierarchical context management (matching Python SDK)
export interface HierarchyContext {
  organizationId?: string;
  projectId?: string;
  agentId?: string;
  taskId?: string;
  toolId?: string;
  conversationId?: string;
  userId?: string;
}

export interface ConversationContext {
  conversationId: string;
  userId?: string;
}

export interface SpanAttributes {
  // Framework and LLM attributes
  'klira.framework': string;
  'klira.model'?: string;
  'klira.provider'?: string;
  'klira.input.tokens'?: number;
  'klira.output.tokens'?: number;
  'klira.cost.input'?: number;
  'klira.cost.output'?: number;
  'klira.guardrails.enabled'?: boolean;
  'klira.guardrails.violations'?: number;
  
  // Hierarchy context attributes (matching Python SDK)
  'klira.organization_id'?: string;
  'klira.project_id'?: string;
  'klira.agent_id'?: string;
  'klira.task_id'?: string;
  'klira.tool_id'?: string;
  'klira.conversation_id'?: string;
  'klira.user_id'?: string;
  'klira.session_id'?: string;
  'klira.request_id'?: string;
  
  // Policy violation attributes (for compliance reporting)
  'klira.policy.violation.ruleId'?: string;
  'klira.policy.violation.description'?: string;
  'klira.policy.violation.blocked'?: boolean;
  'klira.policy.violation.category'?: string;
  'klira.policy.violation.direction'?: string;
  
  // Policy usage tracking
  'klira.policy.usage.triggeredPolicies'?: string[];
  'klira.policy.usage.evaluationCount'?: number;
  'klira.policy.usage.direction'?: string;
  
  // Agent and compliance context
  'klira.agent.name'?: string;
  'klira.agent.version'?: string;
  'klira.policy.enforcement.mode'?: string;
  'klira.guardrails.evaluation.duration_ms'?: number;
  
  // Custom compliance tags
  'klira.compliance.tags'?: Record<string, string>;
  
  // Additional attributes
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
  public readonly matches: PolicyMatch[];
  public readonly code = 'POLICY_VIOLATION';

  constructor(message: string, matches: PolicyMatch[] = []) {
    super(message);
    this.name = 'KliraPolicyViolation';
    this.matches = matches;
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

// Compliance types
export interface PolicyUsageInfo {
  evaluatedPolicies: string[];
  triggeredPolicies: string[];
  evaluationCount: number;
  direction: 'input' | 'output';
  duration?: number;
}

export interface ComplianceMetadata {
  agentName?: string;
  agentVersion?: string;
  enforcementMode?: 'monitor' | 'enforce';
  customTags?: Record<string, string>;
  organizationId?: string;
  projectId?: string;
  evaluationTimestamp?: number;
}

export interface MatchSpanEvent {
  name: string;
  attributes: {
    'match.ruleId': string;
    'match.message': string;
    'match.blocked': boolean;
    'match.description'?: string;
    'match.category'?: string;
    'match.direction': string;
    'match.timestamp': number;
    'match.policyName'?: string;
  };
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