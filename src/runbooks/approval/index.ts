import { interrupt } from 'footprintjs';
import type { BoundRunbook } from '../binding.js';
import type { RunbookState } from '../types.js';

export function requestApproval(book: BoundRunbook) {
  return (scope: RunbookState) => {
    if (scope.binding !== book.binding) throw new Error('The runbook or its subject changed.');
    const answer = interrupt(scope, { reason: 'Owner decision required', expects: ['approve', 'decline'] });
    scope.decision = answer === 'approve' || answer === 'decline' ? answer : 'invalid';
  };
}
