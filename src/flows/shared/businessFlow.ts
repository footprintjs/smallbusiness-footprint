import { flowChart } from 'footprintjs';
import type { FlowChart } from 'footprintjs';
import type { ScopeFacade } from 'footprintjs/advanced';
import { BusinessOperationError, safeBusinessOutput, validateBusinessReceipt, safeBusinessFailure } from '../../operations.js';
import type { BusinessOperation, BusinessOperationContext, BusinessOperationReceipt } from '../../operations.js';
export type BusinessRequest = { input: Record<string, unknown>; context: BusinessOperationContext; receipt?: BusinessOperationReceipt };
export type BusinessRequestStore = { get(ref: string): BusinessRequest | undefined };
export type BusinessFlowDependencies = { operation?: BusinessOperation; requests: BusinessRequestStore };
export type BusinessFlowChart = FlowChart<unknown, ScopeFacade>;
export function createBusinessOperationFlow(actionId: string, dependencies: BusinessFlowDependencies, description = actionId): BusinessFlowChart {
  const request = (scope: ScopeFacade) => {
    const input = scope.getValue('input') as { requestRef?: string } | undefined;
    const ctx = input?.requestRef ? dependencies.requests.get(input.requestRef) : undefined;
    if (!ctx) throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'A private validated request is required');
    return ctx;
  };
  return flowChart<unknown, ScopeFacade>('Validate-Command', async scope => {
    scope.useRedactionPolicy({ keys: ['input'], patterns: [/email|token|shipping|password|secret|response|url/i] });
    request(scope);
    if (!dependencies.operation) throw new BusinessOperationError('BUSINESS_UNSUPPORTED', `No authoritative implementation is configured for ${actionId}`);
    scope.setValue('actionId', actionId);
  }, 'validate-command', { description })
    .addFunction('Execute-Operation', async scope => {
      const ctx = request(scope);
      try { ctx.receipt = validateBusinessReceipt(await dependencies.operation!(ctx.input, ctx.context)); }
      catch (error) { throw safeBusinessFailure(error, actionId); }
      scope.setValue('acknowledgement', ctx.receipt.acknowledgement);
    }, 'execute-operation', 'Invoke the configured authoritative application operation')
    .addFunction('Build-Output', async scope => {
      const ctx = request(scope); if (!ctx.receipt) throw new BusinessOperationError('BUSINESS_RECEIPT_INVALID', 'Missing operation acknowledgement');
      scope.setValue('output', safeBusinessOutput(ctx.receipt.output));
    }, 'build-output', 'Expose safe IDs and acknowledgement, keeping response data request-local')
    .build();
}
