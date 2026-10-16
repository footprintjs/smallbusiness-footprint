import { describe, expect, it, vi } from 'vitest';
import { createFixturePlatform, fixtureContext, fixtureScope, validCheckout, createMockRepository } from '../helpers.js';
import { createCheckoutOperation } from '../../checkoutPort.js';
import { createFulfillmentAdapters } from '../../adapters/fulfillmentAdapters.js';
import { validateBusinessCommand } from '../../commandValidation.js';

const proof = 'PRIVATE_EMAIL_VERIFICATION_PROOF';
const command = { ...validCheckout, emailVerificationToken: proof, shipping: { ...validCheckout.shipping, country: 'GB' } };
const receipt = { orderId: 'order-proof', attemptId: 'attempt-proof', state: 'RESERVED', reservationState: 'HELD' as const, traceRunId: 'authoritative-checkout-trace' };

describe('checkout proof remains private while reaching the authoritative port', () => {
  it.each(['action', 'service'] as const)('%s validates and delegates the exact proof once without recording it', async kind => {
    const reserve = vi.fn(async () => receipt);
    const record = vi.fn(async () => {});
    const platform = createFixturePlatform({ operations: { 'create-order': createCheckoutOperation({ reserve }) }, traceRecorder: { record } });
    const result = kind === 'action'
      ? await platform.executeAction(fixtureContext, 'create-order', command)
      : await platform.executeServiceFlow(fixtureContext, 'create-order', command);
    expect(result.status).toBe('success');
    expect(reserve).toHaveBeenCalledOnce();
    expect(reserve.mock.calls[0][0]).toEqual(command);
    expect(reserve.mock.calls[0][0]).not.toBe(command);
    expect(reserve.mock.calls[0][1]).toMatchObject({ ...fixtureContext, businessType: 'kids-boutique' });
    for (const privateValue of [proof, command.shipping.email, command.shipping.address, command.idempotencyKey]) {
      expect(JSON.stringify(result)).not.toContain(privateValue);
      expect(JSON.stringify(record.mock.calls)).not.toContain(privateValue);
    }
  });
  it('accepts the same proof in prepared dispatch and an explicitly scoped adapter', async () => {
    const reserve = vi.fn(async () => receipt);
    const operation = createCheckoutOperation({ reserve });
    const platform = createFixturePlatform({ operations: { 'create-order': operation } });
    const prepared = await platform.prepareAction(fixtureContext, 'create-order', command);
    expect(prepared.input).toEqual(command);
    const dispatch = await platform.getActionDispatch(fixtureContext, 'create-order', command);
    expect(dispatch).not.toHaveProperty('error');
    expect(JSON.stringify(dispatch)).not.toContain(proof);
    const [adapter] = createFulfillmentAdapters(createMockRepository(), { 'create-order': operation }, fixtureScope);
    await expect(adapter.execute(command, { ...fixtureContext, profileType: 'kids-boutique' })).resolves.toMatchObject({ acknowledgement: 'held' });
    expect(reserve.mock.calls[0][0]).toEqual(command);
  });
  it('retains proof-free deployments and rejects malformed proof/country without reaching checkout', async () => {
    expect(() => validateBusinessCommand('create-order', validCheckout)).not.toThrow();
    const reserve = vi.fn(async () => receipt);
    const platform = createFixturePlatform({ operations: { 'create-order': createCheckoutOperation({ reserve }) } });
    for (const invalid of [
      { ...command, emailVerificationToken: 123 },
      { ...command, emailVerificationToken: '' },
      { ...command, emailVerificationToken: 'x'.repeat(4097) },
      { ...command, shipping: { ...command.shipping, country: 'United Kingdom' } },
      { ...command, proof: 'unknown-property' },
    ]) expect((await platform.executeServiceFlow(fixtureContext, 'create-order', invalid)).status).toBe('error');
    expect(reserve).not.toHaveBeenCalled();
  });
  it('lets the application enforce verification before any stock operation', async () => {
    const reserveStock = vi.fn(async () => receipt);
    const reserve = vi.fn(async supplied => {
      if (supplied.emailVerificationToken !== proof) throw new Error('Proof required before stock reservation');
      return reserveStock();
    });
    const platform = createFixturePlatform({ operations: { 'create-order': createCheckoutOperation({ reserve }) } });
    expect((await platform.executeServiceFlow(fixtureContext, 'create-order', validCheckout)).status).toBe('error');
    expect(reserveStock).not.toHaveBeenCalled();
    expect((await platform.executeServiceFlow(fixtureContext, 'create-order', command)).status).toBe('success');
    expect(reserveStock).toHaveBeenCalledOnce();
  });
});
