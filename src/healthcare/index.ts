/**
 * Klira SDK v2 — Healthcare barrel export.
 */

export { PhiScanner } from './phi-scanner.js';
export { deidentify } from './phi-deidentifier.js';
export { PhiAwareExporter, type PhiExporterOptions } from './phi-exporter.js';
export { setPatientContext, setClinicalContext, setInteractionModality } from './fhir.js';
export {
  logClinicalDecision,
  logEscalation,
  logHandoff,
  logSafetyCheck,
  logRAGRetrieval,
} from './logging.js';
