import type { RunbookState } from '../types.js';

export function recordUnavailable(scope: RunbookState) {
  scope.outcome = scope.readiness === 'blocked' ? 'checks-blocked' : 'checks-unknown';
}
