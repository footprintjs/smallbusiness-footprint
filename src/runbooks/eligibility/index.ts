import { decide } from 'footprintjs';
import type { RunbookState } from '../types.js';

export function checkEligibility(scope: RunbookState) {
  return decide(scope, [{ when: { readiness: { eq: 'pass' } }, then: 'eligible', label: 'Every required check passed' }], 'unavailable');
}
