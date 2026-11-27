# Owner-approved runbooks

Use `smallbusiness-footprint/runbooks` on the server. Each application defines which read-only findings allow which actions. Give each incident a stable identity and use opaque, non-secret identifiers in the runbook and target. Proposals and outcomes appear in the execution record.

```ts
import { FlowChartExecutor } from 'footprintjs';
import { ownerRunbookChart, type RunbookPorts } from 'smallbusiness-footprint/runbooks';

const book = {
  id: 'settlement', version: '1',
  actions: { paid: 'confirm-order', unpaid: 'release-stock' },
};
const target = { tenant: 'shop-a', incident: 'incident-1', subject: 'order-1' };

async function start(ports: RunbookPorts) {
  const run = new FlowChartExecutor(ownerRunbookChart(book, target, ports));
  await run.run();
  if (run.isPaused()) return { checkpoint: run.getCheckpoint() };
  return { outcome: run.getSnapshot().sharedState?.outcome };
}
```

Persist the checkpoint on the server. On the owner’s response, authenticate the owner, check their authority over this incident and consume their single-use approval link. Load the saved checkpoint, target and versioned runbook from trusted storage. Build the answer from the incident and action in the authenticated proposal shown to the owner. Rebuild the same chart with the trusted adapters in a fresh executor, then call `run.resume(checkpoint, { decision: 'approve', incident, action })` or use the same shape with `decision: 'decline'`. The incident and action must match the saved proposal. The host is responsible for preventing reuse of a used or declined link.

The inspection port returns a finding or `null`. The chart records `inspection: 'found'` for a finding, `'none'` for a read that returned no finding, or `'failed'` when the read throws. It records no error text. An unrecognized finding, no finding, or a failed read records `unresolved` and finishes before approval. A bound decline records `declined`. An unrecognized or mismatched answer records `invalid-decision`. A changed chart binding records `scope-mismatch`.

The action port receives the recorded tenant, incident, subject, runbook, version, finding, action and operation key. Enforce the scope and compare the current authoritative finding inside the same transaction as the change. Return `stale` if the condition has changed. The first successful commit records `applied`. Atomically retain the command and outcome by operation key and return `already-applied` on replay of that command. Return `conflict` if the key already holds a different command. The key belongs to one tenant and incident, so a different action cannot execute after an action has committed for that incident. For external effects the provider must support equivalent conditional execution and durable idempotency.

If the store cannot establish whether an effect occurred, the chart records `unknown`. Reconcile with the stored operation key before deciding what to tell the customer. An in-memory set in a fixture exercises this contract. Production adapters need durable storage across processes and restarts.
