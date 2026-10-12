import { describe, expect, it, vi } from 'vitest';
import { createFixturePlatform, createMockRepository, fixtureContext, validCheckout } from '../helpers.js';
import { createCheckoutOperation } from '../../checkoutPort.js';
describe('authoritative checkout delegation', () => {
  it('never substitutes CRUD order creation when checkout is unconfigured', async () => { const repo = createMockRepository(); const create = vi.spyOn(repo, 'createOrder'); const result = await createFixturePlatform({ repository: repo }).executeServiceFlow(fixtureContext, 'create-order', validCheckout); expect(result.status).toBe('error'); expect(create).not.toHaveBeenCalled(); });
  it('delegates once and keeps shipping, emails and capability tokens out of all default results', async () => {
    const reserve = vi.fn(async () => ({ orderId: 'order-safe', attemptId: 'attempt-safe', state: 'RESERVED', reservationState: 'HELD' as const, traceRunId: 'original-core-trace', checkoutToken: 'PRIVATE_TOKEN' }));
    const platform = createFixturePlatform({ operations: { 'create-order': createCheckoutOperation({ reserve }) } }); const result = await platform.executeServiceFlow(fixtureContext, 'create-order', validCheckout);
    expect(result.status).toBe('success'); expect(result.result).toMatchObject({ orderId: 'order-safe', traceRunId: 'original-core-trace', reservationState: 'HELD' }); expect(reserve).toHaveBeenCalledOnce(); expect(reserve.mock.calls[0][1]).toMatchObject({ ...fixtureContext, businessType: 'kids-boutique' });
    for (const text of ['PRIVATE@example.test', 'PRIVATE STREET', 'PRIVATE_TOKEN']) expect(JSON.stringify(result)).not.toContain(text);
  });
  it.each([{ ...validCheckout, idempotencyKey: undefined }, { ...validCheckout, items: [] }, { ...validCheckout, items: [{ name: 'Dress', price: 1, quantity: 1 }] }, { ...validCheckout, items: [{ productId: 'x', quantity: -1 }] }])('rejects unpriced or non-idempotent cart commands %j', async input => {
    const reserve = vi.fn(); const result = await createFixturePlatform({ providers: { checkout: { reserve } } }).executeServiceFlow(fixtureContext, 'create-order', input); expect(result.status).toBe('error'); expect(reserve).not.toHaveBeenCalled();
  });
  it('does not report success when a provider returns no acknowledgement', async () => { const result = await createFixturePlatform({ operations: { 'create-order': async () => undefined as never } }).executeServiceFlow(fixtureContext, 'create-order', validCheckout); expect(result.status).toBe('error'); expect(result.code).toBe('BUSINESS_RECEIPT_INVALID'); });
});
