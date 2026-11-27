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

Persist the checkpoint on the server. On the owner’s response, authenticate the owner, check their authority over this incident and consume their single-use approval link. Load the saved checkpoint, target and versioned runbook from trusted storage. Rebuild the same chart in a fresh executor, call `await run.resume(checkpoint, decision)` with `'approve'` or `'decline'`, and read the outcome from the snapshot.

The inspection port returns a configured finding or `null`. An unrecognized finding or failed read records `unresolved` and finishes before approval. A decline records `declined`. An unrecognized response records `invalid-decision`. A changed binding records `scope-mismatch`.

The action port receives the recorded tenant, incident, subject, runbook, version, finding, action and operation key. Enforce the scope and compare the current authoritative finding inside the same transaction as the change. Return `stale` if the condition has changed. The first successful commit records `applied`. Atomically retain the command and outcome by operation key, and return `already-applied` on replay of that command. Reject a conflicting command for an existing key. For external effects the provider must support equivalent conditional execution and durable idempotency.

If the store cannot establish whether an effect occurred, the chart records `unknown`. Reconcile with the stored operation key before deciding what to tell the customer. An in-memory set in a fixture exercises this contract. Production adapters need durable storage across processes and restarts.
