import { interrupt, type TypedScope } from 'footprintjs';
import type { State } from '../contract.js';
import type { BoundRunbook } from '../definition.js';

export function askOwner(book: BoundRunbook) {
  return (scope: TypedScope<State>) => {
    if (!book.matches(scope.proposal)) {
      scope.approved = false;
      scope.outcome = 'scope-mismatch';
      return;
    }
    const answer = interrupt<unknown>(scope, {
      reason: 'Approve the proposed action?',
      ...scope.proposal,
    });
    scope.approved = answer === 'approve';
    if (!scope.approved)
      scope.outcome = answer === 'decline' ? 'declined' : 'invalid-decision';
  };
}
