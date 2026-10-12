import { describe, it, expect, vi } from 'vitest';
import { createFulfillmentAdapters } from '../../adapters/fulfillmentAdapters.js';
import { createPaymentAdapters } from '../../adapters/paymentAdapters.js';
import { createCatalogAdapters } from '../../adapters/catalogAdapters.js';
import { createMarketingAdapters } from '../../adapters/marketingAdapters.js';
import { createInventoryAdapters } from '../../adapters/inventoryAdapters.js';
import { createMockRepository, fixtureScope, validCheckout } from '../helpers.js';
const context = { ...fixtureScope, profileType: 'kids-boutique', userId: 'admin' };

describe('explicit operation adapters', () => {
  it('does not convert order/payment/sender/inventory CRUD into real acknowledgement', async () => {
    const repo = createMockRepository(); const create = vi.spyOn(repo, 'createOrder'); const status = vi.spyOn(repo, 'updateOrderStatus'); const stock = vi.spyOn(repo, 'updateStock'); const sends = vi.spyOn(repo, 'recordSendResult');
    const adapters = [...createFulfillmentAdapters(repo, {}, fixtureScope), ...createPaymentAdapters(repo, {}, fixtureScope), ...createInventoryAdapters(repo, {}, fixtureScope), createMarketingAdapters(repo, {}, fixtureScope)[1]];
    for (const adapter of adapters) await expect(adapter.execute({}, context)).rejects.toThrow('No authoritative implementation');
    expect(create).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled(); expect(stock).not.toHaveBeenCalled(); expect(sends).not.toHaveBeenCalled();
  });
  it('delegates payment once without inventing Stripe success or exposing URL/token', async () => {
    const start = vi.fn(async () => ({ acknowledgement: 'pending' as const, output: { orderId: 'o1', state: 'PAYMENT_PROCESSING', checkoutToken: 'SECRET', url: 'https://private.test' } }));
    const [adapter] = createPaymentAdapters(createMockRepository(), { 'process-payment': start }, fixtureScope);
    expect(await adapter.execute({ orderId: 'o1', attemptId: 'a1', checkoutToken: 'SECRET' }, context)).toEqual({ acknowledgement: 'pending', output: { orderId: 'o1', state: 'PAYMENT_PROCESSING' } });
    expect(start).toHaveBeenCalledOnce();
  });
  it('validates schema and exact tenant/campus/store before checkout port', async () => {
    const reserve = vi.fn(); const [adapter] = createFulfillmentAdapters(createMockRepository(), { 'create-order': reserve }, fixtureScope);
    await expect(adapter.execute({ ...validCheckout, items: [{ productId: 'p1', quantity: -1 }] }, context)).rejects.toThrow();
    await expect(adapter.execute(validCheckout, { ...context, tenantId: 'other' })).rejects.toThrow('requested store');
    await expect(adapter.execute(validCheckout, { ...context, campusId: 'other-campus' })).rejects.toThrow('requested store');
    expect(reserve).not.toHaveBeenCalled();
  });
  it('routes update-product to update rather than create', async () => {
    const create = vi.fn(); const update = vi.fn(async () => ({ acknowledgement: 'committed' as const, output: { productId: 'p1' } }));
    const adapters = createCatalogAdapters(createMockRepository(), { 'create-product': create, 'update-product': update }, fixtureScope);
    expect(adapters).toHaveLength(4); await adapters.find(adapter => adapter.id === 'catalog-update')!.execute({ id: 'p1', colors: ['red'] }, context);
    expect(update).toHaveBeenCalledOnce(); expect(create).not.toHaveBeenCalled();
  });
  it('rejects empty provider acknowledgement and redacts provider failure', async () => {
    const [adapter] = createPaymentAdapters(createMockRepository(), { 'process-payment': async () => { throw new Error('SECRET@example.test'); } }, fixtureScope);
    await expect(adapter.execute({ orderId: 'o1', attemptId: 'a1', checkoutToken: 'SECRET' }, context)).rejects.toThrow('temporarily unavailable');
  });
});
