import { type TypedScope } from 'footprintjs';
import type { RunbookPorts, State } from '../contract.js';
import type { BoundRunbook } from '../definition.js';

export function applyApproved(book: BoundRunbook, ports: RunbookPorts) {
  return async (scope: TypedScope<State>) => {
    const proposal = scope.proposal;
    if (!book.matches(proposal)) {
      scope.outcome = 'scope-mismatch';
      return;
    }
    try {
      const result = await ports.applyOnce(Object.freeze({ ...proposal }));
      scope.outcome =
        result === 'applied' ||
        result === 'already-applied' ||
        result === 'stale'
          ? result
          : 'unknown';
    } catch {
      // An acknowledgement can be lost after the effect commits.
      scope.outcome = 'unknown';
    }
  };
}
