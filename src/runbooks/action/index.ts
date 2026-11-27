import type { BoundRunbook } from '../binding.js';
import type { RunbookAction, RunbookOutcome, RunbookState, RunbookTarget } from '../types.js';

async function apply(applyOnce: RunbookAction, target: RunbookTarget, key: string): Promise<RunbookOutcome> {
  try {
    const result = await applyOnce(target, key);
    if (result === 'applied' || result === 'ineligible') return result;
  } catch {
    // The action may already have committed. Only its authoritative port can reconcile it.
  }
  return 'action-unknown';
}

export function applyAction(book: BoundRunbook) {
  return async (scope: RunbookState) => {
    scope.outcome = await apply(book.applyOnce, book.target, book.key);
  };
}
