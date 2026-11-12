import { createBoundaryRecorder } from 'footprint-blueprint/diagnostics/runtime';
import { normalizeCommerceBoundaryError } from '../diagnostics.js';

export type CommerceBoundaryRecorderOptions = NonNullable<Parameters<typeof createBoundaryRecorder>[0]>;
export type CommerceBoundaryRecorder = ReturnType<typeof createBoundaryRecorder>;

/**
 * Apply commerce classification to Blueprint's real native boundary recorder.
 * Custom vendors may provide their own normalizer; retry policy, storage and semantic
 * payment reconciliation remain explicit host decisions. No provider SDK is loaded.
 */
export function createCommerceBoundaryRecorder(options: CommerceBoundaryRecorderOptions = {}): CommerceBoundaryRecorder {
  return createBoundaryRecorder({ ...options, normalizeError: options.normalizeError ?? normalizeCommerceBoundaryError });
}
