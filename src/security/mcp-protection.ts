/**
 * Model Context Protocol (MCP) Protection
 * Prevents prompt injection, data exfiltration, and unauthorized access through MCP channels
 */

import type { Logger } from '../types/index.js';
import { getLogger } from '../config/index.js';

export interface MCPViolation {
  type: 'prompt_injection' | 'data_exfiltration' | 'unauthorized_access' | 'privilege_escalation' | 'context_pollution';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  pattern: string;
  context: string;
  timestamp: Date;
  requestId?: string;
}

export interface MCPProtectionConfig {
  enabled: boolean;
  strictMode: boolean;
  allowedDomains: string[];
  blockedPatterns: string[];
  maxContextSize: number;
  sanitizeOutputs: boolean;
  logViolations: boolean;
  onViolation: 'block' | 'sanitize' | 'log';
}

export interface MCPValidationResult {
  isValid: boolean;
  violations: MCPViolation[];
  sanitizedContent?: string;
  confidence: number;
  riskScore: number;
}

/**
 * Core MCP Protection Engine
 * Implements multiple layers of protection against MCP-based attacks
 */
export class MCPProtection {
  private logger: Logger;
  private config: MCPProtectionConfig;

  // Known dangerous patterns for MCP exploitation
  private static readonly INJECTION_PATTERNS = [
    // Direct prompt injection attempts
    /(?:ignore|forget|disregard).{0,20}(?:previous|above|earlier|system).{0,20}(?:instructions|prompts|rules|directives)/gi,
    /(?:new|updated|latest).{0,20}(?:instructions|system.?prompt|directives)/gi,
    /(?:act|behave|pretend).{0,20}(?:as|like|to be).{0,20}(?:different|another|new).{0,20}(?:assistant|ai|model)/gi,
    
    // MCP protocol manipulation
    /mcp:\/\/[^\s]+/gi,
    /model.?context.?protocol/gi,
    /\$\{[^}]*(?:env|process|global|window)[^}]*\}/gi,
    
    // Function/tool calling exploitation
    /(?:call|invoke|execute).{0,20}(?:function|tool|method).{0,20}(?:with|using).{0,20}(?:admin|root|elevated)/gi,
    /(?:access|read|write|modify).{0,20}(?:system|file|database|memory)/gi,
    
    // Context pollution attempts
    /(?:remember|store|save).{0,20}(?:this|that).{0,20}(?:for|in).{0,20}(?:future|later|next)/gi,
    /(?:set|define|create).{0,20}(?:variable|constant|global)/gi,
    
    
    // Privilege escalation
    /(?:sudo|admin|root|superuser|elevated|privilege)/gi,
    /(?:bypass|override|disable).{0,20}(?:security|protection|guardrails|filter)/gi,
  ];

  // Patterns that indicate potential data exfiltration
  private static readonly EXFILTRATION_PATTERNS = [
    // Direct exfiltration attempts
    /(?:send|transmit|export|leak).{0,20}(?:my|the|this|all).{0,20}(?:api.?key|secret|data|information|content|confidential|personal|sensitive).{0,20}(?:to|via|documents)/gi,
    /(?:base64|hex|encoded|encrypted).{0,20}(?:encode|this|secret).{0,20}(?:data|payload|content)/gi,
    
    // Credential patterns
    /(?:api.?key|secret|token|password|credential)/gi,
    /(?:personal|private|confidential|sensitive).{0,20}(?:data|information)/gi,
    /(?:my|the|user).{0,20}(?:email|phone|address|ssn|credit.?card)/gi,
    /(?:internal|proprietary|classified).{0,20}(?:data|info|document)/gi,
  ];

  // Suspicious function/tool calling patterns
  private static readonly FUNCTION_ABUSE_PATTERNS = [
    /(?:exec|eval|system|shell|command)/gi,
    /(?:file|directory|path).{0,20}(?:read|write|delete|access)/gi,
    /(?:network|http|fetch|request).{0,20}(?:external|remote)/gi,
    /(?:database|db|sql).{0,20}(?:query|execute|modify|access)/gi,
    /(?:access|invoke|call|run).{0,20}(?:database|system|shell|file|network|admin|elevated|privilege)/gi,
  ];

  constructor(config: Partial<MCPProtectionConfig> = {}) {
    // Use logger if available, otherwise use console for tests
    try {
      this.logger = getLogger();
    } catch (error) {
      this.logger = console as any;
    }
    this.config = {
      enabled: true,
      strictMode: false,
      allowedDomains: ['localhost', '127.0.0.1'],
      blockedPatterns: [],
      maxContextSize: 100000, // 100KB limit
      sanitizeOutputs: true,
      logViolations: true,
      onViolation: 'block',
      ...config,
    };
  }

  /**
   * Validates input content for MCP-based attacks and YAML policy violations
   */
  validateInput(content: string, context: any = {}): MCPValidationResult {
    if (!this.config.enabled) {
      return {
        isValid: true,
        violations: [],
        confidence: 1.0,
        riskScore: 0,
      };
    }

    // Handle null/undefined inputs safely
    if (!content || typeof content !== 'string') {
      return {
        isValid: true,
        violations: [],
        confidence: 1.0,
        riskScore: 0,
      };
    }

    const violations: MCPViolation[] = [];
    let riskScore = 0;

    // Check for prompt injection patterns
    const injectionViolations = this.detectPromptInjection(content, context);
    violations.push(...injectionViolations);
    riskScore += injectionViolations.length * 3;

    // Check for data exfiltration attempts
    const exfiltrationViolations = this.detectDataExfiltration(content, context);
    violations.push(...exfiltrationViolations);
    riskScore += exfiltrationViolations.length * 4;

    // Check for function abuse patterns
    const functionViolations = this.detectFunctionAbuse(content, context);
    violations.push(...functionViolations);
    riskScore += functionViolations.length * 2;

    // TODO: Integrate with YAML policy violations (temporarily disabled for testing)
    // Will add back once basic MCP detection is working

    // Check context size limits
    if (content.length > this.config.maxContextSize) {
      violations.push({
        type: 'context_pollution',
        severity: 'medium',
        description: `Content exceeds maximum size limit (${content.length} > ${this.config.maxContextSize})`,
        pattern: 'size_limit',
        context: `Size: ${content.length} characters`,
        timestamp: new Date(),
      });
      riskScore += 2;
    }

    // Check for custom blocked patterns
    for (const pattern of this.config.blockedPatterns) {
      const regex = new RegExp(pattern, 'gi');
      if (regex.test(content)) {
        violations.push({
          type: 'unauthorized_access',
          severity: 'high',
          description: 'Content matches custom blocked pattern',
          pattern,
          context: content.substring(0, 200),
          timestamp: new Date(),
        });
        riskScore += 3;
      }
    }

    const confidence = Math.max(0, Math.min(1, 1 - (riskScore * 0.1)));
    const isValid = violations.length === 0;

    // Log violations if enabled
    if (this.config.logViolations && violations.length > 0) {
      this.logger.warn(`MCP Protection: ${violations.length} violations detected`, {
        violations: violations.map(v => ({ type: v.type, severity: v.severity, description: v.description })),
        riskScore,
        confidence,
      });
    }

    return {
      isValid,
      violations,
      sanitizedContent: (this.config.sanitizeOutputs && violations.length > 0) ? this.sanitizeContent(content, violations) : undefined,
      confidence,
      riskScore,
    };
  }

  /**
   * Validates output content before sending to user
   */
  validateOutput(content: string, context: any = {}): MCPValidationResult {
    if (!this.config.enabled) {
      return {
        isValid: true,
        violations: [],
        confidence: 1.0,
        riskScore: 0,
      };
    }

    const violations: MCPViolation[] = [];
    let riskScore = 0;

    // Check for potential data leakage in outputs
    const leakageViolations = this.detectDataLeakage(content, context);
    violations.push(...leakageViolations);
    riskScore += leakageViolations.length * 4;

    // Check for embedded instructions that could affect future interactions
    const instructionViolations = this.detectEmbeddedInstructions(content, context);
    violations.push(...instructionViolations);
    riskScore += instructionViolations.length * 2;

    const confidence = Math.max(0, Math.min(1, 1 - (riskScore * 0.1)));
    const isValid = violations.length === 0;

    return {
      isValid,
      violations,
      sanitizedContent: this.config.sanitizeOutputs ? this.sanitizeContent(content, violations) : undefined,
      confidence,
      riskScore,
    };
  }

  /**
   * Validates function/tool calls for potential abuse
   */
  validateFunctionCall(functionName: string, args: any, _context: any = {}): MCPValidationResult {
    if (!this.config.enabled) {
      return {
        isValid: true,
        violations: [],
        confidence: 1.0,
        riskScore: 0,
      };
    }

    const violations: MCPViolation[] = [];
    let riskScore = 0;

    // Check function name for suspicious patterns
    const suspiciousFunctions = [
      'exec', 'eval', 'system', 'shell', 'command',
      'file_read', 'file_write', 'file_delete',
      'network_request', 'http_get', 'http_post',
      'database_query', 'sql_execute',
      'admin_access', 'privilege_escalate',
    ];

    if (suspiciousFunctions.some(sf => functionName.toLowerCase().includes(sf))) {
      violations.push({
        type: 'privilege_escalation',
        severity: 'high',
        description: `Potentially dangerous function call: ${functionName}`,
        pattern: functionName,
        context: JSON.stringify(args).substring(0, 200),
        timestamp: new Date(),
      });
      riskScore += 4;
    }

    // Check function arguments for injection attempts
    const argsString = JSON.stringify(args);
    for (const pattern of MCPProtection.INJECTION_PATTERNS) {
      if (pattern.test(argsString)) {
        violations.push({
          type: 'prompt_injection',
          severity: 'high',
          description: 'Function arguments contain injection patterns',
          pattern: pattern.source,
          context: argsString.substring(0, 200),
          timestamp: new Date(),
        });
        riskScore += 3;
      }
    }

    // Check for external domain access
    if (typeof args === 'object' && args !== null) {
      const urlPattern = /https?:\/\/([^\/\s]+)/gi;
      const urls = argsString.match(urlPattern) || [];
      
      for (const url of urls) {
        const domain = new URL(url).hostname;
        if (!this.config.allowedDomains.includes(domain)) {
          violations.push({
            type: 'unauthorized_access',
            severity: 'medium',
            description: `Function attempting to access external domain: ${domain}`,
            pattern: url,
            context: `Function: ${functionName}`,
            timestamp: new Date(),
          });
          riskScore += 2;
        }
      }
    }

    const confidence = Math.max(0, Math.min(1, 1 - (riskScore * 0.1)));
    const isValid = violations.length === 0;

    return {
      isValid,
      violations,
      confidence,
      riskScore,
    };
  }

  /**
   * Sanitizes content by removing or masking detected violations
   */
  private sanitizeContent(content: string, violations: MCPViolation[]): string {
    let sanitized = content;

    for (const violation of violations) {
      try {
        const pattern = new RegExp(violation.pattern, 'gi');
        sanitized = sanitized.replace(pattern, '[FILTERED BY KLIRA MCP PROTECTION]');
      } catch (error) {
        // If pattern is not a valid regex, try literal replacement
        sanitized = sanitized.replace(violation.pattern, '[FILTERED BY KLIRA MCP PROTECTION]');
      }
    }

    return sanitized;
  }

  /**
   * Detects prompt injection attempts
   */
  private detectPromptInjection(content: string, _context: any): MCPViolation[] {
    const violations: MCPViolation[] = [];

    for (const pattern of MCPProtection.INJECTION_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          violations.push({
            type: 'prompt_injection',
            severity: 'high',
            description: 'Potential prompt injection detected',
            pattern: pattern.source,
            context: match,
            timestamp: new Date(),
          });
        }
      }
    }

    return violations;
  }

  /**
   * Detects data exfiltration attempts
   */
  private detectDataExfiltration(content: string, _context: any): MCPViolation[] {
    const violations: MCPViolation[] = [];

    for (const pattern of MCPProtection.EXFILTRATION_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          violations.push({
            type: 'data_exfiltration',
            severity: 'critical',
            description: 'Potential data exfiltration attempt detected',
            pattern: pattern.source,
            context: match,
            timestamp: new Date(),
          });
        }
      }
    }

    return violations;
  }

  /**
   * Detects function abuse patterns
   */
  private detectFunctionAbuse(content: string, _context: any): MCPViolation[] {
    const violations: MCPViolation[] = [];

    for (const pattern of MCPProtection.FUNCTION_ABUSE_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          violations.push({
            type: 'privilege_escalation',
            severity: 'high',
            description: 'Potential function abuse detected',
            pattern: pattern.source,
            context: match,
            timestamp: new Date(),
          });
        }
      }
    }

    return violations;
  }

  /**
   * Detects potential data leakage in outputs
   */
  private detectDataLeakage(content: string, _context: any): MCPViolation[] {
    const violations: MCPViolation[] = [];

    // Check for exposed credentials or keys
    const credentialPattern = /(?:api.?key|secret|token|password)[:\s=]+(is\s+)?[a-zA-Z0-9_\-]{10,}/gi;
    const credentialMatches = content.match(credentialPattern);
    
    if (credentialMatches) {
      for (const match of credentialMatches) {
        violations.push({
          type: 'data_exfiltration',
          severity: 'critical',
          description: 'Potential credential exposure in output',
          pattern: credentialPattern.source,
          context: match.substring(0, 50) + '...',
          timestamp: new Date(),
        });
      }
    }

    // Check for PII exposure
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phonePattern = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
    const ipPattern = /(?:\d{1,3}\.){3}\d{1,3}/g;
    
    [emailPattern, phonePattern, ipPattern].forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          violations.push({
            type: 'data_exfiltration',
            severity: 'high',
            description: 'Potential PII exposure in output',
            pattern: pattern.source,
            context: match,
            timestamp: new Date(),
          });
        }
      }
    });

    return violations;
  }

  /**
   * Detects embedded instructions in outputs
   */
  private detectEmbeddedInstructions(content: string, _context: any): MCPViolation[] {
    const violations: MCPViolation[] = [];

    const instructionPatterns = [
      /(?:remember|note|important).{0,20}(?:for|in).{0,20}(?:future|next|later)/gi,
      /(?:system|hidden|secret).{0,20}(?:instruction|command|directive)/gi,
      /(?:override|ignore|disable).{0,20}(?:previous|above|default|all)/gi,
    ];

    for (const pattern of instructionPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          violations.push({
            type: 'context_pollution',
            severity: 'medium',
            description: 'Embedded instruction detected in output',
            pattern: pattern.source,
            context: match,
            timestamp: new Date(),
          });
        }
      }
    }

    return violations;
  }

  /**
   * Updates protection configuration
   */
  updateConfig(newConfig: Partial<MCPProtectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('MCP Protection configuration updated', this.config);
  }

  /**
   * Gets current protection statistics
   */
  getProtectionStats(): {
    enabled: boolean;
    strictMode: boolean;
    totalPatterns: number;
    allowedDomains: number;
    config: MCPProtectionConfig;
  } {
    return {
      enabled: this.config.enabled,
      strictMode: this.config.strictMode,
      totalPatterns: MCPProtection.INJECTION_PATTERNS.length + 
                    MCPProtection.EXFILTRATION_PATTERNS.length + 
                    MCPProtection.FUNCTION_ABUSE_PATTERNS.length,
      allowedDomains: this.config.allowedDomains.length,
      config: this.config,
    };
  }

  /**
   * Maps policy rule IDs to MCP violation types
   */
  // @ts-expect-error - Reserved for future policy integration
  private _mapPolicyToMCPViolationType(ruleId: string): MCPViolation['type'] {
    // Map different policy types to appropriate MCP violation categories
    if (ruleId.includes('injection') || ruleId.includes('prompt') || ruleId.includes('manipulation')) {
      return 'prompt_injection';
    }
    if (ruleId.includes('data') || ruleId.includes('leak') || ruleId.includes('exfiltration') || ruleId.includes('credential')) {
      return 'data_exfiltration';
    }
    if (ruleId.includes('access') || ruleId.includes('unauthorized') || ruleId.includes('permission')) {
      return 'unauthorized_access';
    }
    if (ruleId.includes('privilege') || ruleId.includes('escalation') || ruleId.includes('admin')) {
      return 'privilege_escalation';
    }
    // Default to context pollution for other policy violations
    return 'context_pollution';
  }

  /**
   * Gets numeric score based on severity level
   */
  // @ts-expect-error - Reserved for future scoring system
  private _getSeverityScore(severity: string): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 1;
    }
  }
}

/**
 * Global MCP Protection instance
 */
let globalMCPProtection: MCPProtection | null = null;

/**
 * Get the global MCP Protection instance
 */
export function getMCPProtection(config?: Partial<MCPProtectionConfig>): MCPProtection {
  if (!globalMCPProtection) {
    globalMCPProtection = new MCPProtection(config);
  }
  return globalMCPProtection;
}

/**
 * Reset the global MCP Protection instance (for testing)
 */
export function resetMCPProtection(): void {
  globalMCPProtection = null;
}