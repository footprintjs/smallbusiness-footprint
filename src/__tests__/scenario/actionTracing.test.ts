import footprintPackage from 'footprintjs/package.json' with { type: 'json' };
import { describe, expect, it, vi } from 'vitest';
import { createFixturePlatform, fixtureContext, fixtureScope, createMockRepository } from '../helpers.js';
import { createPaymentAdapters } from '../../adapters/paymentAdapters.js';

describe('configured Blueprint recorder through BusinessPlatform', () => {
  it('records genuine SDK10 direct-action stages with no source payload, PII or private response', async () => {
    const record = vi.fn(async () => {});
    const reserve = vi.fn(async () => ({ acknowledgement: 'held' as const, output: { orderId: 'order-1', attemptId: 'attempt-1', reservationState: 'HELD' }, response: { checkoutToken: 'PRIVATE_TOKEN' } }));
    const platform = createFixturePlatform({ traceRecorder: { record }, providers: { checkout: { reserve } } });
    const result = await platform.executeAction(fixtureContext, 'create-order', {
      idempotencyKey: 'private-command-key', items: [{ productId: 'product-1', quantity: 1 }],
      shipping: { firstName: 'PRIVATE_NAME', lastName: 'Customer', email: 'private@example.test', address: 'PRIVATE_ADDRESS', city: 'Town', state: 'CA', zipCode: '12345' },
    });
    expect(result.status).toBe('success'); expect(reserve).toHaveBeenCalledOnce(); expect(record).toHaveBeenCalledOnce();
    const [trace, context] = record.mock.calls[0];
    expect(trace.runtime).toEqual({ library: 'footprintjs', version: footprintPackage.version });
    expect(trace.stageMetrics.map(metric => metric.stageName)).toEqual(['AuthorizeAction', 'ValidateInput', 'ExecuteAction', 'AcknowledgeAction']);
    expect(trace.executionSnapshot.commitLog.map(commit => commit.stageId)).toEqual(['authorize-action', 'validate-input', 'execute-action', 'acknowledge-action']);
    expect(trace.executionSnapshot.sharedState).toEqual({}); expect(context.unitId).toBe(fixtureScope.unitId);
    for (const value of ['PRIVATE_NAME', 'private@example.test', 'PRIVATE_ADDRESS', 'PRIVATE_TOKEN', 'private-command-key']) expect(JSON.stringify(result)).not.toContain(value);
  });
  it('a throwing recorder and observer preserve the acknowledged operation', async () => {
    const operation = vi.fn(async () => ({ acknowledgement: 'committed' as const, output: { productId: 'p1', status: 'ACTIVE' } }));
    const record = vi.fn(async () => { throw new Error('Recorder unavailable'); });
    const onTraceError = vi.fn(() => { throw new Error('Observer unavailable'); });
    const result = await createFixturePlatform({ operations: { 'create-product': operation }, traceRecorder: { record }, onTraceError }).executeAction(fixtureContext, 'create-product', { name: 'Dress', basePrice: 20 });
    expect(result.status).toBe('success'); expect(result.result).toMatchObject({ acknowledgement: 'committed', output: { productId: 'p1' } });
    expect(operation).toHaveBeenCalledOnce(); expect(record).toHaveBeenCalledOnce(); expect(onTraceError).toHaveBeenCalledOnce();
  });
  it('captures adapter scope rather than allowing a caller to retarget a repository', async () => {
    const scope = { ...fixtureScope }; const start = vi.fn(async () => ({ acknowledgement: 'pending' as const, output: { orderId: 'o1' } }));
    const [adapter] = createPaymentAdapters(createMockRepository(), { 'process-payment': start }, scope); scope.tenantId = 'other-brand';
    const command = { orderId: 'o1', attemptId: 'a1', checkoutToken: 'PRIVATE_TOKEN' };
    await expect(adapter.execute(command, { ...scope, profileType: 'kids-boutique' })).rejects.toThrow('requested store');
    await expect(adapter.execute(command, { ...fixtureScope, profileType: 'kids-boutique' })).resolves.toMatchObject({ acknowledgement: 'pending' });
    expect(start).toHaveBeenCalledOnce();
  });
  it('passes the host deadline to Blueprint and stops before its provider is invoked', async () => {
    const operation = vi.fn(async () => ({ acknowledgement: 'committed' as const, output: { productId: 'p1' } }));
    const options = vi.fn(() => ({ deadline: Date.now() - 1 }));
    const result = await createFixturePlatform({ operations: { 'create-product': operation }, executionOptions: options }).executeAction(fixtureContext, 'create-product', { name: 'Dress', basePrice: 20 });
    expect(result.status).toBe('error'); expect(operation).not.toHaveBeenCalled(); expect(options).toHaveBeenCalledOnce();
  });
});
