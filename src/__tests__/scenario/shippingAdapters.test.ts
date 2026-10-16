import { describe, expect, it, vi } from 'vitest';
import {
  createShippingAdapterRegistry, isShippingProviderId, safeShippingUrl, shipmentStatuses,
} from '../../shipping.js';
import type {
  ProviderShipment, ShippingAdapter, ShippingAdapterContext, ShippingAdapterFactory,
  ShippingProvider, ShippingWebhookRequest,
} from '../../shipping.js';

const origin = { name: 'Store', street1: '1 Example Rd', city: 'Austin', state: 'TX', zip: '78701', country: 'US' };
const destination = { ...origin, name: 'Buyer', country: 'CA', state: 'ON', zip: 'K1A 0B1' };
const parcel = { lengthIn: 12, widthIn: 10, heightIn: 6, weightOz: 32 };
const context: ShippingAdapterContext = { mode: 'test', credentials: { token: 'private-fixture-token', webhook: 'private-fixture-webhook' } };

// Deliberately unrelated identifier and webhook shapes. Neither resembles an
// EasyPost response; each adapter normalizes only its own provider format.
const vendors = [
  { provider: 'merchant-courier', shipment: '7319902', tracker: 'courier:tracking/7319902', rate: 'EXPRESS/2-DAY', event: '90014' },
  { provider: 'parcel-network', shipment: '550e8400-e29b-41d4-a716-446655440000', tracker: 'urn:tracking:alpha', rate: 'r|ground|standard', event: 'dispatch/0008' },
] as const;

function fixtureAdapter(vendor: typeof vendors[number], resolved: ShippingAdapterContext): ShippingAdapter {
  const base: ProviderShipment = {
    id: vendor.shipment, reference: 'order-reference', mode: resolved.mode,
    rates: [{ rateId: vendor.rate, carrier: 'Merchant Carrier', service: 'Two day', amountCents: 850, currency: 'USD', estimatedDays: 2, guaranteed: false }],
  };
  let shipment = base;
  const provider: ShippingProvider = {
    provider: vendor.provider,
    async createShipment(input) {
      expect(input).toEqual({ origin, destination, parcel, reference: 'order-reference' });
      return shipment;
    },
    async retrieveShipment(id) { expect(id).toBe(vendor.shipment); return shipment; },
    async buyShipment(id, rateId) {
      expect(id).toBe(vendor.shipment); expect(rateId).toBe(vendor.rate);
      shipment = { ...shipment, selectedRateId: rateId, trackerId: vendor.tracker, status: 'LABEL_CREATED', labelUrl: 'https://labels.example/one.pdf' };
      return shipment;
    },
    async retrieveTracker(id) {
      expect(id).toBe(vendor.tracker);
      return { shipmentId: vendor.shipment, trackerId: vendor.tracker, mode: resolved.mode, status: 'IN_TRANSIT', updatedAt: '2030-01-01T00:00:00Z' };
    },
  };
  if (vendor.provider === 'merchant-courier') {
    return {
      provider,
      verifyWebhook(request) {
        if (request.headers['x-fixture-token'] !== resolved.credentials.webhook) throw new Error('Rejected fixture signature');
        const body = JSON.parse(new TextDecoder().decode(request.body));
        if (body.topic !== 'parcel-moved') return undefined;
        return { eventId: String(body.sequence), trackerId: body.parcel.tracker, shipmentId: body.parcel.id };
      },
    };
  }
  return {
    provider,
    async verifyWebhook(request) {
      if (request.method !== 'POST' || request.path !== '/hooks/parcel-network'
        || request.headers.authorization !== `Fixture ${resolved.credentials.webhook}`) throw new Error('Rejected fixture signature');
      const body = new URLSearchParams(new TextDecoder().decode(request.body));
      if (body.get('kind') !== 'tracking') return undefined;
      return { eventId: body.get('event')!, trackerId: body.get('tracking')!, shipmentId: body.get('shipment')! };
    },
  };
}

function fixtureRequest(vendor: typeof vendors[number]): ShippingWebhookRequest {
  return vendor.provider === 'merchant-courier'
    ? { body: new TextEncoder().encode(JSON.stringify({ topic: 'parcel-moved', sequence: Number(vendor.event), parcel: { id: vendor.shipment, tracker: vendor.tracker } })), headers: { 'x-fixture-token': context.credentials.webhook }, method: 'POST', path: '/hooks/merchant-courier' }
    : { body: new TextEncoder().encode(new URLSearchParams({ kind: 'tracking', event: vendor.event, tracking: vendor.tracker, shipment: vendor.shipment }).toString()), headers: { authorization: `Fixture ${context.credentials.webhook}` }, method: 'POST', path: '/hooks/parcel-network' };
}

describe('consumer-supplied shipping adapters', () => {
  it.each(vendors)('runs the same quote, label and tracking consumer workflow with $provider', async vendor => {
    const registry = createShippingAdapterRegistry(Object.fromEntries(vendors.map(item => [item.provider, (resolved: ShippingAdapterContext) => fixtureAdapter(item, resolved)])));
    const adapter = registry.create(vendor.provider, context);
    const quote = await adapter.provider.createShipment({ origin, destination, parcel, reference: 'order-reference' });
    const bought = await adapter.provider.buyShipment(quote.id, quote.rates[0].rateId);
    expect(await adapter.provider.retrieveShipment(bought.id)).toEqual(bought);
    const event = await adapter.verifyWebhook(fixtureRequest(vendor));
    expect(event).toEqual({ eventId: vendor.event, trackerId: vendor.tracker, shipmentId: vendor.shipment });
    const tracking = await adapter.provider.retrieveTracker(event!.trackerId);
    // These checks belong to the shared host flow, after authentication/normalization.
    expect(tracking.shipmentId).toBe(bought.id);
    expect(tracking.trackerId).toBe(bought.trackerId);
    expect(tracking.mode).toBe(context.mode);
    expect(tracking.status).toBe('IN_TRANSIT');
    expect(quote.rates[0]).toMatchObject({ amountCents: 850, currency: 'USD', estimatedDays: 2 });
  });

  it.each(vendors)('keeps authentication inside the $provider adapter', async vendor => {
    const adapter = fixtureAdapter(vendor, context);
    const request = { ...fixtureRequest(vendor), headers: {} };
    await expect(Promise.resolve().then(() => adapter.verifyWebhook(request))).rejects.toThrow('Rejected fixture signature');
  });

  it.each(vendors)('ignores authenticated non-tracking events for $provider', async vendor => {
    const adapter = fixtureAdapter(vendor, context);
    const request = fixtureRequest(vendor);
    request.body = new TextEncoder().encode(vendor.provider === 'merchant-courier' ? '{"topic":"account.updated"}' : 'kind=account');
    expect(await adapter.verifyWebhook(request)).toBeUndefined();
  });

  it('snapshots explicit registration and ignores inherited factories', () => {
    const factory = vi.fn((resolved: ShippingAdapterContext) => fixtureAdapter(vendors[0], resolved));
    const entries: Record<string, ShippingAdapterFactory> = Object.assign(Object.create({ inherited: factory }), { 'merchant-courier': factory });
    const registry = createShippingAdapterRegistry(entries);
    entries['merchant-courier'] = () => { throw new Error('replacement'); };
    entries.extra = factory;
    expect(registry.has('merchant-courier')).toBe(true);
    expect(registry.has('inherited')).toBe(false);
    expect(registry.has('extra')).toBe(false);
    expect(registry.has('constructor')).toBe(false);
    expect(registry.create('merchant-courier', context).provider.provider).toBe('merchant-courier');
    expect(factory).toHaveBeenCalledOnce();
    expect(Object.isFrozen(registry)).toBe(true);
  });

  it('rejects unregistered selection before accessing private credentials', () => {
    const getter = vi.fn(() => { throw new Error('private-fixture-token'); });
    const privateContext = { mode: 'test', get credentials() { return getter(); } } as ShippingAdapterContext;
    const registry = createShippingAdapterRegistry({});
    expect(() => registry.create('not-registered', privateContext)).toThrow('Shipping adapter is not registered');
    expect(getter).not.toHaveBeenCalled();
  });

  it('gives factories a copied, frozen context without mutating caller values', () => {
    let captured: ShippingAdapterContext | undefined;
    const caller: ShippingAdapterContext = { mode: 'production', credentials: { token: 'first' } };
    const registry = createShippingAdapterRegistry({ 'merchant-courier': resolved => { captured = resolved; return fixtureAdapter(vendors[0], resolved); } });
    registry.create('merchant-courier', caller);
    (caller.credentials as Record<string, string>).token = 'second';
    expect(captured?.credentials.token).toBe('first');
    expect(captured?.mode).toBe('production');
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured?.credentials)).toBe(true);
  });

  it.each(['createShipment', 'retrieveShipment', 'buyShipment', 'retrieveTracker', 'verifyWebhook', 'provider-id'])('fails closed for a missing or mismatched %s', missing => {
    const registry = createShippingAdapterRegistry({ 'merchant-courier': resolved => {
      const adapter = fixtureAdapter(vendors[0], resolved);
      if (missing === 'verifyWebhook') delete (adapter as Partial<ShippingAdapter>).verifyWebhook;
      else if (missing === 'provider-id') Object.assign(adapter.provider, { provider: 'another-vendor' });
      else delete (adapter.provider as unknown as Record<string, unknown>)[missing];
      return adapter;
    } });
    expect(() => registry.create('merchant-courier', context)).toThrow('Shipping adapter could not be initialized');
  });

  it.each([null, { provider: null }, { provider: 'merchant-courier' }, undefined])('rejects malformed adapter %j', malformed => {
    const registry = createShippingAdapterRegistry({ 'merchant-courier': (() => malformed) as ShippingAdapterFactory });
    expect(() => registry.create('merchant-courier', context)).toThrow('Shipping adapter could not be initialized');
  });

  it.each([null, { mode: 'unknown', credentials: {} }, { mode: 'test', credentials: [] }, { mode: 'test', credentials: { token: 123 } }])('rejects malformed private context %j before calling a factory', invalid => {
    const factory = vi.fn((resolved: ShippingAdapterContext) => fixtureAdapter(vendors[0], resolved));
    const registry = createShippingAdapterRegistry({ 'merchant-courier': factory });
    expect(() => registry.create('merchant-courier', invalid as ShippingAdapterContext)).toThrow('Shipping adapter could not be initialized');
    expect(factory).not.toHaveBeenCalled();
  });

  it('never preserves a constructor error message or cause containing credentials', () => {
    const registry = createShippingAdapterRegistry({ 'merchant-courier': resolved => { throw new Error(JSON.stringify(resolved)); } });
    let failure: unknown;
    try { registry.create('merchant-courier', context); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('Shipping adapter could not be initialized');
    expect((failure as Error).cause).toBeUndefined();
    expect(String((failure as Error).stack)).not.toContain(context.credentials.token);
    expect(String((failure as Error).stack)).not.toContain(context.credentials.webhook);
  });

  it.each([null, [], { 'Bad Vendor': () => undefined }, { token: 'private-fixture-token' }])('rejects invalid explicit registration without exposing values', invalid => {
    expect(() => createShippingAdapterRegistry(invalid as unknown as Record<string, ShippingAdapterFactory>)).toThrow('Invalid shipping adapter registration');
  });

  it('redacts errors from registration and adapter property getters', () => {
    expect(() => createShippingAdapterRegistry({ get courier() { throw new Error(context.credentials.token); } })).toThrow('Invalid shipping adapter registration');
    const registry = createShippingAdapterRegistry({ courier: () => ({ get provider() { throw new Error(context.credentials.token); }, verifyWebhook: () => undefined }) });
    expect(() => registry.create('courier', context)).toThrow('Shipping adapter could not be initialized');
  });
});

describe('browser-safe shipping values', () => {
  it.each(['easypost', 'own-courier-v2', 'a', `a${'b'.repeat(63)}`])('accepts bounded provider identifier %s', value => expect(isShippingProviderId(value)).toBe(true));
  it.each(['', 'UPS', 'a_b', '-a', 'a-', 'a--b', '1vendor', 'vendor/path', 'https://vendor.example', `a${'b'.repeat(64)}`, null, 10])('rejects invalid provider identifier %j', value => expect(isShippingProviderId(value)).toBe(false));
  it('preserves HTTPS tracking URLs and rejects unsafe or credential-bearing URLs', () => {
    expect(safeShippingUrl('https://tracking.example/status?code=opaque')).toBe('https://tracking.example/status?code=opaque');
    for (const value of ['http://tracking.example', 'javascript:alert(1)', 'data:text/plain,tracking', 'https://name:password@tracking.example', '/relative', 'x'.repeat(2049), null]) expect(safeShippingUrl(value)).toBeUndefined();
  });
  it('exports an immutable normalized status vocabulary', () => {
    expect(shipmentStatuses).toContain('PURCHASE_UNKNOWN');
    expect(shipmentStatuses).toContain('DELIVERED');
    expect(Object.isFrozen(shipmentStatuses)).toBe(true);
    expect(new Set(shipmentStatuses).size).toBe(shipmentStatuses.length);
  });
});
