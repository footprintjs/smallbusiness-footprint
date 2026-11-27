import type { TypedScope } from 'footprintjs';
import type { RunbookPorts, State } from '../contract.js';
import type { BoundRunbook } from '../definition.js';

export function inspect(book: BoundRunbook, ports: RunbookPorts) {
  return async (scope: TypedScope<State>) => {
    let finding: string | null;
    try {
      finding = await ports.inspect(book.target);
    } catch {
      finding = null;
    }
    const proposal = book.proposal(finding);
    scope.proposal = proposal;
    scope.ready = proposal !== null;
    if (proposal === null) scope.outcome = 'unresolved';
    scope.approved = false;
  };
}
