import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { PhiScanner } from '../../healthcare/phi-scanner.js';
import { deidentify } from '../../healthcare/phi-deidentifier.js';
import { PhiAwareExporter } from '../../healthcare/phi-exporter.js';
import { PhiMethod } from '../../contracts/phi-pipeline.js';
import {
  setPatientContext,
  setClinicalContext,
  setInteractionModality,
} from '../../healthcare/fhir.js';
import {
  logClinicalDecision,
  logEscalation,
  logHandoff,
  logSafetyCheck,
  logRAGRetrieval,
} from '../../healthcare/logging.js';

// ---------------------------------------------------------------------------
// OTel test harness
// ---------------------------------------------------------------------------

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

function setupOtel() {
  exporter = new InMemorySpanExporter();
  const contextManager = new AsyncLocalStorageContextManager();
  context.setGlobalContextManager(contextManager);
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
}

async function teardownOtel() {
  await provider.shutdown();
  context.disable();
  trace.disable();
}

// ---------------------------------------------------------------------------
// Tests: PhiScanner
// ---------------------------------------------------------------------------

describe('PhiScanner', () => {
  const scanner = new PhiScanner();

  it('detects SSN patterns', () => {
    const result = scanner.scan('My SSN is 123-45-6789');
    expect(result.detected).toBe(true);
    expect(result.entityTypes).toContain('SSN');
    expect(result.entityCount).toBeGreaterThanOrEqual(1);
  });

  it('detects email addresses', () => {
    const result = scanner.scan('Contact me at john@example.com');
    expect(result.detected).toBe(true);
    expect(result.entityTypes).toContain('EMAIL');
  });

  it('detects phone numbers', () => {
    const result = scanner.scan('Call me at (555) 123-4567');
    expect(result.detected).toBe(true);
    expect(result.entityTypes).toContain('PHONE');
  });

  it('detects MRN patterns', () => {
    const result = scanner.scan('Patient MRN: 1234567');
    expect(result.detected).toBe(true);
    expect(result.entityTypes).toContain('MRN');
  });

  it('detects DOB patterns', () => {
    const result = scanner.scan('DOB: 01/15/1990');
    expect(result.detected).toBe(true);
    expect(result.entityTypes).toContain('DOB');
  });

  it('detects credit card numbers', () => {
    const result = scanner.scan('Card: 4111111111111111');
    expect(result.detected).toBe(true);
    expect(result.entityTypes).toContain('CREDIT_CARD');
  });

  it('returns false for clean text', () => {
    const result = scanner.scan('This is a normal message with no PII');
    expect(result.detected).toBe(false);
    expect(result.entityCount).toBe(0);
  });

  it('detects multiple entity types', () => {
    const result = scanner.scan(
      'Patient MRN: 1234567, SSN: 123-45-6789, email: test@example.com',
    );
    expect(result.detected).toBe(true);
    expect(result.entityTypes.length).toBeGreaterThanOrEqual(3);
  });

  it('handles empty string', () => {
    const result = scanner.scan('');
    expect(result.detected).toBe(false);
  });

  it('supports custom recognizers', () => {
    const custom = new PhiScanner([
      { type: 'CUSTOM_ID', pattern: /CUST-\d{6}/g, score: 0.90 },
    ]);
    const result = custom.scan('ID: CUST-123456');
    expect(result.detected).toBe(true);
    expect(result.entityTypes).toContain('CUSTOM_ID');
  });
});

// ---------------------------------------------------------------------------
// Tests: De-identification
// ---------------------------------------------------------------------------

describe('Deidentification', () => {
  const scanner = new PhiScanner();

  it('REDACT replaces with entity type tag', () => {
    const text = 'SSN: 123-45-6789';
    const scan = scanner.scan(text);
    const result = deidentify(text, scan, PhiMethod.REDACT);
    expect(result).toContain('[SSN]');
    expect(result).not.toContain('123-45-6789');
  });

  it('MASK replaces with asterisks', () => {
    const text = 'SSN: 123-45-6789';
    const scan = scanner.scan(text);
    const result = deidentify(text, scan, PhiMethod.MASK);
    expect(result).toContain('***********');
    expect(result).not.toContain('123-45-6789');
  });

  it('REPLACE uses type-appropriate placeholders', () => {
    const text = 'SSN: 123-45-6789';
    const scan = scanner.scan(text);
    const result = deidentify(text, scan, PhiMethod.REPLACE);
    expect(result).toContain('000-00-0000');
  });

  it('HASH produces consistent hash', () => {
    const text = 'SSN: 123-45-6789';
    const scan = scanner.scan(text);
    const result1 = deidentify(text, scan, PhiMethod.HASH);
    const result2 = deidentify(text, scan, PhiMethod.HASH);
    expect(result1).toBe(result2);
    expect(result1).not.toContain('123-45-6789');
  });

  it('handles multiple entities', () => {
    const text = 'SSN: 123-45-6789, email: test@example.com';
    const scan = scanner.scan(text);
    const result = deidentify(text, scan, PhiMethod.REDACT);
    expect(result).toContain('[SSN]');
    expect(result).toContain('[EMAIL]');
    expect(result).not.toContain('123-45-6789');
    expect(result).not.toContain('test@example.com');
  });

  it('returns original text when no entities detected', () => {
    const text = 'This is clean text';
    const scan = scanner.scan(text);
    const result = deidentify(text, scan, PhiMethod.REDACT);
    expect(result).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// Tests: PHI-aware exporter
// ---------------------------------------------------------------------------

describe('PhiAwareExporter', () => {
  it('scans and de-identifies span attributes', () => {
    const exported: any[] = [];
    const mockDelegate = {
      export: (spans: any[], cb: any) => {
        exported.push(...spans);
        cb({ code: 0 });
      },
      shutdown: async () => {},
      forceFlush: async () => {},
    };

    const phiExporter = new PhiAwareExporter({
      delegate: mockDelegate as any,
      method: PhiMethod.REDACT,
    });

    // Create a mock span with PHI in attributes
    const mockSpan = {
      attributes: {
        'klira.input': 'Patient SSN: 123-45-6789',
        'klira.output': 'Clean text here',
        'other.attr': 'not scanned',
      },
    };

    phiExporter.export([mockSpan as any], () => {});

    expect(exported[0].attributes['klira.input']).toContain('[SSN]');
    expect(exported[0].attributes['klira.input']).not.toContain('123-45-6789');
    expect(exported[0].attributes['klira.output']).toBe('Clean text here');
    expect(exported[0].attributes['klira.phi.detected']).toBe(true);
    expect(exported[0].attributes['klira.phi.entity_count']).toBe(1);
  });

  it('passes through when disabled', () => {
    const exported: any[] = [];
    const mockDelegate = {
      export: (spans: any[], cb: any) => {
        exported.push(...spans);
        cb({ code: 0 });
      },
      shutdown: async () => {},
    };

    const phiExporter = new PhiAwareExporter({
      delegate: mockDelegate as any,
      enabled: false,
    });

    const mockSpan = {
      attributes: { 'klira.input': 'SSN: 123-45-6789' },
    };

    phiExporter.export([mockSpan as any], () => {});

    // Should be unchanged
    expect(exported[0].attributes['klira.input']).toBe('SSN: 123-45-6789');
  });

  it('omits klira.phi.detected on clean spans (Python parity)', () => {
    const exported: any[] = [];
    const mockDelegate = {
      export: (spans: any[], cb: any) => {
        exported.push(...spans);
        cb({ code: 0 });
      },
      shutdown: async () => {},
    };

    const phiExporter = new PhiAwareExporter({
      delegate: mockDelegate as any,
    });

    const mockSpan = {
      attributes: { 'klira.input': 'Clean text' },
    };

    phiExporter.export([mockSpan as any], () => {});
    // Python only sets klira.phi.detected when PHI was actually detected.
    expect('klira.phi.detected' in exported[0].attributes).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: FHIR context
// ---------------------------------------------------------------------------

describe('FHIR context', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('sets patient context on active span', () => {
    const tracer = trace.getTracer('test');
    tracer.startActiveSpan('test-span', (span) => {
      setPatientContext({
        patientId: 'P-12345',
        encounterId: 'E-67890',
        fhirResourceType: 'Patient',
      });
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    expect(spans[0].attributes['klira.healthcare.patient_id']).toBe('P-12345');
    expect(spans[0].attributes['klira.healthcare.encounter_id']).toBe('E-67890');
    expect(spans[0].attributes['klira.fhir.resource_type']).toBe('Patient');
  });

  it('sets clinical context on active span', () => {
    const tracer = trace.getTracer('test');
    tracer.startActiveSpan('test-span', (span) => {
      setClinicalContext({
        department: 'Cardiology',
        specialty: 'Interventional',
      });
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    expect(spans[0].attributes['klira.healthcare.department']).toBe('Cardiology');
    expect(spans[0].attributes['klira.healthcare.specialty']).toBe('Interventional');
  });

  it('sets interaction modality', () => {
    const tracer = trace.getTracer('test');
    tracer.startActiveSpan('test-span', (span) => {
      setInteractionModality('voice');
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    expect(spans[0].attributes['klira.healthcare.interaction_modality']).toBe('voice');
  });
});

// ---------------------------------------------------------------------------
// Tests: Clinical logging
// ---------------------------------------------------------------------------

describe('Clinical logging', () => {
  beforeEach(setupOtel);
  afterEach(teardownOtel);

  it('logClinicalDecision creates span', () => {
    logClinicalDecision({
      decision: 'triage',
      reasoning: 'Patient symptoms indicate urgent care needed',
      confidence: 0.95,
      patientId: 'P-12345',
      guidelinesUsed: 3,
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'klira.clinical.decision');
    expect(span).toBeDefined();
    expect(span!.attributes['klira.entity_name']).toBe('clinical_decision');
    expect(span!.attributes['klira.clinical.decision']).toBe('triage');
    expect(span!.attributes['klira.clinical.reasoning']).toBe('Patient symptoms indicate urgent care needed');
    expect(span!.attributes['klira.clinical.confidence']).toBe(0.95);
    expect(span!.attributes['klira.clinical.patient_id']).toBe('P-12345');
    expect(span!.attributes['klira.clinical.guidelines_used']).toBe(3);
  });

  it('logEscalation creates span', () => {
    logEscalation({
      reason: 'Patient requires specialist',
      targetTeam: 'cardiology',
      urgency: 'high',
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'klira.clinical.escalation');
    expect(span).toBeDefined();
    expect(span!.attributes['klira.clinical.urgency']).toBe('high');
  });

  it('logHandoff creates span', () => {
    logHandoff({
      fromAgent: 'triage-bot',
      toAgent: 'specialist-bot',
      reason: 'Complex case requires specialist',
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'klira.agent.handoff');
    expect(span).toBeDefined();
    expect(span!.attributes['klira.agent.handoff_from']).toBe('triage-bot');
    expect(span!.attributes['klira.agent.handoff_to']).toBe('specialist-bot');
  });

  it('logSafetyCheck creates span', () => {
    logSafetyCheck({
      checkType: 'medication-interaction',
      passed: true,
      details: 'No interactions found',
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'klira.clinical.safety_check');
    expect(span).toBeDefined();
    expect(span!.attributes['klira.clinical.check_type']).toBe('medication-interaction');
    expect(span!.attributes['klira.clinical.check_passed']).toBe(true);
    expect(span!.attributes['klira.clinical.check_details']).toBe('No interactions found');
  });

  it('logRAGRetrieval creates klira.clinical.rag_retrieval span', () => {
    logRAGRetrieval({
      source: 'medical-guidelines',
      query: 'hypertension treatment',
      resultCount: 5,
      indexName: 'pubmed_embeddings',
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'klira.clinical.rag_retrieval');
    expect(span).toBeDefined();
    expect(span!.attributes['klira.entity_name']).toBe('rag_retrieval');
    expect(span!.attributes['klira.clinical.rag_source']).toBe('medical-guidelines');
    expect(span!.attributes['klira.clinical.rag_query']).toBe('hypertension treatment');
    expect(span!.attributes['klira.clinical.rag_result_count']).toBe(5);
    expect(span!.attributes['klira.clinical.index_name']).toBe('pubmed_embeddings');
  });
});
