/**
 * Klira SDK v2 — FHIR resource tracking.
 *
 * Sets klira.healthcare.* and klira.fhir.* attributes on the active span
 * per trace-schema contract.
 */

import { trace } from '@opentelemetry/api';

/**
 * Set patient context on the active span.
 */
export function setPatientContext(options: {
  patientId?: string;
  encounterId?: string;
  fhirResourceType?: string;
}): void {
  const span = trace.getActiveSpan();
  if (!span) return;

  if (options.patientId) {
    span.setAttribute('klira.healthcare.patient_id', options.patientId);
  }
  if (options.encounterId) {
    span.setAttribute('klira.healthcare.encounter_id', options.encounterId);
  }
  if (options.fhirResourceType) {
    span.setAttribute('klira.fhir.resource_type', options.fhirResourceType);
  }
}

/**
 * Set clinical context on the active span.
 */
export function setClinicalContext(options: {
  department?: string;
  specialty?: string;
  clinicalContext?: string;
}): void {
  const span = trace.getActiveSpan();
  if (!span) return;

  if (options.department) {
    span.setAttribute('klira.healthcare.department', options.department);
  }
  if (options.specialty) {
    span.setAttribute('klira.healthcare.specialty', options.specialty);
  }
  if (options.clinicalContext) {
    span.setAttribute('klira.healthcare.clinical_domain', options.clinicalContext);
  }
}

/**
 * Set interaction modality on the active span.
 */
export function setInteractionModality(modality: string): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  span.setAttribute('klira.healthcare.interaction_modality', modality);
}
