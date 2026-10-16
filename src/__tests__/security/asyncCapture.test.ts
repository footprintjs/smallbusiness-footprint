import { describe, expect, it, vi } from 'vitest';
import { createBusinessPlatform } from '../../businessPlatform.js';
import { createBusinessServiceRegistry } from '../../flows/businessServiceComposer.js';
import { fixtureScope, fixtureContext } from '../helpers.js';

function deferredLookup() {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const getBinding = vi.fn(async () => { await pending; return { ...fixtureScope, revision: 1, profileType: 'kids-boutique', createdAt: '2030-01-01' }; });
  return { release, getBinding };
}
describe('capture caller context before asynchronous boundaries', () => {
  it('does not authorize an actor changed while the initial profile lookup is pending', async () => {
    const lookup = deferredLookup(); const operation = vi.fn();
    const authorizer = vi.fn(({ context }) => context.userId === 'allowed-admin');
    const platform = createBusinessPlatform({ scope: fixtureScope, profileStore: { getBinding: lookup.getBinding }, operations: { 'create-product': operation }, authorizer });
    const caller = { ...fixtureContext, userId: 'denied-staff' };
    const promise = platform.executeServiceFlow(caller, 'create-product', { name: 'Dress', basePrice: 20 });
    caller.userId = 'allowed-admin'; lookup.release();
    expect((await promise).status).toBe('error'); expect(authorizer).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ userId: 'denied-staff' }) })); expect(operation).not.toHaveBeenCalled();
  });
  it('keeps both the captured actor and command when lookup is pending', async () => {
    const lookup = deferredLookup(); const operation = vi.fn(async (input, context) => ({ acknowledgement: 'committed' as const, output: { productId: `${context.userId}-${input.name}` } }));
    const platform = createBusinessPlatform({ scope: fixtureScope, profileStore: { getBinding: lookup.getBinding }, operations: { 'create-product': operation }, authorizer: ({ context }) => context.userId === 'allowed-admin' });
    const caller = { ...fixtureContext, userId: 'allowed-admin' }; const command = { name: 'Original', basePrice: 20 };
    const promise = platform.executeServiceFlow(caller, 'create-product', command); caller.userId = 'other-actor'; command.name = 'Changed'; lookup.release();
    const result = await promise; expect(result.status).toBe('success'); expect(result.result?.productId).toBe('allowed-admin-Original'); expect(operation).toHaveBeenCalledOnce();
  });
  it.each(['buildServiceFlow', 'getActionDispatch'] as const)('%s uses captured actor and command', async method => {
    const lookup = deferredLookup(); const authorizer = vi.fn(({ context }) => context.userId === 'allowed-admin');
    const platform = createBusinessPlatform({ scope: fixtureScope, profileStore: { getBinding: lookup.getBinding }, operations: { 'create-product': vi.fn() }, authorizer });
    const caller = { ...fixtureContext, userId: 'allowed-admin' }; const input = { name: 'Original', basePrice: 20 };
    const promise = platform[method](caller, 'create-product', input); caller.userId = 'denied'; input.name = ' '; lookup.release();
    expect(await promise).not.toHaveProperty('error'); expect(authorizer).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ userId: 'allowed-admin' }) }));
  });
  it.each(['getTermResolverWithOverrides', 'getFullTermResolver', 'getUnitBusinessConfig'] as const)('%s does not read a changed store after profile resolution', async method => {
    const lookup = deferredLookup(); const getOverrides = vi.fn(async () => ({ revision: 1, terminologyOverrides: { product: 'Garment' } }));
    const platform = createBusinessPlatform({ scope: fixtureScope, profileStore: { getBinding: lookup.getBinding }, overrideStore: { getOverrides } });
    const caller = { ...fixtureContext }; const promise = platform[method](caller); caller.tenantId = 'other-brand'; caller.unitId = 'other-store'; lookup.release();
    await promise; for (const [scope] of getOverrides.mock.calls) expect(scope).toMatchObject(fixtureScope);
  });
  it('captures and freezes low-level registry prepare context and input', async () => {
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
    const seen: string[] = [];
    const registry = createBusinessServiceRegistry(undefined, { scope: fixtureScope, operations: { 'create-product': async () => ({ acknowledgement: 'committed', output: { productId: 'p1' } }) }, prepare: async (_action, input, context) => { await pending; seen.push(`${context.userId}:${input.name}`); return { input, context }; } });
    const caller = { ...fixtureContext, businessType: 'kids-boutique' as const }; const command = { name: 'Original', basePrice: 20 };
    const promise = registry.executeService('create-product', command, caller); caller.userId = 'changed-actor'; command.name = 'Changed'; release();
    expect((await promise).status).toBe('success'); expect(seen).toEqual(['admin-fixture:Original']);
  });
});
