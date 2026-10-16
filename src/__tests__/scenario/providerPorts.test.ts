import { describe, expect, it, vi } from 'vitest';
import { flowChart } from 'footprintjs';
import type { ScopeFacade } from 'footprintjs/advanced';
import { createPublicationOperation, parseBusinessPublicationCommand } from '../../publicationPort.js';
import { createInventoryOperation } from '../../inventoryPort.js';
import { createBusinessOperationFlow } from '../../flows/shared/businessFlow.js';
import type { BusinessFlowDependencies } from '../../flows/shared/businessFlow.js';
import { createFixturePlatform, fixtureContext, fixtureScope } from '../helpers.js';
const operationContext = { ...fixtureContext, businessType: 'kids-boutique' as const };
const activation = { kind: 'activate' as const, expectedVersion: 4, expectedRevision: 2, source: { kind: 'theme' as const, id: 'theme-1' } };
const receipt = { config: { version: 5, publication: { storeId: fixtureScope.unitId, revision: 5, publishedAt: '2030-01-01T00:00:00Z' } }, source: { revision: 3 }, traceRunId: 'inner-run' };

describe('typed authoritative publication bridge', () => {
  it('delegates captured guards unchanged and returns actual acknowledged revisions', async () => {
    const publish = vi.fn(async () => receipt);
    const platform = createFixturePlatform({ providers: { publication: { publish: createPublicationOperation({ publish }) } }, includeResponse: true });
    const result = await platform.executeServiceFlow(fixtureContext, 'publish-storefront', activation);
    expect(result.status).toBe('success'); expect(result.acknowledgement).toBe('committed');
    expect(publish).toHaveBeenCalledWith(activation, operationContext); expect(publish).toHaveBeenCalledOnce();
    expect(result.result).toMatchObject({ storeId: fixtureScope.unitId, revision: 5, sourceRevision: 3, traceRunId: 'inner-run' });
    expect(result.response).toEqual(receipt); expect(result.flowMeta?.flowId).toBe('publish-storefront');
  });
  it.each([
    { ...activation, expectedVersion: undefined }, { ...activation, expectedRevision: undefined },
    { ...activation, source: { kind: 'template', id: 't1', page: 123 } },
    { ...activation, source: { kind: 'theme', id: ' ' } }, { ...activation, themeSchedule: 'bad' },
    { ...activation, themeSchedule: [{ id: 's1', themeId: 't1', startDate: '2030-01-01', enabled: 'false' }] },
    { kind: 'patch', expectedVersion: 4, patch: { features: { paymentEnabled: 'false' } } },
    { kind: 'patch', expectedVersion: 4, patch: { features: { unauthorized: true } } },
    { kind: 'rollback', expectedVersion: 4, version: '3' },
  ])('rejects unsupported/malformed commands before publisher %j', async input => {
    const publish = vi.fn(); await expect(createPublicationOperation({ publish })(input, operationContext)).rejects.toMatchObject({ code: 'BUSINESS_INPUT_INVALID' }); expect(publish).not.toHaveBeenCalled();
  });
  it.each([
    { ...receipt, config: { ...receipt.config, version: 4 } },
    { ...receipt, config: { ...receipt.config, publication: { ...receipt.config.publication, storeId: 'other-brand' } } },
    { ...receipt, source: { revision: 2 } },
  ])('refuses to acknowledge a mismatched committed receipt', async value => {
    await expect(createPublicationOperation({ publish: async () => value })(activation, operationContext)).rejects.toMatchObject({ code: 'BUSINESS_RECEIPT_INVALID' });
  });
  it('preserves supported blank optional seasonal fields without mutating input', async () => {
    const command = { ...activation, themeSchedule: [{ id: 'season-1', themeId: 'theme-1', startDate: '2030-01-01', endDate: '', label: '', enabled: true }] };
    const publish = vi.fn(async () => receipt);
    await createPublicationOperation({ publish })(command, operationContext);
    expect(publish.mock.calls[0][0].themeSchedule[0]).toEqual({ id: 'season-1', themeId: 'theme-1', startDate: '2030-01-01', label: '', enabled: true });
    expect(command.themeSchedule[0].endDate).toBe('');
  });
  it('supports rollback and feature patches without a mutable-source revision', () => {
    expect(parseBusinessPublicationCommand({ kind: 'rollback', expectedVersion: 4, version: 2 })).toEqual({ kind: 'rollback', expectedVersion: 4, version: 2 });
    expect(parseBusinessPublicationCommand({ kind: 'patch', expectedVersion: 4, patch: { features: { paymentEnabled: false } } })).toMatchObject({ patch: { features: { paymentEnabled: false } } });
  });
});
describe('inventory CAS bridge has no weak stock fallback', () => {
  const command = { productId: 'p1', sku: 'p1-pink', quantityChange: -1, expectedRevision: 7, idempotencyKey: 'stock-key' };
  it('requires an atomic adapter receipt matching identity and next revision', async () => {
    const adjust = vi.fn(async () => ({ productId: 'p1', sku: 'p1-pink', inventoryRevision: 8, quantity: 3, reservedQuantity: 2 }));
    const result = await createInventoryOperation({ adjust })(command, operationContext);
    expect(result.acknowledgement).toBe('committed'); expect(adjust).toHaveBeenCalledWith(command, operationContext); expect(result.output).toMatchObject({ inventoryRevision: 8, quantity: 3, reservedQuantity: 2 });
  });
  it.each([null, { productId: 'wrong', sku: 'p1-pink', inventoryRevision: 8, quantity: 3, reservedQuantity: 2 }, { productId: 'p1', sku: 'p1-pink', inventoryRevision: 7, quantity: 3, reservedQuantity: 2 }, { productId: 'p1', sku: 'p1-pink', inventoryRevision: 8, quantity: -1, reservedQuantity: 2 }])('rejects invalid durable receipt %j', async value => {
    // Runtime fixtures deliberately exercise malformed implementations.
    const port = { adjust: async () => value } as unknown as Parameters<typeof createInventoryOperation>[0];
    await expect(createInventoryOperation(port)(command, operationContext)).rejects.toMatchObject({ code: 'BUSINESS_RECEIPT_INVALID' });
  });
  it('rejects unversioned/unduplicated stock commands before adapter', async () => {
    const adjust = vi.fn(); const { expectedRevision, ...unguarded } = command;
    await expect(createInventoryOperation({ adjust })(unguarded, operationContext)).rejects.toMatchObject({ code: 'BUSINESS_INPUT_INVALID' }); expect(adjust).not.toHaveBeenCalled();
  });
});
describe('custom chart acknowledgement safety', () => {
  it('a chart that never invokes its operation cannot return success', async () => {
    const noOp = () => flowChart<unknown, ScopeFacade>('No-op', async () => undefined, 'no-op').build();
    const operation = vi.fn(); const result = await createFixturePlatform({ operations: { 'create-product': operation }, flowRegistry: { 'create-product': { default: noOp } } }).executeServiceFlow(fixtureContext, 'create-product', { name: 'Dress', basePrice: 10 });
    expect(result.status).toBe('error'); expect(result.code).toBe('BUSINESS_RECEIPT_INVALID'); expect(operation).not.toHaveBeenCalled();
  });
  it('keeps a known committed receipt if a later observational stage fails', async () => {
    const builder = (dependencies: BusinessFlowDependencies) => flowChart<unknown, ScopeFacade>('Commit', async scope => {
      const input = scope.getValue('input') as { requestRef: string }; const request = dependencies.requests.get(input.requestRef)!;
      request.receipt = await dependencies.operation!(request.input, request.context);
    }, 'commit').addFunction('Record', async () => { throw new Error('Observation unavailable'); }, 'record').build();
    const operation = vi.fn(async () => ({ acknowledgement: 'committed' as const, output: { productId: 'committed-product' } }));
    const result = await createFixturePlatform({ operations: { 'create-product': operation }, flowRegistry: { 'create-product': { default: builder } } }).executeServiceFlow(fixtureContext, 'create-product', { name: 'Dress', basePrice: 10 });
    expect(result.status).toBe('success'); expect(result.acknowledgement).toBe('committed'); expect(result.result?.productId).toBe('committed-product'); expect(result.observationError).toContain('acknowledged'); expect(operation).toHaveBeenCalledOnce();
  });
  it('does not let callers mutate a bound repository scope after construction', async () => {
    const scope = { ...fixtureScope }; const platform = createFixturePlatform({ scope }); scope.tenantId = 'retargeted';
    expect((await platform.executeServiceFlow(fixtureContext, 'create-product', { name: 'Dress', basePrice: 10 })).status).toBe('success');
    expect((await platform.executeServiceFlow(scope, 'create-product', { name: 'Wrong', basePrice: 10 })).status).toBe('error');
  });
});
