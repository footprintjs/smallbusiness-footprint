import { interrupt, type TypedScope } from 'footprintjs';
import type { RunbookCommand, RunbookDecision, State } from '../contract.js';
import type { BoundRunbook } from '../definition.js';

function readDecision(
  answer: unknown,
  proposal: RunbookCommand
): RunbookDecision['decision'] | undefined {
  if (answer === null || typeof answer !== 'object') return undefined;

  try {
    const prototype = Object.getPrototypeOf(answer);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const fields = Object.getOwnPropertyDescriptors(answer);
    if (
      Reflect.ownKeys(fields).length !== 3 ||
      !Object.hasOwn(fields, 'decision') ||
      !Object.hasOwn(fields, 'incident') ||
      !Object.hasOwn(fields, 'action') ||
      fields.incident.value !== proposal.incident ||
      fields.action.value !== proposal.action
    ) return undefined;
    const decision: unknown = fields.decision.value;
    if (decision === 'approve' || decision === 'decline') return decision;
  } catch {
    return undefined;
  }
  return undefined;
}

export function askOwner(book: BoundRunbook) {
  return (scope: TypedScope<State>) => {
    const proposal = scope.proposal;
    if (!book.matches(proposal)) {
      scope.approved = false;
      scope.outcome = 'scope-mismatch';
      return;
    }
    const answer = interrupt<unknown>(scope, {
      reason: 'Approve the proposed action?',
      ...proposal,
    });
    const decision = readDecision(answer, proposal);
    scope.approved = decision === 'approve';
    if (!scope.approved)
      scope.outcome = decision === 'decline' ? 'declined' : 'invalid-decision';
  };
}
