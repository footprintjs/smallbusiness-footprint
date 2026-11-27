/** Application data. IDs name trusted ports and a localized guidance entry. */
export interface RunbookDefinition {
  readonly id: string;
  readonly revision: string;
  readonly guidanceKey: string;
  readonly checks: readonly string[];
  readonly action: string;
}

export interface RunbookTarget {
  readonly tenantId: string;
  readonly incidentId: string;
  readonly subjectId: string;
}

export type RunbookCheckResult = 'pass' | 'blocked' | 'unknown';
export type RunbookActionResult = 'applied' | 'ineligible' | 'unknown';
export type RunbookDecision = 'approve' | 'decline';
export type RunbookOutcome = 'checks-blocked' | 'checks-unknown' | 'declined' | 'invalid-decision'
  | 'applied' | 'ineligible' | 'action-unknown';

export type RunbookCheck = (target: RunbookTarget) => Promise<RunbookCheckResult>;
/** Revalidate current eligibility and atomically deduplicate at the effect boundary. */
export type RunbookAction = (target: RunbookTarget, idempotencyKey: string) => Promise<RunbookActionResult>;

export interface RunbookPorts {
  readonly checks: ReadonlyMap<string, RunbookCheck>;
  readonly actions: ReadonlyMap<string, RunbookAction>;
}

export interface RunbookState {
  binding: string;
  runbookId: string;
  revision: string;
  guidanceKey: string;
  action: string;
  checks: { id: string; result: RunbookCheckResult }[];
  readiness: RunbookCheckResult;
  decision: RunbookDecision | 'invalid';
  outcome: RunbookOutcome;
}
