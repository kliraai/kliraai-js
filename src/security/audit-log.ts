/**
 * Security Audit Logging
 * Tracks and logs security events for compliance and monitoring
 */

import type { Logger } from '../types/index.js';
import { getLogger } from '../config/index.js';
import type { MCPViolation } from './mcp-protection.js';

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  type: 'mcp_violation' | 'policy_violation' | 'auth_failure' | 'suspicious_activity' | 'data_access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  description: string;
  metadata: Record<string, any>;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogConfig {
  enabled: boolean;
  maxEvents: number;
  retentionDays: number;
  exportPath?: string;
  realTimeAlerts: boolean;
  alertThresholds: {
    critical: number;
    high: number;
    medium: number;
  };
}

/**
 * Security Audit Log Manager
 * Provides comprehensive security event logging and monitoring
 */
export class SecurityAuditLog {
  private logger: Logger;
  private config: AuditLogConfig;
  private events: SecurityEvent[] = [];
  private eventCounts: Map<string, number> = new Map();

  constructor(config: Partial<AuditLogConfig> = {}) {
    // Use logger if available, otherwise use console for tests
    try {
      this.logger = getLogger();
    } catch (error) {
      this.logger = console as any;
    }
    this.config = {
      enabled: true,
      maxEvents: 10000,
      retentionDays: 30,
      realTimeAlerts: true,
      alertThresholds: {
        critical: 1,
        high: 5,
        medium: 10,
      },
      ...config,
    };

    // Clean up old events periodically
    if (this.config.enabled) {
      setInterval(() => this.cleanupOldEvents(), 60000 * 60); // Every hour
    }
  }

  /**
   * Log a security event
   */
  logEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    if (!this.config.enabled) {
      return;
    }

    const fullEvent: SecurityEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...event,
    };

    // Add to events list
    this.events.push(fullEvent);

    // Update event counts
    const key = `${event.type}_${event.severity}`;
    this.eventCounts.set(key, (this.eventCounts.get(key) || 0) + 1);

    // Trim events if needed
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(-this.config.maxEvents);
    }

    // Log to standard logger
    this.logger.warn(`Security Event: ${event.type}`, {
      severity: event.severity,
      source: event.source,
      description: event.description,
      metadata: event.metadata,
    });

    // Check for alert thresholds
    if (this.config.realTimeAlerts) {
      this.checkAlertThresholds(event);
    }

    // Export if path is configured
    if (this.config.exportPath) {
      this.exportEvent(fullEvent);
    }
  }

  /**
   * Log MCP violation as security event
   */
  logMCPViolation(violation: MCPViolation, context: {
    source: string;
    userId?: string;
    sessionId?: string;
    requestId?: string;
  }): void {
    this.logEvent({
      type: 'mcp_violation',
      severity: violation.severity,
      source: context.source,
      description: `MCP ${violation.type}: ${violation.description}`,
      metadata: {
        violationType: violation.type,
        pattern: violation.pattern,
        context: violation.context,
      },
      userId: context.userId,
      sessionId: context.sessionId,
      requestId: context.requestId,
    });
  }

  /**
   * Log policy violation as security event
   */
  logPolicyViolation(policyId: string, content: string, context: {
    source: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    userId?: string;
    sessionId?: string;
    requestId?: string;
  }): void {
    this.logEvent({
      type: 'policy_violation',
      severity: context.severity,
      source: context.source,
      description: `Policy violation: ${policyId}`,
      metadata: {
        policyId,
        contentLength: content.length,
        contentPreview: content.substring(0, 100),
      },
      userId: context.userId,
      sessionId: context.sessionId,
      requestId: context.requestId,
    });
  }

  /**
   * Log suspicious activity
   */
  logSuspiciousActivity(activity: string, context: {
    source: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, any>;
    userId?: string;
    sessionId?: string;
    requestId?: string;
  }): void {
    this.logEvent({
      type: 'suspicious_activity',
      severity: context.severity,
      source: context.source,
      description: activity,
      metadata: context.metadata || {},
      userId: context.userId,
      sessionId: context.sessionId,
      requestId: context.requestId,
    });
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100, type?: SecurityEvent['type']): SecurityEvent[] {
    let events = this.events;
    
    if (type) {
      events = events.filter(e => e.type === type);
    }
    
    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get events by time range
   */
  getEventsByTimeRange(startTime: Date, endTime: Date): SecurityEvent[] {
    return this.events.filter(
      e => e.timestamp >= startTime && e.timestamp <= endTime
    );
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    recentActivity: SecurityEvent[];
    alertCounts: Record<string, number>;
  } {
    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};

    for (const event of this.events) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    }

    return {
      totalEvents: this.events.length,
      eventsByType,
      eventsBySeverity,
      recentActivity: this.getRecentEvents(10),
      alertCounts: Object.fromEntries(this.eventCounts),
    };
  }

  /**
   * Export events to file (if configured)
   */
  private exportEvent(event: SecurityEvent): void {
    if (!this.config.exportPath) {
      return;
    }

    try {
      // In a real implementation, this would write to file
      // For now, we'll just log the export action
      this.logger.debug('Exporting security event to audit log', {
        eventId: event.id,
        type: event.type,
        severity: event.severity,
        exportPath: this.config.exportPath,
      });
    } catch (error) {
      this.logger.error('Failed to export security event:', error);
    }
  }

  /**
   * Check if alert thresholds are exceeded
   */
  private checkAlertThresholds(event: SecurityEvent): void {
    const key = `${event.type}_${event.severity}`;
    const count = this.eventCounts.get(key) || 0;
    const threshold = this.config.alertThresholds[event.severity];

    if (count >= threshold) {
      this.logger.error(`Security Alert: ${event.severity} level threshold exceeded`, {
        eventType: event.type,
        severity: event.severity,
        count,
        threshold,
        recentEvent: event,
      });

      // Reset counter after alert
      this.eventCounts.set(key, 0);
    }
  }

  /**
   * Clean up old events based on retention policy
   */
  private cleanupOldEvents(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const initialCount = this.events.length;
    this.events = this.events.filter(event => event.timestamp > cutoffDate);

    const removedCount = initialCount - this.events.length;
    if (removedCount > 0) {
      this.logger.debug(`Cleaned up ${removedCount} old security events`);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AuditLogConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Security audit log configuration updated', this.config);
  }

  /**
   * Clear all events (for testing or reset)
   */
  clearEvents(): void {
    this.events = [];
    this.eventCounts.clear();
    this.logger.info('Security audit log cleared');
  }
}

/**
 * Global security audit log instance
 */
let globalAuditLog: SecurityAuditLog | null = null;

/**
 * Get the global security audit log instance
 */
export function getSecurityAuditLog(config?: Partial<AuditLogConfig>): SecurityAuditLog {
  if (!globalAuditLog) {
    globalAuditLog = new SecurityAuditLog(config);
  }
  return globalAuditLog;
}

/**
 * Reset the global audit log instance (for testing)
 */
export function resetSecurityAuditLog(): void {
  globalAuditLog = null;
}