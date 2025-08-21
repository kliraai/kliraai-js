# JavaScript SDK Policy Engine Implementation Plan

## Executive Summary

The JavaScript SDK currently implements policies as hardcoded functions in the FastRulesEngine and PolicyAugmentation classes, creating inconsistency with the Python SDK and preventing dynamic policy management. This plan outlines a comprehensive migration to a YAML-based policy system that mirrors the Python SDK's approach while maintaining backward compatibility and enabling future API-based policy loading from the Klira platform.

**Impact Scope:**
- Core guardrails engine will transition from hardcoded rules to YAML-driven configuration
- LangChain adapter and other framework integrations will seamlessly benefit from enhanced policy management
- Existing hardcoded rules will be migrated to YAML format, maintaining current functionality
- New policy loader system will support both local YAML files and future API-based loading

## Current State Analysis

### Existing JavaScript SDK Architecture

**Hardcoded Policy Implementation:**
- `/src/guardrails/fast-rules.ts`: Contains 10+ hardcoded pattern rules defined in `initializeDefaultRules()` method
- `/src/guardrails/policy-augmentation.ts`: Contains 7 hardcoded guideline templates in `initializeDefaultGuidelines()` method
- `/src/guardrails/engine.ts`: Orchestrates guardrails with singleton pattern but lacks policy loading capabilities
- No YAML parsing or external policy loading mechanism

**Current Policy Structure:**
```typescript
// FastRulesEngine hardcoded patterns
{
  id: 'pii-email',
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  action: 'block',
  severity: 'high',
  description: 'Email address detected',
  replacement: '[EMAIL_REDACTED]'
}

// PolicyAugmentation hardcoded guidelines  
{
  id: 'pii-protection',
  category: 'compliance',
  guideline: 'Do not include PII...',
  priority: 9,
  conditions: { violationTypes: ['pii-email'] }
}
```

### Python SDK Target Model

**YAML-Based Policy Structure:**
```yaml
version: "1.0.0"
policies:
  - id: "pii_001"
    name: "PII Leakage Prevention"
    direction: "outbound"
    domains: ["ssn", "credit", "email", ...]
    description: "Prevent unauthorized output of PII"
    action: "block"
    guidelines: [...]
    patterns: [...]
```

**Key Python Features:**
1. YAML file loading with fallback to JSON
2. Policy compilation with LRU caching for regex patterns
3. Dynamic policy loading from filesystem or API
4. Three evaluation layers: FastRules → Policy Augmentation → LLM Fallback
5. Domain-based matching in addition to regex patterns
6. Direction-aware policies (inbound/outbound/both)

## Implementation Phases

### Phase 1: Foundation - YAML Infrastructure (Week 1)

**1.1 Add YAML Support**
```bash
npm install --save js-yaml
npm install --save-dev @types/js-yaml
```

**1.2 Create Policy Type Definitions**
```typescript
// src/types/policies.ts
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
}

export interface PolicyFile {
  version: string;
  updated_at?: string;
  policies: PolicyDefinition[];
}
```

**1.3 Create Policy Loader Service**
```typescript
// src/guardrails/policy-loader.ts
export class PolicyLoader {
  private cache: Map<string, CompiledPolicy>;
  
  async loadFromYAML(path: string): Promise<PolicyFile>;
  async loadFromAPI(endpoint: string): Promise<PolicyFile>;
  compilePolicies(policies: PolicyDefinition[]): CompiledPolicy[];
}
```

### Phase 2: Policy Migration - Convert Hardcoded Rules (Week 1-2)

**2.1 Create Default Policies YAML**
```yaml
# src/guardrails/default_policies.yaml
version: "1.0.0"
updated_at: "2025-08-21"
policies:
  - id: "pii_001"
    name: "PII Leakage Prevention"
    direction: "both"
    domains: ["email", "ssn", "credit", "phone", "address"]
    description: "Prevent unauthorized output of PII"
    action: "block"
    severity: "critical"
    guidelines:
      - "Never include personal information"
      - "Use placeholder values for testing"
    patterns:
      - "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"
      - "\\b\\d{3}-?\\d{2}-?\\d{4}\\b"
```

**2.2 Migration Mapping**
- Convert FastRulesEngine patterns → YAML patterns section
- Convert PolicyAugmentation guidelines → YAML guidelines section
- Map severity levels and actions appropriately
- Preserve all existing rule IDs for backward compatibility

### Phase 3: Refactor Core Components (Week 2)

**3.1 Enhanced FastRulesEngine**
```typescript
export class FastRulesEngine {
  private policies: CompiledPolicy[] = [];
  private policyLoader: PolicyLoader;
  
  async initialize(configPath?: string): Promise<void> {
    const policyFile = await this.policyLoader.loadFromYAML(
      configPath || './default_policies.yaml'
    );
    this.policies = this.policyLoader.compilePolicies(policyFile.policies);
  }
  
  evaluate(content: string, direction: 'inbound' | 'outbound'): FastRuleResult {
    // Filter policies by direction
    // Evaluate both patterns and domains
    // Return violations with metadata
  }
}
```

**3.2 Enhanced PolicyAugmentation**
```typescript
export class PolicyAugmentation {
  private policyGuidelines: Map<string, string[]> = new Map();
  
  async initialize(policies: PolicyDefinition[]): Promise<void> {
    for (const policy of policies) {
      if (policy.guidelines) {
        this.policyGuidelines.set(policy.id, policy.guidelines);
      }
    }
  }
  
  generateGuidelines(violations: PolicyViolation[]): string[] {
    // Pull guidelines from policy definitions
    // Prioritize based on severity
    // Return consolidated guidelines
  }
}
```

**3.3 Updated GuardrailsEngine**
```typescript
export class GuardrailsEngine {
  private policyPath: string;
  private policies: PolicyDefinition[] = [];
  
  async initialize(): Promise<void> {
    // Load policies from YAML
    const policyFile = await this.loadPolicies();
    
    // Initialize sub-components with policies
    await this.fastRules.initialize(this.policyPath);
    await this.augmentation.initialize(policyFile.policies);
    
    // Cache policies for future API integration
    this.policies = policyFile.policies;
  }
  
  async reloadPolicies(): Promise<void> {
    // Support dynamic policy reloading
  }
}
```

### Phase 4: Integration & Testing (Week 2-3)

**4.1 LangChain Adapter Updates**
- No breaking changes required
- Adapter will automatically benefit from enhanced policy system
- Add policy direction awareness (inbound for prompts, outbound for completions)

**4.2 Backward Compatibility Layer**
```typescript
// src/guardrails/compatibility.ts
export class PolicyCompatibility {
  static convertLegacyRule(rule: FastRulePattern): PolicyDefinition {
    // Convert old format to new YAML structure
  }
  
  static migrateConfiguration(oldConfig: any): PolicyFile {
    // Migrate existing configurations
  }
}
```

**4.3 Comprehensive Test Suite**
- Unit tests for PolicyLoader
- Integration tests for YAML loading
- Regression tests ensuring all existing rules work
- Performance benchmarks for pattern compilation

### Phase 5: Advanced Features (Week 3)

**5.1 API-Based Policy Loading**
```typescript
export interface PolicyAPIConfig {
  endpoint: string;
  apiKey: string;
  refreshInterval?: number;
  cachePolicy?: 'memory' | 'disk' | 'both';
}

export class PolicyAPIClient {
  async fetchPolicies(): Promise<PolicyFile>;
  async syncWithPlatform(): Promise<void>;
  setupAutoRefresh(interval: number): void;
}
```

**5.2 Policy Caching & Performance**
```typescript
export class PolicyCache {
  private compiledPatterns: LRUCache<string, RegExp>;
  private domainPatterns: LRUCache<string, RegExp>;
  
  compileWithCache(pattern: string): RegExp;
  precompileAll(policies: PolicyDefinition[]): void;
}
```

## Technical Considerations

### Architecture Decisions

1. **YAML as Primary Format**
   - Matches Python SDK for consistency
   - Human-readable and editable
   - Supports complex nested structures
   - Industry standard for configuration

2. **Lazy Compilation Strategy**
   - Compile regex patterns on first use
   - Cache compiled patterns with LRU eviction
   - Minimize memory footprint
   - Optimize startup time

3. **Direction-Aware Evaluation**
   - Separate inbound (user input) and outbound (LLM output) policies
   - Enable fine-grained control over content filtering
   - Support bidirectional policies for universal rules

4. **Singleton Pattern Preservation**
   - Maintain thread-safe singleton for GuardrailsEngine
   - Ensure consistent policy state across application
   - Support hot-reloading without restarts

### Potential Challenges

1. **YAML Parsing Performance**
   - Mitigation: Cache parsed policies in memory
   - Use lazy loading for large policy files
   - Consider binary format for production

2. **Regex Compilation Overhead**
   - Mitigation: LRU cache for compiled patterns
   - Precompile frequently used patterns
   - Benchmark and optimize hot paths

3. **Backward Compatibility**
   - Mitigation: Compatibility layer for legacy configs
   - Deprecation warnings for old methods
   - Migration guide and tooling

4. **Type Safety with YAML**
   - Mitigation: Zod schema validation
   - Runtime type checking
   - Comprehensive type definitions

## Testing Strategy

### Unit Testing
- PolicyLoader: YAML parsing, error handling
- Pattern compilation and caching
- Domain matching logic
- Guidelines generation

### Integration Testing
- End-to-end policy evaluation
- LangChain adapter with new policies
- Policy reloading and hot-swapping
- API integration (mocked initially)

### Performance Testing
- Pattern matching benchmarks
- Memory usage profiling
- Startup time measurements
- Cache effectiveness metrics

### Regression Testing
- All existing hardcoded rules must pass
- Verify no breaking changes in public API
- Test migration path from old to new format

## Risk Assessment

### High Risk Items
1. **Breaking Changes to Public API**
   - Mitigation: Maintain backward compatibility layer
   - Risk Level: Medium (with mitigation)

2. **Performance Degradation**
   - Mitigation: Extensive benchmarking and optimization
   - Risk Level: Low

### Medium Risk Items
1. **YAML Parsing Errors**
   - Mitigation: Schema validation and error recovery
   - Risk Level: Low

2. **Memory Leaks from Pattern Caching**
   - Mitigation: LRU cache with size limits
   - Risk Level: Low

## Timeline Estimates

### Week 1: Foundation
- Set up YAML infrastructure (2 days)
- Create type definitions and interfaces (1 day)
- Implement PolicyLoader (2 days)

### Week 2: Core Implementation
- Migrate existing rules to YAML (2 days)
- Refactor FastRulesEngine (2 days)
- Update PolicyAugmentation (1 day)

### Week 3: Integration & Testing
- Update GuardrailsEngine (1 day)
- Comprehensive testing (2 days)
- Documentation and examples (1 day)
- Performance optimization (1 day)

### Total Estimate: 3 weeks (15 business days)

## Success Criteria

1. **Functional Requirements**
   - ✅ All policies defined in YAML files
   - ✅ Dynamic policy loading without code changes
   - ✅ Backward compatibility maintained
   - ✅ LangChain adapter works seamlessly

2. **Performance Requirements**
   - ✅ No more than 10% increase in evaluation time
   - ✅ Memory usage within 20% of current baseline
   - ✅ Startup time under 100ms for default policies

3. **Quality Requirements**
   - ✅ 95%+ test coverage for new code
   - ✅ Zero breaking changes to public API
   - ✅ Full TypeScript type safety maintained
   - ✅ Documentation complete and accurate

## Migration Strategy

### For Existing Users

1. **Automatic Migration**
   ```typescript
   // On first run with new version
   if (hasLegacyConfig()) {
     const migrated = PolicyCompatibility.migrateConfiguration(oldConfig);
     await saveMigratedPolicies(migrated);
     console.log('Policies migrated to YAML format');
   }
   ```

2. **Deprecation Warnings**
   ```typescript
   // In old methods
   console.warn('FastRulesEngine.addRule() is deprecated. Use policy YAML files instead.');
   ```

3. **Migration Guide**
   - Step-by-step instructions
   - Example YAML configurations
   - Common patterns and recipes
   - Troubleshooting guide

### Rollback Procedures

1. **Version Pinning**
   - Users can pin to pre-YAML version if issues arise
   - Maintain bug fixes for legacy version for 6 months

2. **Feature Flag**
   ```typescript
   const USE_YAML_POLICIES = process.env.KLIRA_USE_YAML_POLICIES !== 'false';
   ```

3. **Emergency Fallback**
   - Keep hardcoded rules as fallback
   - Activate if YAML loading fails
   - Log errors for debugging

## Next Steps

1. **Immediate Actions**
   - Review and approve implementation plan
   - Set up development branch
   - Install js-yaml dependency

2. **Week 1 Deliverables**
   - PolicyLoader implementation
   - Initial YAML schema definition
   - Basic unit tests

3. **Communication**
   - Announce planned changes to users
   - Create migration documentation
   - Set up feedback channel

## Appendix: Example YAML Policy

```yaml
# Complete example matching Python SDK structure
version: "1.0.0"
updated_at: "2025-08-21"
policies:
  - id: "pii_protection"
    name: "Comprehensive PII Protection"
    direction: "both"
    domains: 
      - "email"
      - "ssn"
      - "social security"
      - "credit card"
      - "phone"
      - "address"
      - "passport"
      - "driver license"
    description: "Prevent leakage of personally identifiable information"
    action: "block"
    severity: "critical"
    guidelines:
      - "Never output personal information including names, addresses, or identification numbers"
      - "Replace any detected PII with appropriate placeholders"
      - "Redirect users to secure channels for sensitive data exchange"
    patterns:
      # Email addresses
      - "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"
      # SSN
      - "\\b\\d{3}-?\\d{2}-?\\d{4}\\b"
      # Credit cards
      - "\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\\b"
      # Phone numbers
      - "\\b(?:\\+?1[-.]?)?\\(?([0-9]{3})\\)?[-.]?([0-9]{3})[-.]?([0-9]{4})\\b"
    metadata:
      compliance: ["GDPR", "CCPA", "HIPAA"]
      last_reviewed: "2025-08-01"
      risk_score: 10
```

This implementation plan provides a clear, actionable path to modernize the JavaScript SDK's policy system while maintaining stability and backward compatibility.