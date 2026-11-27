import type { TypedScope } from 'footprintjs';
import type { RunbookInspection, RunbookPorts, State } from '../contract.js';
import type { BoundRunbook } from '../definition.js';

export function inspect(book: BoundRunbook, ports: RunbookPorts) {
  return async (scope: TypedScope<State>) => {
    let finding: string | null = null;
    let inspection: RunbookInspection = 'failed';
    try {
      finding = await ports.inspect(book.target);
      inspection = finding === null ? 'none' : 'found';
    } catch {
      // The outcome stays unresolved. Record the read failure without its text.
    }
    scope.inspection = inspection;
    const proposal = book.proposal(finding);
    scope.proposal = proposal;
    scope.ready = proposal !== null;
    if (proposal === null) scope.outcome = 'unresolved';
    scope.approved = false;
  };
}
