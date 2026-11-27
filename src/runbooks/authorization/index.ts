import { decide } from 'footprintjs';
import type { RunbookState } from '../types.js';

export function authorizeAction(scope: RunbookState) {
  return decide(scope, [{ when: { decision: { eq: 'approve' } }, then: 'apply', label: 'Owner approved the bound action' }], 'close');
}
