import { describe, it, expect, vi } from 'vitest';
import { FlowChartExecutor } from 'footprintjs';
import { ScopeFacade } from 'footprintjs/advanced';
import { createBusinessServiceRegistry, resolveFlowBuilder, getRegisteredActionIds, buildActionDispatch } from '../../flows/businessServiceComposer.js';
import { createBusinessOperationFlow } from '../../flows/shared/businessFlow.js';
import { createFixturePlatform, createMockRepository, fixtureContext, fixtureScope } from '../helpers.js';

describe('real SDK10 business service composition', () => {
  it('describes all twelve configurable action charts', () => {
    const registry = createBusinessServiceRegistry(undefined);
    expect(getRegisteredActionIds()).toHaveLength(12); expect(registry.describeAllServices()).toHaveLength(12);
    expect(registry.describeService('create-product', 'chocolate-shop')?.description).toContain('Treat');
    expect(resolveFlowBuilder('missing')).toBeUndefined();
  });
  it('fails closed without a trusted prepare boundary', async () => {
    const repo = createMockRepository(); const create = vi.spyOn(repo, 'createProduct');
    const result = await createBusinessServiceRegistry(repo, { scope: fixtureScope }).executeService('create-product', { name: 'Dress', basePrice: 20 }, { ...fixtureContext, businessType: 'kids-boutique' });
    expect(result.code).toBe('BUSINESS_UNSUPPORTED'); expect(create).not.toHaveBeenCalled();
  });
  it('refuses direct raw chart input that bypasses private prepared request registration', async () => {
    const operation = vi.fn(); const chart = createBusinessOperationFlow('create-product', { operation, requests: { get: () => undefined } });
    const executor = new FlowChartExecutor(chart, { initialContext: { input: { name: 'Dress', basePrice: 20 } }, scopeFactory: (ctx, name, args, env) => new ScopeFacade(ctx, name, args, env) });
    await expect(executor.run()).rejects.toThrow('private validated request'); expect(operation).not.toHaveBeenCalled();
  });
  it('honors the trusted profile variant in runtime execution and metadata', async () => {
    const defaultBuilder = vi.fn((dependencies) => createBusinessOperationFlow('create-product', dependencies, 'Default variant'));
    const chocolateBuilder = vi.fn((dependencies) => createBusinessOperationFlow('create-product', dependencies, 'Chocolate variant'));
    const flowRegistry = { 'create-product': { default: defaultBuilder, variants: { 'chocolate-shop': chocolateBuilder } } };
    const platform = createFixturePlatform({ flowRegistry }, 'chocolate-shop');
    const result = await platform.executeServiceFlow(fixtureContext, 'create-product', { name: 'Truffle', basePrice: 20 });
    expect(result.status).toBe('success'); expect(result.flowMeta?.description).toContain('Chocolate variant');
    expect(chocolateBuilder).toHaveBeenCalled(); expect(defaultBuilder).not.toHaveBeenCalled();
    const dispatch = buildActionDispatch('create-product', 'chocolate-shop', { requests: { get: () => undefined } }, flowRegistry)!;
    expect(dispatch.deciderFn()).toBe('create-product:chocolate-shop');
    expect(dispatch.branches.get(dispatch.deciderFn())?.resolver().description).toContain('Chocolate variant');
  });
  it('captures each request independently across concurrent executions', async () => {
    const operation = vi.fn(async input => { await Promise.resolve(); return { acknowledgement: 'committed' as const, output: { productId: input.name } }; });
    const platform = createFixturePlatform({ operations: { 'create-product': operation } });
    const results = await Promise.all(['one', 'two'].map(name => platform.executeServiceFlow(fixtureContext, 'create-product', { name, basePrice: 20 })));
    expect(results.map(result => result.result?.productId)).toEqual(['one', 'two']); expect(operation).toHaveBeenCalledTimes(2);
  });
});
