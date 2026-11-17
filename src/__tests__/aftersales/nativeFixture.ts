import { expect } from 'vitest';
import { createAfterSalesService } from '../../aftersales/runtime.js';
import { type AfterSalesCase, type AfterSalesOrder, type AfterSalesPayments, type AfterSalesRepository, type AfterSalesTrace } from '../../aftersales.js';

const copy = <T>(value: T): T => structuredClone(value);
export function nativeFixture(count: number) {
  const traces: AfterSalesTrace[] = [], cases = new Map<string, AfterSalesCase>();
  let creates = 0, refunds = 0, id = 0;
  const order: AfterSalesOrder = { storeId: 'private-store', orderId: 'private-order', version: 0, status: 'paid', fulfillmentLocked: false,
    items: Array.from({ length: count }, (_, i) => ({ lineId: `private-line-${i}`, productId: `private-product-${i}`, color: 'private-color', size: 'private-size', quantity: 1, unitPriceCents: 100, tracked: true })),
    payment: { provider: 'private-provider', paymentId: 'private-payment', currency: 'USD', mode: 'test', capturedCents: count * 100, refundedCents: 0 }, refundReservedCents: 0, allocatedQuantities: {} };
  const save = (record: AfterSalesCase) => { cases.set(record.caseId, copy(record)); return copy(record); };
  const repository: AfterSalesRepository = {
    async getOrder() { return copy(order); },
    async getCase(key) { return copy(cases.get(key)); },
    async findCase(orderId, requestId) { return copy([...cases.values()].find(row => row.orderId === orderId && row.requestId === requestId)); },
    async createCase({ record, expectedOrderVersion }) { expect(expectedOrderVersion).toBe(order.version); creates++; return save(record); },
    async saveCase({ record, expectedVersion }) { expect(cases.get(record.caseId)?.version).toBe(expectedVersion); return save(record); },
    async prepareRefund({ record, expectedVersion }) { expect(cases.get(record.caseId)?.version).toBe(expectedVersion); expect(record.refund?.status).toBe('PREPARED'); return save(record); },
    async completeRefund({ record, expectedVersion }) { expect(cases.get(record.caseId)?.version).toBe(expectedVersion); return save(record); },
    async restock({ record, expectedVersion, items }) { expect(cases.get(record.caseId)?.version).toBe(expectedVersion); expect(items).toHaveLength(count); return save(record); },
  };
  const payments: AfterSalesPayments = {
    async getPayment() { return copy(order.payment); },
    async refund(input) {
      expect(cases.get(input.caseId)?.refund?.status).toBe('PREPARED'); refunds++;
      return { provider: order.payment.provider, paymentId: order.payment.paymentId, currency: 'USD', mode: 'test', refundId: 'private-refund', idempotencyKey: input.idempotencyKey, amountCents: input.amountCents, status: 'succeeded' };
    },
    async retrieveRefund() { throw new Error('unexpected lookup'); }, async findRefund() { return undefined; },
  };
  const service = createAfterSalesService({ storeId: order.storeId, repository, payments, authorizer: () => true,
    generateId: () => `private-case-${++id}`, now: () => '2026-11-15T12:00:00.000Z', onTrace(trace) { traces.push(trace); } });
  const command = { orderId: order.orderId, requestId: 'private-request', kind: 'cancellation' as const,
    items: order.items.map(({ lineId, quantity }) => ({ lineId, quantity })), reason: 'PRIVATE_CUSTOMER_REASON' };
  return { service, traces, command, cases, order, repository, payments, get creates() { return creates; }, get refunds() { return refunds; } };
}
export const owner = { actorId: 'private-owner', role: 'owner' as const }, customer = { actorId: 'private-customer', role: 'customer' as const };
