/**
 * Security module exports
 * Provides comprehensive security features for the Klira AI SDK
 */

export {
  MCPProtection,
  getMCPProtection,
  resetMCPProtection,
  type MCPViolation,
  type MCPProtectionConfig,
  type MCPValidationResult,
} from './mcp-protection.js';

export {
  SecurityAuditLog,
  getSecurityAuditLog,
  resetSecurityAuditLog,
  type SecurityEvent,
  type AuditLogConfig,
} from './audit-log.js';

export {
  ContentSanitizer,
  type SanitizationConfig,
  type SanitizationResult,
} from './content-sanitizer.js';