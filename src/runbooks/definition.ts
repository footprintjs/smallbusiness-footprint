import type { Runbook, RunbookCommand, RunbookTarget } from './contract.js';

function reference(value: string): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value) ||
    value !== value.trim()
  ) {
    throw new TypeError(
      'Runbook identifiers must be bounded, opaque references.'
    );
  }
  return value;
}

export function bindRunbook(book: Runbook, scope: RunbookTarget) {
  const target = Object.freeze({
    tenant: reference(scope.tenant),
    incident: reference(scope.incident),
    subject: reference(scope.subject),
  });
  const runbook = reference(book.id);
  const version = reference(book.version);
  const actions = new Map(
    Object.entries(book.actions).map(([finding, action]) => [
      reference(finding),
      reference(action),
    ])
  );
  const operationKey = JSON.stringify([
    'owner-runbook',
    target.tenant,
    target.incident,
  ]);

  function proposal(finding: string | null): RunbookCommand | null {
    const action = finding === null ? undefined : actions.get(finding);
    if (finding === null || action === undefined) return null;
    return { ...target, runbook, version, finding, action, operationKey };
  }

  function matches(saved: RunbookCommand | null): saved is RunbookCommand {
    if (!saved) return false;
    const expected = proposal(saved.finding);
    return (
      expected !== null &&
      expected.action === saved.action &&
      expected.tenant === saved.tenant &&
      expected.incident === saved.incident &&
      expected.subject === saved.subject &&
      expected.runbook === saved.runbook &&
      expected.version === saved.version &&
      expected.operationKey === saved.operationKey
    );
  }

  return { target, proposal, matches };
}
export type BoundRunbook = ReturnType<typeof bindRunbook>;
