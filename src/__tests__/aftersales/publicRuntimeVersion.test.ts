import { describe, expect, it, vi } from 'vitest';
import footprintPackage from 'footprintjs/package.json' with { type: 'json' };
import { createAfterSalesService } from '../../aftersales/runtime.js';
import type { AfterSalesTrace } from '../../aftersales.js';

vi.mock('footprintjs', async importOriginal => {
  const actual = await importOriginal<typeof import('footprintjs')>();
  return { flowChart: actual.flowChart, FlowChartExecutor: actual.FlowChartExecutor, decide: actual.decide };
});

describe('public after-sales runtime metadata', () => {
  it('records a rejected request using public engine exports without reading a repository or provider', async () => {
    const traces: AfterSalesTrace[] = [];
    const repository = { getOrder: vi.fn() }, payments = { refund: vi.fn() };
    const service = createAfterSalesService({ storeId: 'store', repository: repository as never, payments: payments as never,
      authorizer: () => false, onTrace: trace => { traces.push(trace); } });
    await expect(service.request({ orderId: 'order', requestId: 'request', kind: 'cancellation', items: [{ lineId: 'line', quantity: 1 }] }, { actorId: 'customer', role: 'customer' })).rejects.toBeDefined();
    expect(repository.getOrder).not.toHaveBeenCalled();
    expect(payments.refund).not.toHaveBeenCalled();
    expect(traces).toHaveLength(1);
    expect(traces[0].runtime).toEqual({ library: 'footprintjs', version: footprintPackage.version });
    expect(traces[0].outcome).toBe('error');
  });
});
