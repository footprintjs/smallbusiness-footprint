import { describe, it, expect, vi } from 'vitest';
import { BusinessOperationError } from '../../operations.js';
import { isValidBusinessType, getBusinessTypeConfig } from '../../helpers.js';
import { createFixturePlatform, fixtureContext, createMockRepository } from '../helpers.js';

describe('authorization, schema and private trace boundary', () => {
  it.each([null, undefined, 123, {}, [], true, ' ', 'a'.repeat(201)])('rejects invalid product names before repository writes (%j)', async name => {
    const repo = createMockRepository(); const create = vi.spyOn(repo, 'createProduct');
    const result = await createFixturePlatform({ repository: repo }).executeServiceFlow(fixtureContext, 'create-product', { name, basePrice: 20 });
    expect(result.status).toBe('error'); expect(create).not.toHaveBeenCalled();
  });
  it.each([null, undefined, '100', {}, [], true, -1, Infinity, NaN])('rejects invalid prices (%j)', async basePrice => {
    const operation = vi.fn(); const result = await createFixturePlatform({ operations: { 'create-product': operation } }).executeServiceFlow(fixtureContext, 'create-product', { name: 'Dress', basePrice });
    expect(result.status).toBe('error'); expect(operation).not.toHaveBeenCalled();
  });
  it('does not accept authorization/module claims in command input', async () => {
    const operation = vi.fn(); const result = await createFixturePlatform({ operations: { 'create-product': operation } }).executeServiceFlow(fixtureContext, 'create-product', { name: 'Dress', basePrice: 20, userId: 'admin', requiredModules: [] });
    expect(result.status).toBe('error'); expect(operation).not.toHaveBeenCalled();
  });
  it.each([new Error('PRIVATE@example.test SECRET token'), new BusinessOperationError('BUSINESS_INPUT_INVALID', 'PRIVATE@example.test SECRET token')])('never records external failure details (%j)', async failure => {
    const operation = vi.fn(async () => { throw failure; });
    const result = await createFixturePlatform({ operations: { 'create-product': operation } }).executeServiceFlow(fixtureContext, 'create-product', { name: 'Private Name', basePrice: 20 });
    expect(result.status).toBe('error'); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SECRET|Private Name/);
    expect(result.executionSnapshot).toBeDefined();
  });
  it('keeps explicit private HTTP response outside default result and traces', async () => {
    const operation = async () => ({ acknowledgement: 'pending' as const, output: { orderId: 'o1', checkoutToken: 'SECRET', email: 'PRIVATE@example.test', status: 'PENDING', url: 'https://private.test' }, response: { checkoutToken: 'SECRET', url: 'https://private.test' } });
    const input = { orderId: 'o1', attemptId: 'a1', checkoutToken: 'SECRET' };
    const ordinary = await createFixturePlatform({ providers: { payments: { start: operation } } }).executeServiceFlow(fixtureContext, 'process-payment', input);
    expect(JSON.stringify(ordinary)).not.toMatch(/SECRET|private.test|PRIVATE/); expect(ordinary.response).toBeUndefined();
    const privateResult = await createFixturePlatform({ includeResponse: true, providers: { payments: { start: operation } } }).executeServiceFlow(fixtureContext, 'process-payment', input);
    expect(privateResult.response).toMatchObject({ checkoutToken: 'SECRET' });
    const { response, ...recordable } = privateResult; expect(JSON.stringify(recordable)).not.toMatch(/SECRET|private.test|PRIVATE/);
  });
  it('ignores prototype names in profile lookup', () => {
    for (const value of ['__proto__', 'constructor', 'toString']) { expect(isValidBusinessType(value)).toBe(false); expect(getBusinessTypeConfig(value)).toBeUndefined(); }
  });
});
