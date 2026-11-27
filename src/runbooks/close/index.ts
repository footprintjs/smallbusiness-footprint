import type { RunbookState } from '../types.js';

export function closeWithoutAction(scope: RunbookState) {
  scope.outcome = scope.decision === 'decline' ? 'declined' : 'invalid-decision';
}
