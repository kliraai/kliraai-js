/**
 * Klira SDK v2 — Tracing utilities.
 *
 * Thin layer over the OTel pipeline. The v1 KliraTracing singleton is gone.
 * Wrappers and adapters use the pipeline's getTracer() directly.
 */

export { initPipeline, getTracer, shutdownPipeline, resetPipeline } from './pipeline.js';
export { createKliraExporter, type KliraExporterOptions } from './exporter.js';
export { createKliraBatchProcessor, type KliraProcessorOptions } from './processor.js';
