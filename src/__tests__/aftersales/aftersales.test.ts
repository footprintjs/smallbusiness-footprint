import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAfterSalesService } from '../../aftersales/runtime.js';
import footprintPackage from 'footprintjs/package.json' with { type: 'json' };
import { AfterSalesError, DEFAULT_AFTER_SALES_POLICY, validateAfterSalesPolicy,
  type AfterSalesCase, type AfterSalesOrder, type AfterSalesPayments, type AfterSalesRepository,
  type AfterSalesRefundEvidence, type AfterSalesTrace } from '../../aftersales.js';

const clone = <T>(value: T): T => structuredClone(value);
const OWNER = { actorId: 'owner-1', role: 'owner' as const }, CUSTOMER = { actorId: 'verified-order-1', role: 'customer' as const };
const PRIVATE = 'private-customer@example.com secret-address-900 token-value';
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });
function fixture(overrides: Partial<AfterSalesOrder> = {}) {
  let seq = 0, hold: string | undefined, refundCalls = 0, restockCount = 0, failRestock = false;
  const traces: AfterSalesTrace[] = [], cases = new Map<string, AfterSalesCase>(), requests = new Map<string, string>();
  const order: AfterSalesOrder = { storeId: 'brand-a', orderId: 'order-1', version: 0, status: 'paid', fulfillmentLocked: false,
    items: [{ lineId: 'line-0', productId: 'p-1', color: 'sage', size: '8', quantity: 2, unitPriceCents: 5000, tracked: true }],
    payment: { provider: 'test-provider', paymentId: 'payment-1', currency: 'USD', mode: 'test', capturedCents: 10000, refundedCents: 0 },
    refundReservedCents: 0, allocatedQuantities: {}, ...overrides };
  const changeOrder = (changes: Partial<AfterSalesOrder>) => Object.assign(order, changes, { version: order.version + 1 });
  const conflict = () => { throw new AfterSalesError('AFTERSALES_CONFLICT', PRIVATE); };
  const check = (record: AfterSalesCase, expected: number) => {
    const previous = cases.get(record.caseId);
    if (!previous || previous.version !== expected || record.version !== expected + 1) conflict();
    return previous!;
  };
  const save = (record: AfterSalesCase) => { cases.set(record.caseId, clone(record)); return clone(record); };
  const repo: AfterSalesRepository = {
    async getOrder(id) { return id === order.orderId ? clone({ ...order, fulfillmentLocked: order.fulfillmentLocked || !!hold }) : undefined; },
    async getCase(id) { const record = cases.get(id); return record && clone(record); },
    async findCase(id, key) { const record = cases.get(requests.get(`${id}:${key}`) ?? ''); return record && clone(record); },
    async createCase({ record, expectedOrderVersion }) {
      const old = requests.get(`${record.orderId}:${record.requestId}`);
      if (old) return clone(cases.get(old)!);
      if (expectedOrderVersion !== order.version || record.kind === 'cancellation' && (hold || order.fulfillmentLocked || order.shippedAt)) conflict();
      for (const item of record.items) if (item.quantity > order.items.find(line => line.lineId === item.lineId)!.quantity - (order.allocatedQuantities[item.lineId] ?? 0)) conflict();
      const allocations = { ...order.allocatedQuantities }; record.items.forEach(item => { allocations[item.lineId] = (allocations[item.lineId] ?? 0) + item.quantity; });
      changeOrder({ allocatedQuantities: allocations }); if (record.kind === 'cancellation') hold = record.caseId;
      requests.set(`${record.orderId}:${record.requestId}`, record.caseId); return save(record);
    },
    async saveCase({ record, expectedVersion }) {
      check(record, expectedVersion);
      if (record.state === 'REJECTED') {
        const allocations = { ...order.allocatedQuantities }; record.items.forEach(item => { allocations[item.lineId] -= item.quantity; });
        changeOrder({ allocatedQuantities: allocations }); if (hold === record.caseId) hold = undefined;
      }
      return save(record);
    },
    async prepareRefund({ record, expectedVersion, expectedOrderVersion }) {
      const previous = check(record, expectedVersion);
      const intent = record.refund!;
      if (previous.refund || order.version !== expectedOrderVersion || intent.amountCents > intent.payment.capturedCents - Math.max(intent.payment.refundedCents, order.payment.refundedCents) - order.refundReservedCents) conflict();
      changeOrder({ refundReservedCents: order.refundReservedCents + intent.amountCents }); return save(record);
    },
    async completeRefund({ record, expectedVersion, orderDisposition }) {
      const previous = check(record, expectedVersion);
      const terminalBefore = ['SUCCEEDED', 'FAILED'].includes(previous.refund!.status), terminalAfter = ['SUCCEEDED', 'FAILED'].includes(record.refund!.status);
      if (!terminalBefore && terminalAfter) changeOrder({ refundReservedCents: order.refundReservedCents - record.refund!.amountCents,
        payment: { ...order.payment, refundedCents: order.payment.refundedCents + (record.refund!.status === 'SUCCEEDED' ? record.refund!.amountCents : 0) },
        ...(orderDisposition === 'cancelled' ? { status: 'cancelled' as const } : {}) });
      if (previous.refund!.status === 'SUCCEEDED' && record.refund!.status === 'FAILED') changeOrder({ payment: { ...order.payment, refundedCents: order.payment.refundedCents - record.refund!.amountCents } });
      return save(record);
    },
    async restock({ record, expectedVersion, items }) {
      const previous = check(record, expectedVersion);
      if (failRestock) { failRestock = false; throw new Error(PRIVATE); }
      if (!previous.restock?.completedAt) restockCount += items.filter(item => item.tracked).reduce((n, item) => n + item.quantity, 0);
      return save(record);
    },
  };
  let found: AfterSalesRefundEvidence | undefined, refundFailure = false, refundStatus: AfterSalesRefundEvidence['status'] = 'succeeded';
  let release: (() => void) | undefined;
  const payments: AfterSalesPayments = {
    async getPayment() { return clone(order.payment); },
    async refund(input) {
      refundCalls++;
      expect(cases.get(input.caseId)?.refund?.status).toBe('PREPARED');
      expect(order.refundReservedCents).toBeGreaterThanOrEqual(input.amountCents);
      if (release) await new Promise<void>(resolve => { release = resolve; });
      if (refundFailure) throw new Error(PRIVATE);
      return found = { provider: 'test-provider', refundId: 'refund-1', paymentId: input.paymentId, idempotencyKey: input.idempotencyKey,
        amountCents: input.amountCents, currency: input.currency, mode: 'test', status: refundStatus };
    },
    async retrieveRefund() { return clone(found!); },
    async findRefund() { return found && clone(found); },
  };
  const service = createAfterSalesService({ storeId: order.storeId, repository: repo, payments, authorizer: () => true,
    now: () => '2026-10-16T12:00:00.000Z', generateId: () => `case-${++seq}`, onTrace: trace => { traces.push(trace); } });
  const request = (kind: 'cancellation' | 'return' = 'cancellation', qty = 2, requestId = 'req-1') => service.request({ orderId: order.orderId, kind, requestId,
    items: [{ lineId: 'line-0', quantity: qty }], reason: PRIVATE, ...(kind === 'return' ? { unworn: true, tagsAttached: true } : {}) }, CUSTOMER);
  const act = (record: AfterSalesCase, action: 'approve' | 'reject' | 'reconcile') => service.action({ caseId: record.caseId, expectedVersion: record.version, action }, OWNER);
  return { order, service, repo, payments, cases, traces, request, act, get refundCalls() { return refundCalls; }, get restockCount() { return restockCount; }, get hold() { return hold; },
    set failRefund(value: boolean) { refundFailure = value; }, set found(value: AfterSalesRefundEvidence | undefined) { found = value; }, set refundStatus(value: AfterSalesRefundEvidence['status']) { refundStatus = value; },
    failNextRestock() { failRestock = true; }, changeOrder };
}
const refund = (f: ReturnType<typeof fixture>, record: AfterSalesCase, amountCents = 10000, restock = true) => f.service.action({ caseId: record.caseId, expectedVersion: record.version, action: 'refund', amountCents, restock }, OWNER);

describe('after-sales trusted engine controls', () => {
  it('honors caller cancellation before repository access or payment effects', async () => {
    const f = fixture(), getOrder = vi.spyOn(f.repo, 'getOrder');
    const service = createAfterSalesService({ storeId: 'brand-a', repository: f.repo, payments: f.payments, authorizer: () => true,
      executionOptions: () => ({ signal: AbortSignal.abort() }) });
    await expect(service.request({ orderId: 'order-1', requestId: 'request-1', kind: 'cancellation', items: [{ lineId: 'line-0', quantity: 1 }] }, CUSTOMER)).rejects.toBeInstanceOf(AfterSalesError);
    expect(getOrder).not.toHaveBeenCalled(); expect(f.refundCalls).toBe(0); expect(f.cases.size).toBe(0);
  });
  it('retains actual runtime version and caller correlation in genuine native evidence', async () => {
    const f = fixture(), traces: AfterSalesTrace[] = [];
    const service = createAfterSalesService({ storeId: 'brand-a', repository: f.repo, payments: f.payments, authorizer: () => true,
      executionOptions: () => ({ env: { traceId: 'caller-trace', operationId: 'caller-operation' } }), onTrace: trace => { traces.push(trace); } });
    await service.request({ orderId: 'order-1', requestId: 'request-1', kind: 'cancellation', items: [{ lineId: 'line-0', quantity: 1 }] }, CUSTOMER);
    expect(traces[0].runtime).toEqual({ library: 'footprintjs', version: footprintPackage.version });
    expect(traces[0].nativeSnapshot).toMatchObject({ correlation: { traceId: 'caller-trace', operationId: 'caller-operation' } });
  });
});


describe('after-sales library owner and fulfillment boundaries', () => {
  it('deduplicates requests and requires owner approval before any refund', async () => {
    const f = fixture(), requested = await f.request();
    expect((await f.request()).caseId).toBe(requested.caseId);
    expect(f.cases.size).toBe(1); expect(f.hold).toBe(requested.caseId);
    await expect(refund(f, requested)).rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' });
    await expect(f.service.action({ caseId: requested.caseId, expectedVersion: requested.version, action: 'approve' }, CUSTOMER)).rejects.toMatchObject({ code: 'AFTERSALES_UNAUTHORIZED' });
    expect(f.refundCalls).toBe(0);
    const approved = await f.act(requested, 'approve'), done = await refund(f, approved);
    expect(done.state).toBe('REFUNDED'); expect(done.restock?.completedAt).toBeTruthy();
    expect(f.refundCalls).toBe(1); expect(f.restockCount).toBe(2); expect(f.order.payment.refundedCents).toBe(10000);
    expect(f.order.status).toBe('cancelled'); expect(f.hold).toBe(requested.caseId);
    await refund(f, done); expect(f.refundCalls).toBe(1); expect(f.restockCount).toBe(2);
  });
  it('rejects reused request keys with changed quantities/reasons and stale owner versions', async () => {
    const f = fixture(), requested = await f.request();
    await expect(f.request('cancellation', 1)).rejects.toMatchObject({ code: 'AFTERSALES_CONFLICT' });
    await f.act(requested, 'approve');
    await expect(f.act(requested, 'reject')).rejects.toMatchObject({ code: 'AFTERSALES_CONFLICT' });
  });
  it('races duplicate creates atomically and cannot claim cancellation after shipping won', async () => {
    const f = fixture();
    const cases = await Promise.all([f.request(), f.request()]); expect(cases[0].caseId).toBe(cases[1].caseId); expect(f.cases.size).toBe(1);
    const shipping = fixture({ fulfillmentLocked: true });
    await expect(shipping.request()).rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' }); expect(shipping.cases.size).toBe(0);
    const shipped = fixture({ status: 'shipped', shippedAt: '2026-10-15T00:00:00Z' });
    await expect(shipped.request()).rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' });
  });
  it('retains fulfillment hold on partial cancellation and restocks only selected quantities', async () => {
    const f = fixture(), approved = await f.act(await f.request('cancellation', 1), 'approve');
    const result = await refund(f, approved, 5000);
    expect(result.state).toBe('REFUNDED'); expect(f.restockCount).toBe(1); expect(f.order.status).toBe('paid'); expect(f.hold).toBe(result.caseId);
  });
  it('rejection releases allocation and hold without touching payment or inventory', async () => {
    const f = fixture(), result = await f.act(await f.request(), 'reject');
    expect(result.state).toBe('REJECTED'); expect(f.hold).toBeUndefined(); expect(f.order.allocatedQuantities['line-0']).toBe(0);
    expect(f.refundCalls).toBe(0); expect(f.restockCount).toBe(0);
  });
});

describe('return policy and receipt inspection', () => {
  it('allows return within 30 days but requires receipt plus accepted inspection after approval', async () => {
    const f = fixture({ status: 'delivered', deliveredAt: '2026-10-01T12:00:00Z', shippedAt: '2026-09-28T12:00:00Z' });
    const approved = await f.act(await f.request('return'), 'approve');
    await expect(refund(f, approved)).rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' });
    const received = await f.service.action({ action: 'receive', caseId: approved.caseId, expectedVersion: approved.version, accepted: true }, OWNER);
    expect((await refund(f, received)).state).toBe('REFUNDED'); expect(f.order.status).toBe('delivered');
  });
  it('refuses outside-window, future delivery, missing tags and rejected inspections', async () => {
    for (const deliveredAt of ['2026-09-01T00:00:00Z', '2026-10-17T00:00:00Z']) {
      const f = fixture({ status: 'delivered', deliveredAt }); await expect(f.request('return')).rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' });
    }
    const f = fixture({ status: 'delivered', deliveredAt: '2026-10-01T00:00:00Z' });
    await expect(f.service.request({ orderId: 'order-1', requestId: 'bad-tags', kind: 'return', items: [{ lineId: 'line-0', quantity: 1 }], unworn: true }, CUSTOMER)).rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' });
    const approved = await f.act(await f.request('return'), 'approve');
    const rejected = await f.service.action({ action: 'receive', caseId: approved.caseId, expectedVersion: approved.version, accepted: false }, OWNER);
    await expect(refund(f, rejected)).rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' });
  });
  it('snapshots validated per-shop policy and keeps approval mandatory when flags change', async () => {
    const f = fixture(), policy = validateAfterSalesPolicy({ ...DEFAULT_AFTER_SALES_POLICY, version: 'shop-v2', returnWindowDays: 14, cancellationEnabled: false });
    const disabled = createAfterSalesService({ storeId: 'brand-a', repository: f.repo, payments: f.payments, policy, authorizer: () => true });
    await expect(disabled.request({ orderId: 'order-1', requestId: 'disabled', kind: 'cancellation', items: [{ lineId: 'line-0', quantity: 1 }] }, CUSTOMER)).rejects.toMatchObject({ code: 'AFTERSALES_INELIGIBLE' });
    const requested = await f.request(); expect(requested.policy.returnWindowDays).toBe(30); expect(requested.policy.version).toBe('returns-v1');
    expect(() => validateAfterSalesPolicy({ ...policy, ownerApprovalRequired: false })).toThrow();
  });
});

describe('refund intent, unknown outcome and concurrency', () => {
  it('persists intent and reserves budget before calling provider, keeps uncertainty and never creates again', async () => {
    const f = fixture(), approved = await f.act(await f.request(), 'approve'); f.failRefund = true;
    const unknown = await refund(f, approved); expect(unknown.state).toBe('REFUND_UNKNOWN'); expect(f.order.refundReservedCents).toBe(10000);
    const again = await refund(f, unknown); expect(again.state).toBe('REFUND_UNKNOWN'); expect(f.refundCalls).toBe(1);
    f.found = { provider: 'test-provider', refundId: 'refund-later', paymentId: 'payment-1', idempotencyKey: unknown.refund!.idempotencyKey,
      amountCents: 10000, currency: 'USD', mode: 'test', status: 'succeeded' };
    const confirmed = await f.act(again, 'reconcile'); expect(confirmed.state).toBe('REFUNDED'); expect(f.restockCount).toBe(2); expect(f.refundCalls).toBe(1);
  });
  it('keeps pending reservations, rejects amounts outside captured balance and never restocks on pending', async () => {
    const f = fixture(), approved = await f.act(await f.request(), 'approve');
    for (const amount of [0, 0.5, -1, 10001]) await expect(refund(f, approved, amount)).rejects.toBeInstanceOf(AfterSalesError);
    f.refundStatus = 'pending'; const pending = await refund(f, approved);
    expect(pending.state).toBe('REFUND_PENDING'); expect(f.order.refundReservedCents).toBe(10000); expect(f.restockCount).toBe(0);
  });
  it('CAS permits one concurrent refund dispatch and no extra key on duplicate action', async () => {
    const f = fixture(), approved = await f.act(await f.request(), 'approve');
    const results = await Promise.allSettled([refund(f, approved), refund(f, approved)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(f.refundCalls).toBe(1);
  });
  it('two approved cases cannot reserve/refund more than the same captured payment', async () => {
    const f = fixture({ status: 'delivered', deliveredAt: '2026-10-01T00:00:00Z' });
    const first = await f.act(await f.request('return', 1, 'return-one'), 'approve');
    const second = await f.act(await f.request('return', 1, 'return-two'), 'approve');
    const received = await Promise.all([first, second].map(record => f.service.action({ action: 'receive', caseId: record.caseId, expectedVersion: record.version, accepted: true }, OWNER)));
    const result = await Promise.allSettled(received.map(record => refund(f, record, 7000, false)));
    expect(result.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(f.refundCalls).toBe(1); expect(f.order.payment.refundedCents + f.order.refundReservedCents).toBe(7000);
  });
  it('confirmed failure releases money reservation without restocking', async () => {
    const f = fixture(), approved = await f.act(await f.request(), 'approve'); f.refundStatus = 'failed';
    const failed = await refund(f, approved); expect(failed.state).toBe('REFUND_FAILED'); expect(f.order.refundReservedCents).toBe(0); expect(f.restockCount).toBe(0);
  });
  it('rechecks confirmed provider refunds and records a late failure without reversing inventory or replaying payment', async () => {
    const f = fixture(), approved = await f.act(await f.request(), 'approve');
    const paid = await refund(f, approved);
    f.found = { provider: 'test-provider', refundId: paid.refund!.providerRefundId!, paymentId: 'payment-1', idempotencyKey: paid.refund!.idempotencyKey,
      amountCents: 10000, currency: 'USD', mode: 'test', status: 'failed' };
    const failed = await f.act(paid, 'reconcile'); expect(failed.state).toBe('REFUND_FAILED'); expect(f.order.payment.refundedCents).toBe(0);
    expect(f.restockCount).toBe(2); expect(f.refundCalls).toBe(1); expect(f.hold).toBe(paid.caseId);
    expect((await f.act(failed, 'reconcile')).state).toBe('REFUND_FAILED');
  });
  it('a restock transaction failure reconciles after success without another payment call', async () => {
    const f = fixture(), approved = await f.act(await f.request(), 'approve'); f.failNextRestock();
    await expect(refund(f, approved)).rejects.toMatchObject({ code: 'AFTERSALES_STORAGE_UNAVAILABLE' });
    const saved = f.cases.get(approved.caseId)!; expect(saved.state).toBe('REFUNDED'); expect(saved.restock?.completedAt).toBeUndefined();
    const done = await f.act(saved, 'reconcile'); expect(done.restock?.completedAt).toBeTruthy(); expect(f.refundCalls).toBe(1); expect(f.restockCount).toBe(2);
  });
  it('safe native traces survive callback errors and contain no private command, identities or provider payload', async () => {
    const f = fixture(); const requested = await f.request(), approved = await f.act(requested, 'approve'); f.failRefund = true; await refund(f, approved);
    expect(f.traces.length).toBe(3);
    for (const trace of f.traces) {
      expect(trace.nativeSnapshot.runId).toBe(trace.runId); expect(trace.stages.length).toBeGreaterThan(0);
      expect(JSON.stringify(trace)).not.toContain(PRIVATE); expect(JSON.stringify(trace)).not.toContain('payment-1'); expect(JSON.stringify(trace)).not.toContain(OWNER.actorId);
    }
    const clean = fixture();
    const service = createAfterSalesService({ storeId: 'brand-a', repository: clean.repo, payments: clean.payments, authorizer: () => true, onTrace() { throw new Error(PRIVATE); } });
    expect((await service.request({ orderId: 'order-1', requestId: 'callback-failure', kind: 'cancellation', items: [{ lineId: 'line-0', quantity: 1 }] }, CUSTOMER)).state).toBe('REQUESTED');
  });
});
