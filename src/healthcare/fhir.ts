/**
 * Klira SDK v2 — FHIR resource tracking.
 *
 * Sets klira.clinical.* attributes on the active span.
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
    span.setAttribute('klira.clinical.patient_id', options.patientId);
  }
  if (options.encounterId) {
    span.setAttribute('klira.clinical.encounter_id', options.encounterId);
  }
  if (options.fhirResourceType) {
    span.setAttribute('klira.clinical.fhir_resource_type', options.fhirResourceType);
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
    span.setAttribute('klira.clinical.department', options.department);
  }
  if (options.specialty) {
    span.setAttribute('klira.clinical.specialty', options.specialty);
  }
  if (options.clinicalContext) {
    span.setAttribute('klira.clinical.context', options.clinicalContext);
  }
}

/**
 * Set interaction modality on the active span.
 */
export function setInteractionModality(modality: string): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  span.setAttribute('klira.clinical.modality', modality);
}
