import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runFailureScenario, listFailureScenarios } from '../../testing.js';
import { diagnoseFailureRecording } from 'footprint-blueprint/diagnostics';

function nativeAttempts(snapshot) {
  const result = new Map();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.attempts) && typeof value.runtimeStageId === 'string') {
      for (const attempt of value.attempts) result.set(`${attempt.series}@${attempt.attempt}`, { ...attempt, runtimeStageId: value.runtimeStageId });
    }
    for (const [key, child] of Object.entries(value)) if (key !== 'attempts') {
      if (Array.isArray(child)) child.forEach(visit); else visit(child);
    }
  }
  visit(snapshot.executionTree); return result;
}
const callsFor = (record, target) => [...nativeAttempts(record.nativeSnapshot).values()].filter(row => row.kind === 'call' && row.target === target);

test('catalog contains 27 local scenarios and exposes no mutable fault script or expected diagnosis', () => {
  const catalog = listFailureScenarios();
  assert.equal(catalog.length, 27); assert.equal(new Set(catalog.map(row => row.id)).size, 27);
  assert.ok(catalog.every(row => /^[a-z0-9-]+$/.test(row.id) && Object.keys(row).sort().join() === 'id,title'));
  assert.ok(Object.isFrozen(catalog) && Object.isFrozen(catalog[0]));
  assert.throws(() => { catalog[0].id = 'tampered'; }, TypeError); assert.equal(listFailureScenarios()[0].id, 'success');
});

test('success is really stored/read back, redacted and bound to native execution identities', async () => {
  let stored, writes = 0, reads = 0;
  const { record, observed } = await runFailureScenario('success', { storeId: 'test-store',
    persist: async value => { writes++; stored = structuredClone(value); },
    load: async key => { reads++; assert.deepEqual(key, { storeId: 'test-store', runId: stored.runId, flowId: stored.flowId }); return structuredClone(stored); } });
  assert.equal(writes, 1); assert.equal(reads, 1); assert.equal(record.runId, record.nativeSnapshot.runId);
  assert.deepEqual(observed.physicalCalls, { database: 1, payment: 1, shipping: 1 });
  assert.deepEqual(observed.physicalWriteAttempts, { database: 0, payment: 1, shipping: 0 }); assert.equal(observed.businessResult, 'ok');
  assert.deepEqual(record.diagnostics, { persistence: 'stored', observer: 'ok' });
  assert.doesNotMatch(JSON.stringify(record), /LOCAL_SECRET_CANARY_NEVER_EXPORT|synthetic-order-payment|"(?:plan|ledger|expected|scenarioId)"/);
  assert.ok(record.nativeSnapshot.executionTree && record.nativeSnapshot.commitLog.length > 0);
  const native = nativeAttempts(record.nativeSnapshot);
  assert.ok(native.size >= record.boundaryEvidence.length);
  for (const event of record.boundaryEvidence) {
    const attempt = native.get(event.attemptId); assert.ok(attempt, event.attemptId);
    assert.equal(event.runtimeStageId, attempt.runtimeStageId); assert.equal(event.decision.next, attempt.next);
    assert.equal(event.decision.reason, attempt.reason);
  }
  record.nativeSnapshot.sharedState.mutatedByReader = true;
  assert.equal(stored.nativeSnapshot.sharedState.mutatedByReader, undefined);
});

test('DB connection and AWS-shaped authorization failures block downstream sends with causal evidence', async () => {
  for (const id of ['db-connection-refused', 'db-auth-denied']) {
    const { record, observed } = await runFailureScenario(id);
    assert.deepEqual(observed.physicalCalls, { database: 1, payment: 0, shipping: 0 });
    assert.equal(observed.businessResult, 'failed');
    const source = record.boundaryEvidence.find(row => row.target === 'database' && row.outcome === 'failed'); assert.ok(source);
    const blocked = record.boundaryEvidence.filter(row => row.outcome === 'blocked');
    assert.equal(blocked.length, 2); assert.ok(blocked.every(row => row.causedBy === source.id && row.effect === 'none'));
    if (id === 'db-auth-denied') {
      const native = callsFor(record, 'database.read-order')[0];
      assert.equal(native.category, 'unknown', 'AWS metadata is not fabricated into a native status field');
      assert.equal(source.httpStatus, 400, 'the adapter preserves the real AWS HTTP400 status');
    }
  }
});

test('database throttling is retried through the SDK using adapter classification', async () => {
  const { record, observed } = await runFailureScenario('db-throttled');
  assert.equal(observed.physicalCalls.database, 2); assert.equal(observed.physicalCalls.payment, 0);
  const calls = callsFor(record, 'database.read-order'); assert.equal(calls.length, 2);
  assert.equal(calls[0].next, 'retry'); assert.equal(calls[1].next, 'stop');
  assert.ok(calls.every(row => row.category === 'unknown'));
});

test('provider bad request/auth never retry; a write HTTP500 remains unknown and is not blindly retried', async () => {
  for (const [id, status] of [['provider-bad-request', 400], ['provider-unauthorized', 401], ['provider-server-error', 500]]) {
    const { record, observed } = await runFailureScenario(id);
    assert.equal(observed.physicalWriteAttempts.payment, 1); assert.equal(observed.physicalCalls.shipping, 0);
    const event = record.boundaryEvidence.find(row => row.operation === 'charge'); assert.equal(event.httpStatus, status);
    assert.equal(event.effect, status === 500 ? 'unknown' : 'none');
    assert.equal(observed.businessResult, status === 500 ? 'unknown' : 'failed');
    assert.equal(callsFor(record, 'payment.charge').length, 1);
  }
});

test('rate-limit exhaustion has three physical attempts and nonstandard/malformed errors stay distinct', async () => {
  const limited = await runFailureScenario('provider-rate-limited');
  assert.equal(limited.observed.physicalCalls.shipping, 3);
  assert.deepEqual(callsFor(limited.record, 'shipping.quote').map(row => row.next), ['retry', 'retry', 'stop']);
  for (const id of ['provider-nonstandard-error', 'malformed-success']) {
    const { record, observed } = await runFailureScenario(id); assert.equal(observed.physicalCalls.shipping, 1);
    const event = record.boundaryEvidence.find(row => row.target === 'shipping'); assert.equal(event.outcome, 'failed');
    if (id === 'malformed-success') assert.equal(event.httpStatus, 200);
    else assert.equal(event.httpStatus, undefined);
  }
});

test('500/429 recovery retains the failed physical attempt and the native retry decision', async () => {
  for (const id of ['server-error-then-success', 'rate-limit-then-success']) {
    const { record, observed } = await runFailureScenario(id); assert.equal(observed.businessResult, 'ok');
    assert.equal(observed.physicalCalls.shipping, 2);
    const calls = callsFor(record, 'shipping.quote'); assert.equal(calls.length, 2);
    assert.equal(calls[0].outcome, 'failed'); assert.equal(calls[0].next, 'retry');
    assert.equal(calls[1].outcome, 'ok'); assert.equal(calls[1].next, 'done');
  }
});

test('own timeout differs from caller cancellation and neither is evidence of a remote outage', async () => {
  const own = await runFailureScenario('own-timeout'), caller = await runFailureScenario('caller-abort');
  assert.equal(own.observed.physicalCalls.shipping, 1); assert.equal(caller.observed.physicalCalls.shipping, 1);
  assert.equal(callsFor(own.record, 'shipping.quote')[0].outcome, 'timeout');
  assert.equal(callsFor(caller.record, 'shipping.quote')[0].outcome, 'aborted');
  assert.equal(callsFor(caller.record, 'shipping.quote')[0].reason, 'aborted');
});

test('injected local circuit allows two sends, then the third native admission attempt is blocked', async () => {
  const { record, observed } = await runFailureScenario('local-circuit-open');
  assert.equal(observed.physicalCalls.shipping, 2); assert.equal(observed.admittedCalls.shipping, 3);
  const calls = callsFor(record, 'shipping.quote'); assert.equal(calls.length, 3);
  const block = record.boundaryEvidence.findLast(row => row.target === 'shipping');
  assert.equal(block.outcome, 'blocked'); assert.equal(block.effect, 'none'); assert.ok(block.causedBy);
  assert.ok(record.boundaryEvidence.some(row => row.id === block.causedBy && row.outcome === 'failed'));
  assert.equal(observed.businessResult, 'failed');
});

test('SDK budget preflight refuses four40s attempts against120s without executing any provider', async () => {
  const { record, observed } = await runFailureScenario('budget-preflight');
  assert.deepEqual(observed.physicalCalls, { database: 0, payment: 0, shipping: 0 });
  assert.deepEqual(observed.budgetPreflight, { knownMs: 160000, budgetMs: 120000, over: true, buildRefused: true, physicalCalls: 0 });
  const event = record.boundaryEvidence.find(row => row.operation === 'budget-preflight'); assert.equal(event.outcome, 'blocked');
  assert.ok(nativeAttempts(record.nativeSnapshot).has(event.attemptId));
});

test('runtime call cap uses remaining deadline and a retry wait that will not fit never starts', async () => {
  const capped = await runFailureScenario('runtime-budget-cap');
  assert.equal(capped.observed.physicalCalls.shipping, 1);
  const call = callsFor(capped.record, 'shipping.quote')[0]; assert.ok(call.timeoutMs > 0 && call.timeoutMs <= 25);
  assert.ok(call.durationMs < 500); assert.ok(['timeout', 'aborted'].includes(call.outcome));
  const noWait = await runFailureScenario('runtime-budget-no-retry');
  assert.equal(noWait.observed.physicalCalls.shipping, 1);
  assert.equal(callsFor(noWait.record, 'shipping.quote')[0].reason, 'no-time-left');
});

test('a timed-out touching payment has one physical write and stays unknown without reconciliation', async () => {
  const { record, observed } = await runFailureScenario('payment-timeout-unknown');
  assert.equal(observed.physicalWriteAttempts.payment, 1); assert.equal(observed.physicalCalls.payment, 1);
  assert.equal(observed.physicalCalls.shipping, 0); assert.equal(observed.businessResult, 'unknown');
  const call = callsFor(record, 'payment.charge')[0]; assert.equal(call.outcome, 'timeout'); assert.equal(call.effect, 'unknown');
  assert.equal(call.next, 'stop');
});

test('reconciliation is a separate authoritative read: applied permits shipping, unknown blocks it', async () => {
  for (const [id, applied] of [['payment-timeout-reconcile-applied', true], ['payment-timeout-reconcile-unknown', false]]) {
    const { record, observed } = await runFailureScenario(id);
    assert.equal(observed.physicalWriteAttempts.payment, 1); assert.equal(observed.physicalCalls.payment, 2);
    assert.equal(observed.admittedCalls.payment, 2, 'both the charge and authoritative read enter their local ports');
    assert.equal(observed.physicalCalls.shipping, applied ? 1 : 0); assert.equal(observed.businessResult, applied ? 'ok' : 'unknown');
    const charge = record.boundaryEvidence.find(row => row.operation === 'charge');
    const reconciled = record.boundaryEvidence.find(row => row.operation === 'reconcile');
    assert.equal(charge.effect, 'unknown'); assert.equal(reconciled.effect, applied ? 'confirmed' : 'unknown');
    assert.equal(reconciled.causedBy, charge.id); assert.equal(callsFor(record, 'payment.reconcile').length, 1);
  }
});

test('engine keyless guard refuses before any write and its actual stage attempt binds the boundary event', async () => {
  const { record, observed } = await runFailureScenario('payment-idempotency-guard');
  assert.equal(observed.physicalWriteAttempts.payment, 0); assert.equal(observed.physicalCalls.payment, 0);
  assert.equal(observed.physicalCalls.shipping, 0); assert.equal(callsFor(record, 'payment.charge').length, 0);
  const guard = record.boundaryEvidence.find(row => row.target === 'payment' && row.operation === 'charge');
  assert.equal(guard.outcome, 'blocked'); assert.equal(guard.effect, 'none');
  assert.equal(nativeAttempts(record.nativeSnapshot).get(guard.attemptId).kind, 'stage');
});

test('trace persistence failures disclose no stored native snapshot and retain original business outcomes', async () => {
  const failed = await runFailureScenario('primary-and-trace-store-fail');
  const succeeded = await runFailureScenario('business-success-trace-store-fail');
  assert.equal(failed.observed.businessResult, 'failed'); assert.equal(succeeded.observed.businessResult, 'ok');
  for (const { record } of [failed, succeeded]) {
    assert.equal(record.nativeSnapshot, null); assert.equal(record.diagnostics.persistence, 'failed');
    assert.deepEqual(record.boundaryEvidence, [], 'unstored boundary evidence is not passed off as a stored sidecar');
    assert.equal(record.diagnostics.code, 'LOCAL_TRACE_STORE_FAILED');
  }
  let reads = 0;
  const custom = await runFailureScenario('success', { persist: async () => { throw new Error('private storage details'); }, load: async () => { reads++; } });
  assert.equal(reads, 0); assert.equal(custom.record.nativeSnapshot, null); assert.equal(custom.observed.businessResult, 'ok');
  assert.doesNotMatch(JSON.stringify(custom), /private storage details/);
});

test('observer failure remains a separate diagnostic failure and cannot replace the business error', async () => {
  const { record, observed } = await runFailureScenario('primary-and-observer-fail');
  assert.equal(record.diagnostics.observer, 'failed'); assert.equal(record.diagnostics.persistence, 'stored');
  assert.equal(record.diagnostics.code, 'LOCAL_OBSERVER_FAILED'); assert.equal(observed.businessResult, 'failed');
  assert.equal(observed.physicalCalls.database, 1); assert.ok(record.nativeSnapshot);
  assert.ok(record.boundaryEvidence.some(row => row.target === 'database' && row.category === 'network' && row.outcome === 'failed'));
});

test('storage readback mismatch, incomplete ports and unknown scenarios never become stored-trace claims', async () => {
  let saved;
  const { record } = await runFailureScenario('success', { persist: async value => { saved = value; }, load: async () => ({ ...saved, runId: 'other-run' }) });
  assert.equal(record.nativeSnapshot, null); assert.equal(record.diagnostics.persistence, 'failed');
  await assert.rejects(runFailureScenario('success', { persist: async () => {} }), { code: 'FAILURE_LAB_STORAGE_PAIR_REQUIRED' });
  await assert.rejects(runFailureScenario('does-not-exist'), { code: 'FAILURE_LAB_SCENARIO_UNKNOWN' });
});

test('every scenario boundary binds the exact genuine native attempt, including local guard stages', async () => {
  for (const { id } of listFailureScenarios()) {
    const { record, observed } = await runFailureScenario(id);
    assert.equal(observed.networkCalls, 0); assert.equal(observed.modelCalls, 0); assert.equal(observed.cloudCalls, 0);
    if (record.nativeSnapshot === null) { assert.deepEqual(record.boundaryEvidence, []); continue; }
    assert.equal(record.runId, record.nativeSnapshot.runId);
    const native = nativeAttempts(record.nativeSnapshot), events = new Map();
    for (const row of record.boundaryEvidence) {
      assert.ok(!events.has(row.id), id); events.set(row.id, row);
      const attempt = native.get(row.attemptId); assert.ok(attempt, `${id}: ${row.attemptId}`);
      assert.equal(row.runtimeStageId, attempt.runtimeStageId, id);
      assert.equal(row.decision.next, attempt.next, id); assert.equal(row.decision.reason, attempt.reason, id);
      assert.equal(row.outcome === 'ok', attempt.outcome === 'ok', id);
      if (row.causedBy) assert.ok(events.get(row.causedBy)?.sequence < row.sequence, `${id}: explicit earlier cause`);
    }
    assert.doesNotMatch(JSON.stringify(record), /LOCAL_SECRET_CANARY_NEVER_EXPORT|synthetic-order-payment|"(?:plan|ledger|expected|scenarioId)"/);
  }
});

test('the pure diagnosis accepts all27 reloaded records without the scenario plan or observed counters', async () => {
  for (const { id } of listFailureScenarios()) {
    const { record } = await runFailureScenario(id);
    const report = diagnoseFailureRecording(JSON.parse(JSON.stringify(record)));
    assert.equal(report.coverage.upstreamRootCause, 'unknown', id);
    if (record.diagnostics.persistence === 'failed') {
      assert.equal(report.status, 'unknown'); assert.equal(report.coverage.nativeRecording, 'missing');
    } else assert.equal(report.coverage.attemptBinding, 'complete', id);
    if (id === 'success') assert.equal(report.status, 'ok');
    if (['server-error-then-success', 'rate-limit-then-success'].includes(id)) assert.equal(report.status, 'recovered');
    if (id === 'local-circuit-open') assert.equal(report.coverage.circuit, 'adapter-recorded');
  }
});

test('independent read-only probes record two separate causes, without running checkout or inventing a causal edge', async () => {
  for (const [id, observerFailed] of [['independent-db-shipping-failures', false], ['independent-db-shipping-observer-failure', true]]) {
    const { record, observed } = await runFailureScenario(id);
    assert.equal(record.flowId, 'local-failure-lab-independent-read-probes');
    assert.equal(observed.mode, 'independent-read-only-diagnostics');
    assert.deepEqual(observed.physicalCalls, { database: 1, payment: 0, shipping: 1 });
    assert.deepEqual(observed.physicalWriteAttempts, { database: 0, payment: 0, shipping: 0 });
    assert.equal(record.boundaryEvidence.length, 2);
    assert.ok(record.boundaryEvidence.every(row => row.outcome === 'failed' && row.effect === 'none'
      && row.operation === 'diagnostic-read' && row.causedBy === undefined));
    const native = nativeAttempts(record.nativeSnapshot);
    assert.ok([...native.values()].every(row => !row.target?.startsWith('payment.')));
    for (const row of record.boundaryEvidence) assert.equal(native.get(row.attemptId)?.runtimeStageId, row.runtimeStageId);
    const report = diagnoseFailureRecording(JSON.parse(JSON.stringify(record)));
    assert.equal(report.causes.length, 2);
    assert.ok(report.causes.every(row => row.code === 'BOUNDARY_FAILURE_RECORDED'));
    assert.ok(report.consequences.every(row => row.code !== 'DEPENDENT_FAILURE_RECORDED'));
    assert.equal(report.diagnosticFailures.length, observerFailed ? 1 : 0);
    if (observerFailed) assert.equal(report.diagnosticFailures[0].code, 'TRACE_OBSERVER_FAILED');
    assert.equal(record.diagnostics.observer, observerFailed ? 'failed' : 'ok');
  }
});

test('host storage records are bounded and getter-safe before property reads or serialization', async () => {
  let getters = 0, toJsonCalls = 0;
  for (const corrupt of [
    saved => Object.defineProperty({ ...saved }, 'runId', { enumerable: true, get() { getters++; return saved.runId; } }),
    saved => ({ ...saved, toJSON() { toJsonCalls++; return saved; } }),
    saved => Object.assign(Object.create({ runId: 'private' }), saved),
    saved => { const cyclic = { ...saved }; cyclic.nativeSnapshot = cyclic; return cyclic; },
  ]) {
    let saved;
    const { record, observed } = await runFailureScenario('success', {
      persist: async value => { saved = value; }, load: async () => corrupt(saved),
    });
    assert.equal(observed.businessResult, 'ok'); assert.equal(record.diagnostics.persistence, 'failed');
    assert.equal(record.nativeSnapshot, null); assert.deepEqual(record.boundaryEvidence, []);
    assert.doesNotMatch(JSON.stringify(record), /private/);
  }
  assert.equal(getters, 0); assert.equal(toJsonCalls, 0);
});
