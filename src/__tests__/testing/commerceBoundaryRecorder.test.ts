import { describe, expect, it } from 'vitest';
import { flowChart, FlowChartExecutor } from 'footprintjs';
import { diagnoseFailureRecording } from 'footprint-blueprint/diagnostics';
import { createCommerceBoundaryRecorder } from '../../diagnostics/runtime.js';
import { BOUNDARY_EVIDENCE_SCENARIOS, runBoundaryEvidenceScenario } from '../../testing/boundaryScenarios.js';
import { SCENARIOS } from '../../testing/runner.js';

describe('commerce runtime boundary evidence', () => {
  it('keeps the original catalog stable and separates its own opt-in native collector catalog', () => {
    expect(SCENARIOS).toHaveLength(27); expect(BOUNDARY_EVIDENCE_SCENARIOS).toHaveLength(12);
    expect(new Set(BOUNDARY_EVIDENCE_SCENARIOS.map(row => row.id)).size).toBe(12);
    expect(Object.isFrozen(BOUNDARY_EVIDENCE_SCENARIOS)).toBe(true);
    expect(BOUNDARY_EVIDENCE_SCENARIOS.every(row => Object.keys(row).sort().join() === 'id,title')).toBe(true);
  });
  it.each(BOUNDARY_EVIDENCE_SCENARIOS)('$id executes the real recorder, stores/reloads safely and reveals no provider payload', async ({ id }) => {
    const { record, observed } = await runBoundaryEvidenceScenario(id, { storeId: 'another-brand-local-test' });
    expect(record.diagnostics.persistence).toBe('stored');
    expect(record.runId).toBe(record.nativeSnapshot?.runId);
    const reloaded = JSON.parse(JSON.stringify(record));
    const diagnosis = diagnoseFailureRecording(reloaded);
    expect(diagnosis.coverage.upstreamRootCause).toBe('unknown');
    expect(diagnosis.coverage.sdkRetryDecisions).toBe('unknown');
    expect(observed).toMatchObject({ mode: 'local-sdk-double', modelCalls: 0, networkCalls: 0, cloudCalls: 0, earlierSnapshotUnchanged: true });
    expect(JSON.stringify(record)).not.toContain('PRIVATE');
    expect(JSON.stringify(record)).not.toContain('existing-local-operation-key');
    expect(JSON.stringify(record)).not.toContain(id);
  });
  it.each([
    ['boundary-db-auth', 'auth', 400, 1],
    ['boundary-db-throttled', 'rate-limited', 400, 3],
    ['boundary-db-server', 'server', 503, 1],
  ] as const)('%s retains actual response metadata and keeps SDK transport retries separate from the logical call', async (id, category, httpStatus, dispatches) => {
    const { record, observed } = await runBoundaryEvidenceScenario(id);
    expect(observed.logicalInvocations).toBe(1); expect(observed.physicalDispatches).toBe(dispatches);
    expect(record.coverage).toMatchObject({ logicalCalls: 1, physicalObservations: dispatches, droppedEvents: 0, unboundObservations: 0 });
    expect(record.physicalEvidence).toHaveLength(dispatches);
    expect(record.boundaryEvidence.filter(row => row.decision)).toHaveLength(1);
    expect(record.boundaryEvidence.every(row => row.category === category && row.httpStatus === httpStatus)).toBe(true);
    expect(record.physicalEvidence?.every(row => row.nativeDecisionMeaning === 'engine-interpretation' && row.sdkRetryDecision === 'unknown')).toBe(true);
    const report = diagnoseFailureRecording(record);
    expect(report.status).toBe('failed');
    expect(report.coverage).toMatchObject({ logicalSDKCalls: 1, physicalTransportAttempts: dispatches, physicalAttemptCounts: 'reported-only' });
  });
  it('recognizes a recovered SDK read without inventing a retry decision or making another logical call', async () => {
    const { record, observed } = await runBoundaryEvidenceScenario('boundary-db-recovered');
    expect(observed).toMatchObject({ logicalInvocations: 1, physicalDispatches: 3, businessResult: 'ok' });
    const report = diagnoseFailureRecording(record);
    expect(report.status).toBe('recovered');
    expect(report.coverage).toMatchObject({ logicalSDKCalls: 1, physicalTransportAttempts: 3, sdkRetryDecisions: 'unknown' });
    expect(record.physicalEvidence?.map(row => row.reportedAttempt)).toEqual([1, 2, 3]);
  });
  it.each(['boundary-payment-unknown', 'boundary-payment-reconcile-applied', 'boundary-payment-reconcile-unknown'])('%s never resends an uncertain payment or rewrites its original outcome', async id => {
    const { record, observed } = await runBoundaryEvidenceScenario(id);
    expect(observed.paymentWriteAttempts).toBe(1);
    expect(observed.businessResult).toBe('unknown');
    const chargeRows = record.boundaryEvidence.filter(row => row.operation === 'charge');
    expect(chargeRows.length).toBeGreaterThan(0); expect(chargeRows.every(row => row.effect === 'unknown')).toBe(true);
    const report = diagnoseFailureRecording(record);
    expect(report.status).toBe('unknown'); expect(report.coverage.externalEffect).toBe('unknown');
    if (id.endsWith('applied')) {
      expect(observed.reconciliation).toBe('applied');
      expect(record.boundaryEvidence.some(row => row.operation === 'reconcile-payment' && row.outcome === 'ok' && row.effect === 'none')).toBe(true);
    }
  });
  it('records cancellation and a real call timeout as different native outcomes', async () => {
    const cancelled = await runBoundaryEvidenceScenario('boundary-caller-cancelled');
    const timed = await runBoundaryEvidenceScenario('boundary-read-timeout');
    expect(cancelled.observed).toMatchObject({ businessResult: 'aborted', physicalDispatches: 1 });
    expect(cancelled.record.boundaryEvidence.some(row => row.outcome === 'aborted')).toBe(true);
    expect(timed.record.boundaryEvidence.some(row => row.outcome === 'timeout' && row.category === 'timeout')).toBe(true);
    expect(timed.observed.physicalDispatches).toBe(1);
    expect(cancelled.record.physicalEvidence).toHaveLength(0); expect(timed.record.physicalEvidence).toHaveLength(0);
    // No completed SDK transport observation is a coverage gap, never evidence that a dispatch did not happen.
  });
  it('marks late callbacks and row-cap omissions instead of inventing complete physical evidence', async () => {
    const late = await runBoundaryEvidenceScenario('boundary-late-report');
    expect(late.observed).toMatchObject({ businessResult: 'ok', earlierSnapshotUnchanged: true });
    expect(late.record.coverage).toMatchObject({ lateReports: 1, physicalObservations: 1 });
    expect(late.record.physicalEvidence).toHaveLength(0);
    expect(late.record.diagnostics.observer).toBe('failed');
    const partial = await runBoundaryEvidenceScenario('boundary-partial-recording');
    expect(partial.record.coverage?.droppedEvents).toBeGreaterThan(0);
    expect(partial.record.diagnostics.observer).toBe('failed');
    expect(diagnoseFailureRecording(partial.record).coverage.attemptBinding).toBe('partial');
  });
  it('allows custom vendor classification through the same native collector without adding a provider SDK', async () => {
    const recorder = createCommerceBoundaryRecorder({ normalizeError: (_error, options) => ({ category: 'rate-limited', code: 'DEPENDENCY_RATE_LIMITED', effect: options.effect === 'read' ? 'none' : 'unknown' }) });
    const executor = new FlowChartExecutor(flowChart('Custom vendor boundary', async scope => {
      try { await recorder.run(scope, { system: 'warehouse', operation: 'read', target: 'warehouse.read', effect: 'read' }, () => { throw new Error('PRIVATE'); }); }
      catch { /* Map private provider errors at the host stage boundary. */ }
    }, 'warehouse-read').build());
    executor.attachFlowRecorder(recorder.flowRecorder); await executor.run();
    expect(recorder.snapshot().boundaryEvidence[0]).toMatchObject({ target: 'warehouse', category: 'rate-limited' });
  });
  it.each([
    ['ConditionalCheckFailedException', 400], ['TransactionCanceledException', 400], ['InternalServerError', 503],
  ])('preserves the original completed write error %s without clearing unknown effect evidence', async (name, httpStatus) => {
    const original = Object.assign(new Error('PRIVATE provider details'), { name, $metadata: { httpStatusCode: httpStatus, attempts: 2 } });
    const recorder = createCommerceBoundaryRecorder(); let caught: unknown;
    const executor = new FlowChartExecutor(flowChart('Guarded write', async scope => {
      try {
        await recorder.run(scope, { system: 'database', operation: 'conditional-update', target: 'database.update', effect: 'write', idempotencyKey: 'existing-durable-command' }, context => {
          context.observePhysical({ source: 'sdk-double', phase: 'response-complete', outcome: 'failed', startedAt: Date.now(), durationMs: 0,
            attempt: 2, httpStatus, error: original });
          throw original;
        });
      } catch (error) { caught = error; }
    }, 'guarded-write').build());
    executor.attachFlowRecorder(recorder.flowRecorder); await executor.run();
    expect(caught).toBe(original);
    expect(recorder.snapshot().boundaryEvidence.every(row => row.effect === 'unknown')).toBe(true);
    expect(recorder.snapshot().physicalEvidence[0].reportedMaximum).toBeUndefined();
    expect(JSON.stringify(executor.getSnapshot({ redact: true }))).not.toContain('PRIVATE');
  });
  it('discloses omitted transport observations without inventing dispatch counts or changing an acknowledged result', async () => {
    const recorder = createCommerceBoundaryRecorder(); let businessResult: unknown;
    const executor = new FlowChartExecutor(flowChart('Incomplete adapter coverage', async scope => {
      businessResult = await recorder.run(scope, { system: 'shipping', operation: 'rates', target: 'shipping.rates', effect: 'read' }, context => {
        context.observePhysical({ source: 'sdk-double', phase: 'response-complete', outcome: 'ok', startedAt: Date.now(), durationMs: 0, httpStatus: 200 });
        context.markIncomplete('multiple-dispatches');
        return 'acknowledged';
      });
    }, 'adapter-coverage').build());
    executor.attachFlowRecorder(recorder.flowRecorder); await executor.run();
    const collected = recorder.snapshot();
    expect(businessResult).toBe('acknowledged');
    expect(collected.coverage).toMatchObject({ logicalCalls: 1, physicalObservations: 1, omittedObservations: 1 });
    expect(collected.diagnostics.observer).toBe('failed');
    const record = JSON.parse(JSON.stringify({ schemaVersion: 1, storeId: 'brand-a', flowId: 'shipping-coverage', runId: collected.runId,
      nativeSnapshot: executor.getSnapshot({ redact: true }), boundaryEvidence: collected.boundaryEvidence,
      physicalEvidence: collected.physicalEvidence, coverage: collected.coverage, diagnostics: { ...collected.diagnostics, persistence: 'stored' } }));
    const report = diagnoseFailureRecording(record);
    expect(report.status).toBe('unknown');
    expect(report.coverage.physicalAttemptCounts).toBe('reported-only');
    expect(report.coverage.physicalTransportAttempts).toBe(1);
  });
  it.each([['ECONNRESET', 'network'], ['ETIMEDOUT', 'timeout']] as const)('retains HTTP200 headers and later %s body failure as uncertain payment evidence', async (code, category) => {
    const original = Object.assign(new Error('PRIVATE partial body'), { status: 200, cause: { code } });
    const recorder = createCommerceBoundaryRecorder(); let caught: unknown;
    const executor = new FlowChartExecutor(flowChart('Partial provider response', async scope => {
      try {
        await recorder.run(scope, { system: 'payment', operation: 'refund', target: 'payment.refund', effect: 'write', idempotencyKey: 'durable-refund-command' }, context => {
          context.observePhysical({ source: 'sdk-double', phase: 'headers', outcome: 'ok', startedAt: Date.now(), durationMs: 0, httpStatus: 200 });
          throw original;
        });
      } catch (error) { caught = error; }
    }, 'partial-response').build());
    executor.setRedactionPolicy({ keys: ['idempotencyKey'] });
    executor.attachFlowRecorder(recorder.flowRecorder); await executor.run();
    expect(caught).toBe(original);
    expect(recorder.snapshot().boundaryEvidence.some(row => row.category === category && row.httpStatus === 200)).toBe(true);
    expect(recorder.snapshot().boundaryEvidence.every(row => row.effect === 'unknown')).toBe(true);
    expect(recorder.snapshot().coverage).toMatchObject({ logicalCalls: 1, physicalObservations: 1 });
    expect(JSON.stringify(executor.getSnapshot({ redact: true }))).not.toContain('PRIVATE');
  });
  it('uses paired host persistence ports, preserves original business state on sink failure and rejects mismatched readback', async () => {
    let stored: unknown, writes = 0, reads = 0;
    const normal = await runBoundaryEvidenceScenario('boundary-db-auth', {
      async persist(value) { writes++; stored = JSON.parse(JSON.stringify(value)); },
      async load() { reads++; return stored; },
    });
    expect(writes).toBe(1); expect(reads).toBe(1); expect(normal.record.diagnostics.persistence).toBe('stored');
    for (const ports of [
      { async persist() { throw new Error('PRIVATE storage'); }, async load() { throw new Error('must not load'); } },
      { async persist() {}, async load() { return { incorrect: true }; } },
    ]) {
      const failed = await runBoundaryEvidenceScenario('boundary-db-auth', ports);
      expect(failed.observed.businessResult).toBe('failed');
      expect(failed.record.diagnostics.persistence).toBe('failed'); expect(failed.record.nativeSnapshot).toBe(null);
      expect(diagnoseFailureRecording(failed.record).status).toBe('unknown');
    }
    await expect(runBoundaryEvidenceScenario('not-a-scenario')).rejects.toThrow();
    await expect(runBoundaryEvidenceScenario('boundary-success', { persist() {} } as never)).rejects.toThrow();
  });
});
