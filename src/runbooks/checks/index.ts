import type { BoundRunbook } from '../binding.js';
import type { RunbookCheck, RunbookCheckResult, RunbookState, RunbookTarget } from '../types.js';

async function observe(read: RunbookCheck, target: RunbookTarget): Promise<RunbookCheckResult> {
  try {
    const result = await read(target);
    return result === 'pass' || result === 'blocked' ? result : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function readChecks(book: BoundRunbook) {
  return async (scope: RunbookState) => {
    const checks: RunbookState['checks'] = [];
    for (const { id, read } of book.checks) checks.push({ id, result: await observe(read, book.target) });
    scope.binding = book.binding;
    scope.runbookId = book.id;
    scope.revision = book.revision;
    scope.guidanceKey = book.guidanceKey;
    scope.action = book.action;
    scope.checks = checks;
    const results = new Set(checks.map(check => check.result));
    scope.readiness = results.has('blocked') ? 'blocked' : results.has('unknown') ? 'unknown' : 'pass';
  };
}
