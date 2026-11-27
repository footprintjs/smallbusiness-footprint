# Owner-approved runbooks

Import `createRunbookChart` from `smallbusiness-footprint/runbooks` in a backend. A runbook is application data. Its `guidanceKey` points to owner-authored instructions in the application's language catalog. Increment the revision when changing instructions, check semantics or the action implementation.

```ts
const definition = {
  id: 'restore-access',
  revision: '1',
  guidanceKey: 'guidance.restore-access',
  checks: ['request-is-open'],
  action: 'restore-access',
};
const ports = {
  checks: new Map([['request-is-open', readRequestEligibility]]),
  actions: new Map([['restore-access', restoreAccessOnce]]),
};
const target = { tenantId, incidentId, subjectId };
const chart = createRunbookChart(definition, target, ports);
const run = new FlowChartExecutor(chart); // from footprintjs
await run.run();
const checkpoint = run.getCheckpoint();
```

The library resolves every named port when building the chart. Checks receive only the frozen target. They return `pass`, `blocked`, or `unknown`. The chart records each result. A blocked check closes the case as `checks-blocked`. Otherwise a missing answer, including a thrown read, produces `checks-unknown`. Only unanimous passing checks reach the interrupt.

Store the complete native checkpoint on the server. Keep the binding to the authenticated owner, tenant, incident, subject, and immutable definition revision with it. Render guidance from the stored definition. Accept only the authenticated owner's literal `approve` or `decline` as resume input. Keep raw form data and checkpoint contents out of the request body used to decide the action. Atomically consume the owner's decision once and retain it for any delivery retry. The host owns these session and storage operations.

```ts
const resumed = new FlowChartExecutor(createRunbookChart(definition, target, ports));
await resumed.resume(storedCheckpoint, ownerDecision);
const { decision, outcome } = resumed.getSnapshot().sharedState;
```

The chart refuses a restore if the runbook, guidance key, checks, action or target differs from the stored binding. The record identifies the definition, checks, decision and outcome. Raw subject identifiers stay in the adapter closure. Use opaque identifiers in configuration and the engine's usual redaction policy when retaining records.

The action port receives one target and one stable operation key derived from its tenant, incident and subject. Across workers and restarts the adapter must bind this key to the intended operation, recheck eligibility at commit time, and return the existing outcome on replay. Use an atomic conditional write or a provider's idempotency and reconciliation facility. A process-local set or a receipt stored only after a remote effect cannot provide that guarantee.

| Result | Meaning |
| --- | --- |
| `applied` | The authoritative action adapter acknowledged the operation. |
| `ineligible` | The adapter found the subject ineligible at commit and left it alone. |
| `action-unknown` | The adapter threw, returned unknown, or supplied an unrecognized result. Reconcile using the same operation key. |
| `declined` | The owner declined. |
| `invalid-decision` | The resume input did not match a supported owner decision. |
| `checks-blocked` / `checks-unknown` | The run ended during eligibility checks. |
