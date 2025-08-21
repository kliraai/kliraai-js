export interface PolicyDefinition {
  id: string;
  name: string;
  direction: 'inbound' | 'outbound' | 'both';
  domains?: string[];
  description: string;
  action: 'block' | 'warn' | 'allow';
  guidelines?: string[];
  patterns?: string[];
  severity?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: {
    compliance?: string[];
    last_reviewed?: string;
    risk_score?: number;
    [key: string]: any;
  };
}

export interface PolicyFile {
  version: string;
  updated_at?: string;
  policies: PolicyDefinition[];
}

export interface CompiledPolicy extends PolicyDefinition {
  compiledPatterns?: RegExp[];
  domainPatterns?: RegExp[];
}

export interface PolicyViolation {
  ruleId: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blocked: boolean;
  matched?: string;
  position?: {
    start: number;
    end: number;
  };
}

export interface PolicyEvaluationResult {
  violations: PolicyViolation[];
  blocked: boolean;
  transformedContent?: string;
  matchedPolicies: string[];
  processingTime?: number;
}