/** Optional native-flow composition. The default business runtime does not import this entry. */
import { flowChart } from 'footprintjs';
import type { ScopeFacade } from 'footprintjs/advanced';
import { BusinessOperationError, safeBusinessFailure, safeBusinessOutput, validateBusinessReceipt } from './operations.js';
import type { BusinessOperationContext, BusinessOperationReceipt } from './operations.js';
import type { BusinessFlowChart, BusinessFlowDependencies, BusinessRequest } from './flows/shared/businessFlow.js';

export { flowChart } from 'footprintjs';
export { ScopeFacade } from 'footprintjs/advanced';
export type { FlowChart } from 'footprintjs';
export type { BusinessFlowChart, BusinessFlowDependencies } from './flows/shared/businessFlow.js';

/** A request-local view. Never put this view, its input or its functions into recorded scope. */
export type NativeBusinessRequest = {
  readonly input: Readonly<Record<string, unknown>>;
  readonly context: BusinessOperationContext;
  /** Retain an explicit authoritative receipt before subsequent observation can fail. */
  readonly acknowledge: (receipt: BusinessOperationReceipt) => void;
};
export type NativeBusinessRequestAccessor = (scope: ScopeFacade) => NativeBusinessRequest;
export type NativeBusinessFlowOptions = {
  /** Construction only. Actual business decisions/loops belong in this native child chart. */
  readonly build: (request: NativeBusinessRequestAccessor) => BusinessFlowChart;
  /** Optional explicit fallback for charts that have not acknowledged from a terminal stage. */
  readonly receipt?: (scope: ScopeFacade, request: NativeBusinessRequestAccessor) => BusinessOperationReceipt | Promise<BusinessOperationReceipt>;
  readonly description?: string;
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const invalidRequest = (): never => { throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'A private validated native-flow request is required'); };
const action = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value);
const nativePolicies = new WeakMap<BusinessFlowChart, BusinessFlowChart>();

/** Return the exact mounted policy chart for explicit hierarchical navigation; no callbacks are executed. */
export function getNativeBusinessPolicy(chart: BusinessFlowChart): BusinessFlowChart | undefined {
  return nativePolicies.get(chart);
}

/** Preserve callback values/branches while replacing thrown failures before the executor records them. */
export function safeNativeStage<Args extends unknown[], Result>(actionId: string, handler: (...args: Args) => Result): (...args: Args) => Result {
  if (!action(actionId) || typeof handler !== 'function') throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'A stable action ID and trusted native callback are required');
  return (...args: Args): Result => {
    try {
      const value = handler(...args);
      // Match the engine's Promise-only contract; do not invoke arbitrary thenables.
      if (value instanceof Promise) {
        return value.catch(error => { throw safeBusinessFailure(error, actionId); }) as Result;
      }
      return value;
    } catch (error) { throw safeBusinessFailure(error, actionId); }
  };
}

/**
 * Mount an application-owned native graph in the existing service registry.
 * Only an opaque request reference crosses the child input boundary. Receipts
 * remain private until their bounded safe acknowledgement/output is exposed.
 * Arbitrary application callbacks remain trusted code, not a privacy sandbox.
 */
export function createNativeBusinessFlow(actionId: string, dependencies: BusinessFlowDependencies, options: NativeBusinessFlowOptions): BusinessFlowChart {
  if (!action(actionId) || !options || typeof options.build !== 'function' || options.receipt !== undefined && typeof options.receipt !== 'function') {
    throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'Native composition requires a stable action ID and trusted chart builder');
  }
  const resolveInput = (input: unknown): { ref: string; request: BusinessRequest } => {
    if (!record(input) || typeof input.requestRef !== 'string' || !input.requestRef) return invalidRequest();
    const request = dependencies.requests.get(input.requestRef);
    if (!request || !record(request.input) || !record(request.context) || typeof request.context.tenantId !== 'string' || !request.context.tenantId || typeof request.context.unitId !== 'string' || !request.context.unitId || typeof request.context.businessType !== 'string' || !request.context.businessType) return invalidRequest();
    return { ref: input.requestRef, request };
  };
  const resolve = (scope: ScopeFacade) => resolveInput(scope.getValue('input'));
  const acknowledge = safeNativeStage(actionId, (ref: string, request: BusinessRequest, receipt: BusinessOperationReceipt): void => {
    if (dependencies.requests.get(ref) !== request) return invalidRequest();
    if (request.receipt !== undefined) throw new BusinessOperationError('BUSINESS_RECEIPT_INVALID', 'The native request was already acknowledged');
    const value = validateBusinessReceipt(receipt);
    // Snapshot before acceptance, including accessor-backed caller receipts.
    const captured = { acknowledgement: value.acknowledgement, output: value.output, response: value.response };
    validateBusinessReceipt(captured);
    const output = Object.freeze(safeBusinessOutput(captured.output));
    request.receipt = Object.freeze({ acknowledgement: captured.acknowledgement, output, ...(captured.response === undefined ? {} : { response: captured.response }) });
  });
  const access: NativeBusinessRequestAccessor = safeNativeStage(actionId, scope => {
    const { ref, request } = resolve(scope);
    return Object.freeze({ input: request.input, context: request.context, acknowledge: receipt => acknowledge(ref, request, receipt) });
  });
  let child: BusinessFlowChart;
  try { child = options.build(access); } catch (error) { throw safeBusinessFailure(error, actionId); }
  const chart = flowChart<unknown, ScopeFacade>('Validate-Native-Request', safeNativeStage(actionId, scope => {
    scope.useRedactionPolicy({ keys: ['input'], patterns: [/email|token|shipping|password|secret|response|url/i] });
    const { request } = resolve(scope);
    if (request.receipt !== undefined) throw new BusinessOperationError('BUSINESS_RECEIPT_INVALID', 'An acknowledged request cannot start another native graph');
    scope.setValue('actionId', actionId);
  }), 'validate-native-request', { description: options.description ?? actionId })
    .addSubFlowChartNext('native-business-policy', child, 'Execute application-owned native business stages', {
      // Footprint mappers receive a tracked plain root-key view, not the stage facade.
      inputMapper: safeNativeStage(actionId, parent => ({ input: { requestRef: resolveInput((parent as unknown as { input?: unknown }).input).ref } })),
      outputMapper: () => ({}),
    })
    .addFunction('Complete-Native-Receipt', safeNativeStage(actionId, async scope => {
      const { ref, request } = resolve(scope);
      if (request.receipt === undefined) {
        if (!options.receipt) throw new BusinessOperationError('BUSINESS_RECEIPT_INVALID', 'The native graph returned no authoritative receipt');
        const receipt = await options.receipt(scope, access);
        // The fallback may itself use the explicit acknowledge method.
        if (request.receipt === undefined) acknowledge(ref, request, receipt);
      }
      const receipt = validateBusinessReceipt(request.receipt);
      // The private receipt is retained before these observational writes.
      scope.setValue('acknowledgement', receipt.acknowledgement);
      scope.setValue('output', safeBusinessOutput(receipt.output));
    }), 'complete-native-receipt', 'Expose only safe acknowledgement/output after an explicit private receipt')
    .build();
  nativePolicies.set(chart, child);
  return chart;
}
