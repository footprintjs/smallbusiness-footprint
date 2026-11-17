import { describe, expect, it } from 'vitest';
import { recordedCauseScopes } from 'footprint-blueprint/diagnostics/cause';
import { createRecordGraph } from 'foottrace/cause';
import { type AfterSalesTrace } from '../../aftersales.js';
import { nativeFixture as fixture, owner, customer } from './nativeFixture.js';

function saved(trace: AfterSalesTrace) {
  const json = JSON.parse(JSON.stringify(trace)) as AfterSalesTrace;
  const source = recordedCauseScopes(json.nativeSnapshot, json.causeCapture);
  expect(source.scopes.length).toBeLessThanOrEqual(16);
  for (const scope of source.scopes) expect(scope.commitLog.length).toBeLessThanOrEqual(256);
  return { json, source };
}
function nodes(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return [];
  const node = value as Record<string, unknown>;
  return [node, ...Object.entries(node).filter(([key]) => key === 'next' || key === 'children' || key === 'subflowStructure').flatMap(([, child]) => Array.isArray(child) ? child.flatMap(nodes) : nodes(child))];
}
describe('actual native after-sales control and bounded saved evidence', () => {
  it.each([1])('uses one same-scope native loop for %i request lines and retains the real writer/guard edge', async count => {
    const f = fixture(count); await f.service.request(f.command, customer);
    const { source, json } = saved(f.traces[0]);
    expect(source.scopes.length).toBeLessThanOrEqual(3);
    const loopScope = source.scopes.find(scope => scope.commitLog.some(row => row.stage.endsWith('inspect-request-item')))!;
    expect(loopScope).toBeDefined();
    const commits = loopScope.commitLog;
    const producer = commits.findLastIndex(row => Object.hasOwn(row.overwrite, 'lineCheck') && row.stage.endsWith('inspect-request-item'));
    const guard = commits.findLastIndex(row => row.stage.endsWith('request-item-loop'));
    expect(producer).toBeLessThan(guard);
    expect(loopScope.reads?.[commits[guard].runtimeStageId]).toContain('lineCheck');
    const graph = createRecordGraph(source.scopes);
    const id = (index: number, key?: string) => graph.nodeId(loopScope.address, { runtimeStageId: commits[index].runtimeStageId, commitIdx: index, ...(key ? { key } : {}) });
    expect((await graph.parents(id(guard), { signal: new AbortController().signal })).edges)
      .toContainEqual(expect.objectContaining({ kind: 'data', nodeId: id(producer, 'lineCheck') }));
    expect(nodes(json.flowSpec).some(node => node.isLoopReference === true)).toBe(true);
    expect(JSON.stringify(json)).not.toMatch(/private-line-|private-product-|PRIVATE_CUSTOMER_REASON|private-owner|private-payment/);
  });
  it.each([14, 100])('retains legitimate %i-line business results while the pinned raw reader explicitly refuses its depth limit', async count => {
    const f = fixture(count), requested = await f.service.request(f.command, customer);
    const approved = await f.service.action({ caseId: requested.caseId, expectedVersion: requested.version, action: 'approve' }, owner);
    const refunded = await f.service.action({ caseId: approved.caseId, expectedVersion: approved.version, action: 'refund', amountCents: count * 100, restock: true }, owner);
    expect(refunded.state).toBe('REFUNDED'); expect(f.refunds).toBe(1);
    for (const trace of [f.traces[0], f.traces.at(-1)!]) {
      const json = JSON.parse(JSON.stringify(trace)) as AfterSalesTrace;
      const raw = json.nativeSnapshot as typeof json.nativeSnapshot & { subflowResults?: Record<string, { treeContext?: { history?: unknown[] } }> };
      expect(raw.commitLog.length).toBeLessThanOrEqual(256);
      const ownLogs = Object.entries(raw.subflowResults ?? {}).filter(([key]) => /#\d+$/.test(key)).map(([, child]) => child.treeContext?.history ?? []);
      expect(ownLogs.length + 1).toBeLessThanOrEqual(16);
      for (const log of ownLogs) expect(log.length).toBeLessThanOrEqual(256);
      // The existing dependency also caps inert JSON depth at48. Do not alter
      // its limits, flatten a native snapshot or invent a complete answer.
      expect(() => recordedCauseScopes(json.nativeSnapshot, json.causeCapture)).toThrowError(expect.objectContaining({ code: 'CAUSE_RECORD_LIMIT' }));
      expect(JSON.stringify(json)).not.toMatch(/private-line-|private-product-|private-payment|PRIVATE_CUSTOMER_REASON/);
    }
  });
  it('routes replay away from new eligibility and persistence rather than executing no-op policy stages', async () => {
    const f = fixture(1), first = await f.service.request(f.command, customer), replay = await f.service.request(f.command, customer);
    expect(replay.caseId).toBe(first.caseId); expect(f.creates).toBe(1);
    const trace = f.traces[1];
    expect(trace.stages.some(name => name.endsWith('reuse-request'))).toBe(true);
    expect(trace.stages.some(name => name.endsWith('load-request-order') || name.endsWith('persist-request'))).toBe(false);
    expect(saved(trace).source.scopes.length).toBe(2);
  });
  it('routes a false recorded item fact to rejection before any case write', async () => {
    const f = fixture(1), tooMuch = copyCommand(f.command);
    tooMuch.items[0].quantity = 2;
    await expect(f.service.request(tooMuch, customer)).rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' });
    expect(f.creates).toBe(0);
    const { source } = saved(f.traces[0]);
    const scope = source.scopes.find(scope => scope.commitLog.some(row => Object.hasOwn(row.overwrite, 'lineCheck')))!;
    const producer = scope.commitLog.find(row => Object.hasOwn(row.overwrite, 'lineCheck'))!;
    expect(producer.overwrite.lineCheck).toEqual({ position: 0, eligible: false });
    expect(scope.commitLog.some(row => row.stage.endsWith('persist-request'))).toBe(false);
    expect(scope.commitLog.some(row => row.overwrite.branchResult === 'reject')).toBe(true);
  });
  it('records the payment identity guard and refuses a mismatched provider fact before reserving refund budget', async () => {
    const f = fixture(1), requested = await f.service.request(f.command, customer);
    const approved = await f.service.action({ caseId: requested.caseId, expectedVersion: requested.version, action: 'approve' }, owner);
    f.payments.getPayment = async () => ({ ...f.order.payment, currency: 'EUR' });
    await expect(f.service.action({ caseId: approved.caseId, expectedVersion: approved.version, action: 'refund', amountCents: 100 }, owner))
      .rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' });
    expect(f.refunds).toBe(0); expect(f.cases.get(approved.caseId)?.refund).toBeUndefined();
    const { source } = saved(f.traces.at(-1)!);
    const scope = source.scopes.find(scope => scope.commitLog.some(row => Object.hasOwn(row.overwrite, 'paymentMatchesOrder')))!;
    const producer = scope.commitLog.findIndex(row => Object.hasOwn(row.overwrite, 'paymentMatchesOrder'));
    const guard = scope.commitLog.findIndex(row => row.stage.endsWith('payment-matches-order'));
    expect(scope.commitLog[producer].overwrite.paymentMatchesOrder).toBe(false);
    expect(scope.reads?.[scope.commitLog[guard].runtimeStageId]).toContain('paymentMatchesOrder');
  });
  it.each([1])('keeps successful refund/restock for %i lines inside pinned scoped-reader bounds', async count => {
    const f = fixture(count), requested = await f.service.request(f.command, customer);
    const approved = await f.service.action({ caseId: requested.caseId, expectedVersion: requested.version, action: 'approve' }, owner);
    const refunded = await f.service.action({ caseId: approved.caseId, expectedVersion: approved.version, action: 'refund', amountCents: count * 100, restock: true }, owner);
    expect(refunded.state).toBe('REFUNDED'); expect(f.refunds).toBe(1);
    const { source, json } = saved(f.traces.at(-1)!);
    const guards = nodes(json.flowSpec).filter(node => node.type === 'decider').map(node => String(node.name));
    expect(guards.some(name => name.endsWith('existing-refund-intent'))).toBe(true);
    expect(guards.some(name => name.endsWith('refund-call-result'))).toBe(true);
    expect(guards.some(name => name.endsWith('restock-item-loop'))).toBe(true);
    expect(source.scopes.some(scope => scope.commitLog.filter(row => row.stage.endsWith('inspect-restock-item')).length === count)).toBe(true);
    expect(JSON.stringify(json)).not.toMatch(/private-line-|private-product-|private-refund|private-provider|private-payment|PRIVATE_CUSTOMER_REASON/);
  });
});
const copyCommand = <T>(value: T): T => structuredClone(value);
