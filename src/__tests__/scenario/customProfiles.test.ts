import { describe, expect, it, vi } from 'vitest';
import { defineModule, defineProfile } from '@footprint/features';
import { createMemoryProfileStore } from '@footprint/platform';
import { createBusinessPlatform } from '../../businessPlatform.js';
import { allBusinessModules } from '../../modules/index.js';
import { allBusinessProfiles } from '../../profiles/index.js';
import { createMemoryOverrideStore } from '../../overrides/unitOverrides.js';
import { createCatalogAdapters } from '../../adapters/catalogAdapters.js';
import { getBusinessTypeConfig, isValidBusinessType, createConfigPlatform } from '../../helpers.js';
import { createMockRepository, fixtureContext, fixtureScope } from '../helpers.js';

const flowers = defineModule({ id: 'flowers', name: 'Flowers', description: 'Florist catalog rules', domain: 'catalog', requires: ['catalog'], terminology: { vase: { default: 'Vase' } } });
const florist = defineProfile({ type: 'flower-shop', displayName: 'Flower Shop', modules: ['flowers', 'orders', 'inventory'], schedulingPattern: 'same-day-delivery', meta: { theme: { accent: '#526b56', label: 'Garden' } } });
const definitions = {
  modules: [...allBusinessModules.map(module => module.id === 'catalog' ? defineModule({ ...module, terminology: { ...module.terminology, product: { ...module.terminology.product, 'flower-shop': 'Bouquet' } } }) : module), flowers],
  profiles: [...allBusinessProfiles, florist],
};
const store = () => createMemoryProfileStore([{ ...fixtureScope, profileType: florist.type, revision: 1, createdAt: '2030-01-01' }]);

describe('configured commerce profiles and module registries', () => {
  it('executes a third profile with its own terminology, configuration and chart dispatch', async () => {
    const create = vi.fn(async () => ({ acknowledgement: 'committed' as const, output: { productId: 'bouquet-1' } }));
    const platform = createBusinessPlatform({ ...definitions, profileStore: store(), scope: fixtureScope, authorizer: () => true, operations: { 'create-product': create } });
    expect(platform.supportedBusinessTypes()).toEqual(['kids-boutique', 'chocolate-shop', 'flower-shop']);
    const unit = await platform.resolveUnit(fixtureContext);
    expect(unit.config.enabledModules.has('flowers')).toBe(true);
    expect(unit.config.enabledModules.has('catalog')).toBe(true);
    expect((await platform.getTermResolverWithOverrides(fixtureContext))('product')).toBe('Bouquet');
    expect((await platform.getFullTermResolver(fixtureContext))('product')).toEqual({ singular: 'Bouquet', plural: 'Bouquets' });
    const config = await platform.getUnitBusinessConfig(fixtureContext);
    expect(config).toMatchObject({ type: florist.type, fulfillmentPattern: 'same-day-delivery', theme: { accent: '#526b56' }, services: { catalog: true, flowers: true, payments: false } });
    const input = { name: 'Spring bouquet', basePrice: 30 };
    const result = await platform.executeServiceFlow(fixtureContext, 'create-product', input);
    expect(result.status).toBe('success'); expect(result.flowMeta?.description).toContain('Bouquet');
    expect(create.mock.calls[0][1]).toMatchObject({ ...fixtureContext, businessType: florist.type });
    const dispatch = await platform.getActionDispatch(fixtureContext, 'create-product', input);
    expect(dispatch).not.toHaveProperty('error');
    if ('branches' in dispatch) expect(dispatch.branches.get(dispatch.deciderFn())?.resolver().description).toContain('Bouquet');
    expect(isValidBusinessType(florist.type, definitions.profiles)).toBe(true);
    expect(getBusinessTypeConfig(florist.type, definitions.profiles)?.theme.label).toBe('Garden');
    expect(createConfigPlatform(florist.type, 'florist-preview', definitions).supportedBusinessTypes()).toContain(florist.type);
  });
  it('keeps configured profile arrays/metadata immutable and does not leak them into another deployment', async () => {
    const profiles = structuredClone(definitions.profiles);
    const modules = structuredClone(definitions.modules);
    const platform = createBusinessPlatform({ profiles, modules, profileStore: store(), scope: fixtureScope });
    profiles.length = 0; modules.length = 0;
    expect(platform.supportedBusinessTypes()).toContain('flower-shop');
    const exposed = platform.getBusinessTypeConfig(florist.type)!;
    (exposed.theme as { accent: string }).accent = 'mutated';
    expect(platform.getBusinessTypeConfig(florist.type)?.theme.accent).toBe('#526b56');
    const other = createBusinessPlatform({ profileStore: store(), scope: fixtureScope });
    expect(other.supportedBusinessTypes()).not.toContain(florist.type);
    expect(other.getBusinessTypeConfig(florist.type)).toBeUndefined();
    await expect(other.resolveUnit(fixtureContext)).rejects.toThrow('Unknown profile');
    await expect(platform.resolveUnit({ ...fixtureContext, tenantId: 'another-company' })).rejects.toThrow('requested store');
  });
  it('disables a custom dependent module together with its prerequisite and denies execution', async () => {
    const create = vi.fn();
    const overrideStore = createMemoryOverrideStore([{ scope: fixtureScope, overrides: { revision: 1, moduleToggles: { catalog: false } } }]);
    const platform = createBusinessPlatform({ ...definitions, profileStore: store(), scope: fixtureScope, overrideStore, authorizer: () => true, operations: { 'create-product': create } });
    const config = await platform.getUnitBusinessConfig(fixtureContext);
    expect(config.services.catalog).toBe(false); expect(config.services.flowers).toBe(false);
    expect((await platform.executeServiceFlow(fixtureContext, 'create-product', { name: 'Bouquet', basePrice: 30 })).status).toBe('error');
    expect(create).not.toHaveBeenCalled();
  });
  it('admits custom profiles in explicit adapters without accepting an unregistered type or another store', async () => {
    const create = vi.fn(async () => ({ acknowledgement: 'committed' as const, output: { productId: 'bouquet-1' } }));
    const [adapter] = createCatalogAdapters(createMockRepository(), { 'create-product': create }, fixtureScope, { profiles: [florist] });
    const input = { name: 'Bouquet', basePrice: 30 };
    await expect(adapter.execute(input, { ...fixtureContext, profileType: florist.type })).resolves.toMatchObject({ acknowledgement: 'committed' });
    await expect(adapter.execute(input, { ...fixtureContext, profileType: 'kids-boutique' })).rejects.toThrow('Unknown business profile');
    await expect(adapter.execute(input, { ...fixtureContext, profileType: 'kids-boutique', businessType: florist.type } as never)).rejects.toThrow('profile context does not match');
    await expect(adapter.execute(input, { ...fixtureContext, profileType: florist.type, unitId: 'another-store' })).rejects.toThrow('requested store');
    expect(create).toHaveBeenCalledOnce();
  });
  it('rejects invalid registry dependencies during construction', () => {
    expect(() => createBusinessPlatform({ profiles: [florist], modules: [flowers], profileStore: store(), scope: fixtureScope })).toThrow('Invalid business module');
  });
});
