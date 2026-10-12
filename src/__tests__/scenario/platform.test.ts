import { describe, it, expect, vi } from 'vitest';
import { createMemoryProfileStore } from '@footprint/platform';
import { createBusinessPlatform } from '../../businessPlatform.js';
import { createMemoryOverrideStore } from '../../overrides/unitOverrides.js';
import { createFixturePlatform, createMockRepository, fixtureScope, fixtureContext } from '../helpers.js';

describe('scoped business platform', () => {
  it('fails closed when no authorization policy is provided', async () => {
    const repo = createMockRepository(); const create = vi.spyOn(repo, 'createProduct');
    const platform = createFixturePlatform({ repository: repo, authorizer: undefined });
    expect((await platform.executeServiceFlow(fixtureContext, 'create-product', { name: 'Dress', basePrice: 20 })).status).toBe('error');
    expect(await platform.getAvailableActions(fixtureContext)).toEqual([]); expect(create).not.toHaveBeenCalled();
  });
  it('enforces the same authorization in direct action and service flow entry points', async () => {
    const operation = vi.fn(); const authorizer = vi.fn(({ action, context }) => action.id === 'create-product' && context.userId === 'allowed');
    const platform = createFixturePlatform({ operations: { 'create-product': operation }, authorizer });
    expect((await platform.executeServiceFlow(fixtureContext, 'create-product', { name: 'Dress', basePrice: 20 })).status).toBe('error');
    expect((await platform.executeAction(fixtureContext, 'create-product', { name: 'Dress', basePrice: 20 })).status).toBe('error');
    expect(operation).not.toHaveBeenCalled(); expect(authorizer.mock.calls[0][0]).not.toHaveProperty('input');
  });
  it('isolates two tenants with the same unit name and rejects wrong-scope writes', async () => {
    const a = { tenantId: 'brand-a', campusId: 'campus-a', unitId: 'store' }; const b = { tenantId: 'brand-b', campusId: 'campus-b', unitId: 'store' };
    const store = createMemoryProfileStore([{ ...a, profileType: 'kids-boutique', revision: 1, createdAt: '2030-01-01' }, { ...b, profileType: 'chocolate-shop', revision: 1, createdAt: '2030-01-01' }]);
    const overrideStore = createMemoryOverrideStore([{ scope: a, overrides: { revision: 1, terminologyOverrides: { product: 'Garment' } } }, { scope: b, overrides: { revision: 2, terminologyOverrides: { product: 'Truffle' } } }]);
    const operationA = vi.fn(async () => ({ acknowledgement: 'committed' as const, output: { productId: 'brand-a-product' } }));
    const platformA = createBusinessPlatform({ scope: a, profileStore: store, overrideStore, operations: { 'create-product': operationA }, authorizer: () => true });
    const platformB = createBusinessPlatform({ scope: b, profileStore: store, overrideStore, repository: createMockRepository(), authorizer: () => true });
    expect((await platformA.getTermResolverWithOverrides(a))('product')).toBe('Garment'); expect((await platformB.getTermResolverWithOverrides(b))('product')).toBe('Truffle');
    expect((await platformA.executeServiceFlow(b, 'create-product', { name: 'Wrong', basePrice: 20 })).code).toBe('BUSINESS_SCOPE_MISMATCH');
    await expect(platformA.executeAction(b, 'create-product', { name: 'Wrong', basePrice: 20 })).rejects.toThrow('requested store');
    await expect(platformA.getUnitOverrides(b)).rejects.toThrow('requested store'); expect(operationA).not.toHaveBeenCalled();
  });
  it('explicitly disabling catalog removes dependent actions and never calls the provider', async () => {
    const operation = vi.fn(); const overrideStore = createMemoryOverrideStore([{ scope: fixtureScope, overrides: { revision: 1, moduleToggles: { catalog: false } } }]);
    const platform = createFixturePlatform({ overrideStore, operations: { 'create-product': operation } });
    const config = await platform.getUnitBusinessConfig(fixtureContext);
    expect(config.services.catalog).toBe(false); expect(config.services.orders).toBe(false); expect(config.services.storefront).toBe(false);
    expect((await platform.executeServiceFlow(fixtureContext, 'create-product', { name: 'Dress', basePrice: 20 })).status).toBe('error');
    expect((await platform.getAvailableActions(fixtureContext)).some(action => action.name === 'create-product')).toBe(false); expect(operation).not.toHaveBeenCalled();
  });
  it('derives versioned theme/terminology overrides without mutating profile defaults', async () => {
    const overrideStore = createMemoryOverrideStore([{ scope: fixtureScope, overrides: { revision: 3, terminologyOverrides: { product: 'Garment' }, themeOverrides: { accent: '#ff0000' } } }]);
    const platform = createFixturePlatform({ overrideStore });
    expect((await platform.getUnitBusinessConfig(fixtureContext)).theme.accent).toBe('#ff0000'); expect(platform.getBusinessTypeConfig('kids-boutique')?.theme.accent).toBe('#e8a0bf');
    expect((await platform.getFullTermResolver(fixtureContext))('product')).toEqual({ singular: 'Garment', plural: 'Garments' });
    expect(platform.describeAllServices()).toHaveLength(12);
  });
  it('strongly re-reads overrides and refuses semantic module change under same revision', async () => {
    let toggles = { campaigns: true };
    const overrideStore = { getOverrides: async () => ({ revision: 1, moduleToggles: toggles }) };
    const platform = createFixturePlatform({ overrideStore }); await platform.resolveUnit(fixtureContext);
    toggles = { campaigns: false };
    await expect(platform.resolveUnit(fixtureContext)).rejects.toThrow('without a revision');
  });
});
