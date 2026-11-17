import { describe, it, expect, vi } from 'vitest';
import { FlowChartExecutor } from 'footprintjs';
import { ScopeFacade } from 'footprintjs/advanced';
import { createBusinessServiceRegistry } from '../../flows/businessServiceComposer.js';
import { createNativeBusinessFlow, getNativeBusinessPolicy, flowChart, safeNativeStage } from '../../native.js';
import type { NativeBusinessFlowOptions, NativeBusinessRequest, NativeBusinessRequestAccessor } from '../../native.js';
import type { BusinessOperationReceipt } from '../../operations.js';
import type { BusinessFlowDependencies } from '../../flows/shared/businessFlow.js';

const actionId = 'native-calculation';
const scope = { tenantId: 'native-tenant', unitId: 'native-unit' };
const context = { ...scope, businessType: 'kids-boutique' as const };
const receipt = (quantity = 1): BusinessOperationReceipt => ({ acknowledgement: 'accepted', output: { quantity }, response: { quantity } });
function service(options: () => NativeBusinessFlowOptions, host = vi.fn()) {
  return createBusinessServiceRegistry(undefined, {
    scope, includeResponse: true,
    prepare: async (_action, input) => ({ input, context }),
    operations: { [actionId]: host },
    flowRegistry: { [actionId]: { default: dependencies => createNativeBusinessFlow(actionId, dependencies, options()) } },
  });
}
function observation(result: unknown) {
  const { response: _privateResponse, ...safe } = result as Record<string, unknown>;
  return JSON.stringify(safe);
}
function executor(chart: ReturnType<typeof createNativeBusinessFlow>, input: unknown) {
  return new FlowChartExecutor(chart, { initialContext: { input }, scopeFactory: (ctx, name, args, env) => new ScopeFacade(ctx, name, args, env) });
}
describe('optional native business graph composition', () => {
  it('constructs and exports actual native branches/loops without reading a request or running callbacks', () => {
    const get = vi.fn(); const stage = vi.fn(); const complete = vi.fn();
    let child: ReturnType<typeof createNativeBusinessFlow> | undefined;
    const chart = createNativeBusinessFlow(actionId, { requests: { get } }, {
      build: () => child = flowChart<unknown, ScopeFacade>('Initialize', stage, 'initialize')
        .addDeciderFunction('Continue bounded items', () => 'done', 'parts-loop')
        .addFunctionBranch('part', 'Consume one item', stage).loopTo('parts-loop')
        .addFunctionBranch('done', 'Finish', stage).end().build(),
      receipt: complete,
    });
    expect(chart.toMermaid()).toContain('native_business_policy');
    expect(child!.toMermaid()).toContain('parts_loop');
    expect(getNativeBusinessPolicy(chart)).toBe(child);
    expect(getNativeBusinessPolicy(flowChart<unknown, ScopeFacade>('Unrelated chart', stage, 'unrelated').build())).toBeUndefined();
    expect(get).not.toHaveBeenCalled(); expect(stage).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  });
  it('executes real policy branches and bounded loop through the registry, without a host operation', async () => {
    const host = vi.fn(); const fallback = vi.fn(() => receipt(99)); const visited: number[] = [];
    const registry = service(() => {
      let request: NativeBusinessRequest; let values: number[] = []; let total = 0;
      return {
        receipt: fallback,
        build: access => flowChart<unknown, ScopeFacade>('Read private inputs', current => {
          request = access(current); values = request.input.items as number[];
          current.setValue('allowed', request.input.authorized === true); current.setValue('position', 0);
        }, 'initialize-policy')
          .addDeciderFunction('Authorize before work', current => current.getValue('allowed') ? 'allowed' : 'denied', 'authorize-policy')
          .addFunctionBranch('denied', 'Return rejected outcome', (_current, stop) => { request.acknowledge({ acknowledgement: 'accepted', output: { status: 'rejected' }, response: { status: 'rejected' } }); stop(); })
          .addFunctionBranch('allowed', 'Continue authorized work', () => {}).end()
          .addDeciderFunction('Consume bounded values', current => Number(current.getValue('position')) < values.length ? 'part' : 'complete', 'parts-loop')
          .addFunctionBranch('part', 'Add one private value', current => { const index = Number(current.getValue('position')); visited.push(index); total += values[index]!; current.setValue('position', index + 1); }).loopTo('parts-loop')
          .addFunctionBranch('complete', 'Retain authoritative result', (_current, stop) => { request.acknowledge({ acknowledgement: 'accepted', output: { quantity: total }, response: { quantity: total, marker: request.input.secret } }); stop(); }).end().build(),
      };
    }, host);
    const accepted = await registry.executeService(actionId, { authorized: true, items: [2, 3], secret: 'PRIVATE_NATIVE_INPUT' }, context);
    expect(accepted.status).toBe('success'); expect(accepted.result).toEqual({ quantity: 5 }); expect(accepted.observationError).toBeUndefined();
    expect(accepted.response).toEqual({ quantity: 5, marker: 'PRIVATE_NATIVE_INPUT' });
    expect(visited).toEqual([0, 1]); expect(host).not.toHaveBeenCalled();
    expect((accepted.executionSnapshot as { commitLog: { stageId: string }[] }).commitLog.map(row => row.stageId)).toContain('complete-native-receipt');
    expect(observation(accepted)).not.toContain('PRIVATE_NATIVE_INPUT');
    expect(observation(accepted)).toContain('parts-loop'); expect(observation(accepted)).toContain('native-business-policy');
    visited.length = 0;
    const denied = await registry.executeService(actionId, { authorized: false, items: [9], secret: 'PRIVATE_DENIED' }, context);
    expect(denied.status).toBe('success'); expect(denied.response).toEqual({ status: 'rejected' }); expect(visited).toEqual([]); expect(denied.observationError).toBeUndefined();
    expect((denied.executionSnapshot as { commitLog: { stageId: string }[] }).commitLog.map(row => row.stageId)).toContain('complete-native-receipt');
    expect(fallback).not.toHaveBeenCalled();
    expect(observation(denied)).not.toContain('PRIVATE_DENIED');
  });
  it('fails closed when a native child completes without an explicit receipt', async () => {
    const registry = service(() => ({ build: () => flowChart<unknown, ScopeFacade>('Complete without acknowledgement', () => {}, 'no-receipt').build() }));
    const result = await registry.executeService(actionId, {}, context);
    expect(result.status).toBe('error'); expect(result.code).toBe('BUSINESS_RECEIPT_INVALID'); expect(result.acknowledgement).toBeUndefined();
  });
  it('uses an explicit fallback receipt after an early child break, exactly once', async () => {
    const complete = vi.fn(() => receipt(4));
    const registry = service(() => ({ build: () => flowChart<unknown, ScopeFacade>('Stop native child', (_current, stop) => stop(), 'early-stop').build(), receipt: complete }));
    const result = await registry.executeService(actionId, {}, context);
    expect(result.status).toBe('success'); expect(result.result).toEqual({ quantity: 4 }); expect(result.observationError).toBeUndefined(); expect(complete).toHaveBeenCalledTimes(1);
  });
  it('retains a valid acknowledgement when later native execution or observation fails', async () => {
    const fallback = vi.fn(() => receipt(99));
    const registry = service(() => ({
      build: access => flowChart<unknown, ScopeFacade>('Acknowledge known business result', safeNativeStage(actionId, current => {
        access(current).acknowledge(receipt(7)); throw new Error('PRIVATE_PROVIDER_FAILURE_AFTER_ACK');
      }), 'ack-before-failure').build(),
      receipt: fallback,
    }));
    const result = await registry.executeService(actionId, {}, context);
    expect(result.status).toBe('success'); expect(result.result).toEqual({ quantity: 7 }); expect(result.response).toEqual({ quantity: 7 });
    expect(result.observationError).toBe('The operation was acknowledged; subsequent observation failed');
    expect(fallback).not.toHaveBeenCalled(); expect(observation(result)).not.toContain('PRIVATE_PROVIDER_FAILURE_AFTER_ACK');
  });
  it('retains a native acknowledgement when snapshot export fails', async () => {
    const registry = service(() => ({ build: access => flowChart<unknown, ScopeFacade>('Retain known receipt', current => access(current).acknowledge(receipt(6)), 'snapshot-independent-ack').build() }));
    const snapshot = vi.spyOn(FlowChartExecutor.prototype, 'getSnapshot').mockImplementation(() => { throw new Error('PRIVATE_SNAPSHOT_FAILURE'); });
    try {
      const result = await registry.executeService(actionId, {}, context);
      expect(result.status).toBe('success'); expect(result.result).toEqual({ quantity: 6 }); expect(result.response).toEqual({ quantity: 6 });
      expect(result.observationError).toBe('Execution recording is unavailable'); expect(observation(result)).not.toContain('PRIVATE_SNAPSHOT_FAILURE');
    } finally { snapshot.mockRestore(); }
  });
  it('rejects duplicate acknowledgement without replacing the first receipt', async () => {
    const registry = service(() => ({ build: access => flowChart<unknown, ScopeFacade>('Acknowledge once', current => {
      const request = access(current); request.acknowledge(receipt(2)); request.acknowledge(receipt(8));
    }, 'duplicate-ack').build() }));
    const result = await registry.executeService(actionId, {}, context);
    expect(result.status).toBe('success'); expect(result.result).toEqual({ quantity: 2 }); expect(result.observationError).toBeTruthy();
  });
  it('captures acknowledgement and safe output before caller mutation, retaining private response identity', async () => {
    const value = receipt(3); const privateResponse = value.response;
    const registry = service(() => ({ build: access => flowChart<unknown, ScopeFacade>('Capture receipt', current => {
      access(current).acknowledge(value);
      (value as { acknowledgement: string }).acknowledgement = 'invalid';
      (value.output as Record<string, unknown>).quantity = 100;
      (value.output as Record<string, unknown>).response = 'PRIVATE_RAW_FIELD';
    }, 'capture-receipt').build() }));
    const result = await registry.executeService(actionId, {}, context);
    expect(result.status).toBe('success'); expect(result.acknowledgement).toBe('accepted'); expect(result.result).toEqual({ quantity: 3 });
    expect(result.response).toBe(privateResponse); expect(observation(result)).not.toContain('PRIVATE_RAW_FIELD');
  });
  it('expires retained request acknowledgement methods after registry cleanup', async () => {
    let retained: NativeBusinessRequest | undefined;
    const registry = service(() => ({ build: access => flowChart<unknown, ScopeFacade>('Retain private view', current => { retained = access(current); retained.acknowledge(receipt()); }, 'retain-view').build() }));
    expect((await registry.executeService(actionId, {}, context)).status).toBe('success');
    expect(() => retained!.acknowledge(receipt(9))).toThrow('operation input is invalid');
  });
  it('keeps concurrent and repeated requests independent', async () => {
    const registry = service(() => {
      let privateValue: number; let request: NativeBusinessRequest;
      return { build: access => flowChart<unknown, ScopeFacade>('Capture per-request data', async current => {
        request = access(current); privateValue = Number(request.input.quantity); await Promise.resolve();
      }, 'capture-request').addFunction('Finish same request', () => request.acknowledge(receipt(privateValue)), 'finish-request').build() };
    });
    const first = await Promise.all([2, 9].map(quantity => registry.executeService(actionId, { quantity }, context)));
    expect(first.map(result => result.result?.quantity)).toEqual([2, 9]);
    expect((await registry.executeService(actionId, { quantity: 5 }, context)).result).toEqual({ quantity: 5 });
  });
  it('refuses absent or malformed registry-private requests before native business stages', async () => {
    const stage = vi.fn();
    for (const input of [{}, { requestRef: 'absent' }]) {
      const chart = createNativeBusinessFlow(actionId, { requests: { get: () => undefined } }, { build: () => flowChart<unknown, ScopeFacade>('Never run', stage, 'unreachable').build(), receipt: () => receipt() });
      await expect(executor(chart, input).run()).rejects.toThrow('operation input is invalid');
    }
    const dependencies = { requests: { get: () => ({ input: new Date(), context }) } } as unknown as BusinessFlowDependencies;
    const malformed = createNativeBusinessFlow(actionId, dependencies, { build: () => flowChart<unknown, ScopeFacade>('Never run', stage, 'unreachable').build() });
    await expect(executor(malformed, { requestRef: 'bad' }).run()).rejects.toThrow('operation input is invalid');
    expect(stage).not.toHaveBeenCalled();
  });
  it('preserves scope/prepare admission before native callbacks', async () => {
    const stage = vi.fn(); const registry = service(() => ({ build: () => flowChart<unknown, ScopeFacade>('Admitted only', stage, 'admitted').build(), receipt: () => receipt() }));
    const result = await registry.executeService(actionId, {}, { ...context, unitId: 'wrong-unit' });
    expect(result.status).toBe('error'); expect(result.code).toBe('BUSINESS_SCOPE_MISMATCH'); expect(stage).not.toHaveBeenCalled();
  });
  it('sanitizes fallback and accessor-backed receipt failures before recording them', async () => {
    const secret = 'PRIVATE_RECEIPT_GETTER_OR_PROVIDER_ERROR';
    for (const failure of ['fallback', 'getter', 'invalid'] as const) {
      const registry = service(() => ({
        build: access => flowChart<unknown, ScopeFacade>('Read trusted receipt', current => {
          if (failure === 'getter') access(current).acknowledge({ acknowledgement: 'accepted', get output() { throw new Error(secret); } });
          if (failure === 'invalid') access(current).acknowledge({ acknowledgement: 'not-valid', output: {} } as unknown as BusinessOperationReceipt);
        }, 'receipt-input').build(),
        receipt: () => { throw new Error(secret); },
      }));
      const result = await registry.executeService(actionId, {}, context);
      expect(result.status).toBe('error'); expect(result.acknowledgement).toBeUndefined(); expect(observation(result)).not.toContain(secret);
    }
  });
  it('sanitizes synchronous and asynchronous native failures while preserving return values', async () => {
    expect(safeNativeStage(actionId, (value: number) => value + 1)(2)).toBe(3);
    expect(safeNativeStage(actionId, () => 'allowed')()).toBe('allowed');
    expect(await safeNativeStage(actionId, async () => 4)()).toBe(4);
    const then = vi.fn(); const thenable = { then };
    expect(safeNativeStage(actionId, () => thenable)()).toBe(thenable); expect(then).not.toHaveBeenCalled();
    expect(() => safeNativeStage(actionId, () => { throw new Error('PRIVATE_SYNC'); })()).toThrow('temporarily unavailable');
    await expect(safeNativeStage(actionId, async () => { throw new Error('PRIVATE_ASYNC'); })()).rejects.toThrow('temporarily unavailable');
    expect(() => safeNativeStage('customer@example.test', () => 1)).toThrow('stable action ID');
    expect(() => createNativeBusinessFlow(undefined as unknown as string, { requests: { get: () => undefined } }, { build: () => flowChart<unknown, ScopeFacade>('Noop', () => {}, 'noop').build() })).toThrow('stable action ID');
  });
});
