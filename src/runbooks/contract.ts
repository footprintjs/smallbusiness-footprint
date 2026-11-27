/** Opaque, non-secret references suitable for a saved run. */
export interface RunbookTarget {
  readonly tenant: string;
  readonly incident: string;
  readonly subject: string;
}

/** Trusted shop configuration: each recognized finding offers exactly one named action. */
export interface Runbook {
  readonly id: string;
  readonly version: string;
  readonly actions: Readonly<Record<string, string>>;
}

export interface RunbookCommand extends RunbookTarget {
  readonly runbook: string;
  readonly version: string;
  readonly finding: string;
  readonly action: string;
  readonly operationKey: string;
}

export type ActionResult = 'applied' | 'already-applied' | 'stale' | 'conflict' | 'unknown';

/** The trusted host supplies the identifiers from the proposal shown to the owner. */
export interface RunbookDecision {
  readonly decision: 'approve' | 'decline';
  readonly incident: string;
  readonly action: string;
}

export type RunbookInspection = 'found' | 'none' | 'failed';
export type RunbookOutcome =
  | ActionResult
  | 'unresolved'
  | 'declined'
  | 'invalid-decision'
  | 'scope-mismatch';

export interface RunbookPorts {
  /** Read only. Return a configured finding, or null when the record cannot settle it. */
  inspect(target: Readonly<RunbookTarget>): Promise<string | null>;
  /** At the authoritative store, atomically check scope and finding and deduplicate the
   * effect by operationKey. Replay the stored outcome for an identical command. A
   * different command for the same key returns conflict and never executes another action.
   */
  applyOnce(command: Readonly<RunbookCommand>): Promise<ActionResult>;
}

export interface State {
  proposal: RunbookCommand | null;
  inspection: RunbookInspection;
  ready: boolean;
  approved: boolean;
  outcome?: RunbookOutcome;
}
