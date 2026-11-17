import { describe, expect, it } from 'vitest';
import { createRecordGraph, type RecordScope } from 'foottrace/cause';
import { createAfterSalesCauseReader, recordedAfterSalesCauseScopes } from '../../diagnostics/aftersalesCause.js';
import { createAfterSalesService } from '../../aftersales/runtime.js';
import { DEFAULT_AFTER_SALES_POLICY, type AfterSalesCase, type AfterSalesPayments, type AfterSalesRepository, type AfterSalesTrace } from '../../aftersales.js';

const PRIVATE = 'PRIVATE_NOTE_not_for_the_record';
const clone = <T>(value: T): T => structuredClone(value);
function fixture(state: AfterSalesCase['state'] = 'REQUESTED') {
  let record: AfterSalesCase = {
    caseId: 'private-case-id', orderId: 'private-order-id', storeId: 'private-store-id', requestId: 'private-request-id',
    kind: 'cancellation', state, version: 1, items: [{ lineId: 'private-line-id', quantity: 1 }],
    policy: clone(DEFAULT_AFTER_SALES_POLICY), reason: PRIVATE,
    createdAt: '2026-11-15T12:00:00.000Z', updatedAt: '2026-11-15T12:00:00.000Z',
  };
  const traces: AfterSalesTrace[] = [];
  let writes = 0;
  const unexpected = async (): Promise<never> => { throw new Error('An unrelated provider must not run'); };
  const repository: AfterSalesRepository = {
    getOrder: unexpected, findCase: unexpected, createCase: unexpected, prepareRefund: unexpected,
    completeRefund: unexpected, restock: unexpected,
    async getCase() { return clone(record); },
    async saveCase(input) {
      expect(input.expectedVersion).toBe(record.version);
      expect(input.record.version).toBe(record.version + 1);
      writes++;
      record = clone(input.record);
      return clone(record);
    },
  };
  const payments: AfterSalesPayments = { getPayment: unexpected, refund: unexpected, retrieveRefund: unexpected, findRefund: unexpected };
  const service = createAfterSalesService({
    storeId: record.storeId, repository, payments, authorizer: () => true,
    now: () => '2026-11-15T12:01:00.000Z', onTrace(trace) { traces.push(trace); },
  });
  return {
    traces, get writes() { return writes; },
    approve: () => service.action({ action: 'approve', caseId: record.caseId, expectedVersion: record.version, reason: PRIVATE },
      { actorId: 'private-owner-id', role: 'owner' }),
  };
}

type Commit = { runtimeStageId: string; stage: string; overwrite: Record<string, unknown> };
function approvalEvidence(trace: AfterSalesTrace) {
  // Only JSON that a host could actually save/reload is admitted to the public reader.
  const saved = JSON.parse(JSON.stringify(trace)) as AfterSalesTrace;
  const source = recordedAfterSalesCauseScopes(saved);
  for (const scope of source.scopes) {
    const commits = scope.commitLog as Commit[];
    const producer = commits.findIndex(row => Object.hasOwn(row.overwrite, 'ownerActionEligible'));
    const guard = commits.findIndex(row => row.stage.endsWith('approval-eligible') &&
      scope.reads?.[row.runtimeStageId]?.includes('ownerActionEligible'));
    if (producer >= 0 && guard >= 0) return { saved, source, scope, commits, producer, guard };
  }
  throw new Error('Saved approval record has no actual safe-fact writer and recorded guard read');
}
const context = () => ({ signal: new AbortController().signal });
const node = (graph: ReturnType<typeof createRecordGraph>, scope: RecordScope, commits: Commit[], index: number, key?: string) =>
  graph.nodeId(scope.address, { runtimeStageId: commits[index].runtimeStageId, commitIdx: index, ...(key ? { key } : {}) });

describe('saved after-sales backwalking through real business decisions', () => {
  it('follows the recorded approval control edge and its data edge to the safe-fact producer', async () => {
    const f = fixture();
    await expect(f.approve()).resolves.toMatchObject({ state: 'APPROVED' });
    expect(f.writes).toBe(1);
    const { source, scope, commits, producer, guard } = approvalEvidence(f.traces[0]);
    expect(producer).toBeLessThan(guard);
    expect(commits[producer].overwrite.ownerActionEligible).toBe(true);
    const effect = commits.findIndex(row => row.stage.endsWith('save-owner-approval'));
    expect(effect).toBeGreaterThan(guard);
    const graph = createRecordGraph(source.scopes);
    const guardParents = await graph.parents(node(graph, scope, commits, guard), context());
    expect(guardParents.edges).toContainEqual(expect.objectContaining({
      kind: 'data', nodeId: node(graph, scope, commits, producer, 'ownerActionEligible'),
    }));
    const effectParents = await graph.parents(node(graph, scope, commits, effect), context());
    expect(effectParents.edges).toContainEqual(expect.objectContaining({
      kind: 'control', attribution: 'recorded-control', nodeId: node(graph, scope, commits, guard),
    }));
    // A recorded contribution is evidence of this path, not provider-internal root-cause proof.
  });

  it('records the opposite eligibility fact and guard read without performing the rejected write', async () => {
    const f = fixture('APPROVED');
    await expect(f.approve()).rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' });
    expect(f.writes).toBe(0);
    const { source, scope, commits, producer, guard } = approvalEvidence(f.traces[0]);
    expect(commits[producer].overwrite.ownerActionEligible).toBe(false);
    const graph = createRecordGraph(source.scopes);
    expect((await graph.parents(node(graph, scope, commits, guard), context())).edges)
      .toContainEqual(expect.objectContaining({ kind: 'data', nodeId: node(graph, scope, commits, producer, 'ownerActionEligible') }));
  });

  it('preserves an incomplete answer when the saved control capture is missing', async () => {
    const f = fixture(); await f.approve();
    const saved = JSON.parse(JSON.stringify(f.traces[0])) as AfterSalesTrace;
    delete saved.causeCapture;
    const source = recordedAfterSalesCauseScopes(saved);
    expect(source.incomplete).toBe(true);
    const reader = createAfterSalesCauseReader(saved);
    const selected = reader.nodes.find(row => row.selection.key === 'ownerActionEligible');
    expect(selected).toBeDefined();
    const answer = await reader.explain(selected!.id);
    expect(answer.confidence).toBe('incomplete');
    expect(answer.rootCause).toBeUndefined();
    expect(answer.gaps).toContainEqual(expect.objectContaining({ code: 'not-collected' }));
  });

  it('keeps private identifiers and notes outside full saved backwalking records', async () => {
    const f = fixture(); await f.approve();
    const text = JSON.stringify(f.traces);
    for (const value of [PRIVATE, 'private-case-id', 'private-order-id', 'private-store-id', 'private-request-id', 'private-line-id', 'private-owner-id']) {
      expect(text).not.toContain(value);
    }
  });

  it('refuses mismatched saved run identities instead of joining unrelated executions', async () => {
    const first = fixture(), second = fixture(); await first.approve(); await second.approve();
    const saved = JSON.parse(JSON.stringify(first.traces[0])) as AfterSalesTrace;
    const other = JSON.parse(JSON.stringify(second.traces[0])) as AfterSalesTrace;
    expect(other.runId).not.toBe(saved.runId);
    expect(() => createAfterSalesCauseReader({ ...saved, nativeSnapshot: other.nativeSnapshot }))
      .toThrowError(expect.objectContaining({ code: 'CAUSE_RECORD_INVALID' }));
    expect(() => createAfterSalesCauseReader({ ...saved, causeCapture: other.causeCapture }))
      .toThrowError(expect.objectContaining({ code: 'CAUSE_RECORD_INVALID' }));
  });

  it('refuses accessors without executing them and reports a query limit explicitly', async () => {
    const f = fixture(); await f.approve();
    let reads = 0;
    const hostile = { ...f.traces[0], get nativeSnapshot() { reads++; return f.traces[0].nativeSnapshot; } };
    expect(() => createAfterSalesCauseReader(hostile)).toThrowError(expect.objectContaining({ code: 'CAUSE_RECORD_INVALID' }));
    expect(reads).toBe(0);
    expect(() => createAfterSalesCauseReader(JSON.parse(JSON.stringify(f.traces[0])), { maxCatalogNodes: 1 }))
      .toThrowError(expect.objectContaining({ code: 'CAUSE_RECORD_LIMIT' }));
  });
});
