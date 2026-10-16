import { randomUUID } from 'node:crypto';
import { createTenantContext } from 'footprint-blueprint/tenancy';
import { immutableValue } from 'footprint-blueprint/features';
import { FlowChartExecutor, ManifestFlowRecorder } from 'footprintjs';
import { ScopeFacade } from 'footprintjs/advanced';
import type { BusinessRepository, BusinessFlowContext, BusinessType } from '../types.js';
import { businessTerminology } from '../terminology/businessTerms.js';
import { assertBusinessScope, BusinessOperationError, createBusinessOperations, safeBusinessOutput, validateBusinessReceipt, safeBusinessFailure } from '../operations.js';
import type { BusinessOperations, BusinessProviders, BusinessScope, BusinessOperationContext, BusinessAcknowledgement } from '../operations.js';
import { createBusinessOperationFlow } from './shared/businessFlow.js';
import type { BusinessFlowChart, BusinessFlowDependencies, BusinessRequest } from './shared/businessFlow.js';
import { createProductCreateFlow } from './catalog/productCreateFlow.js';
import { createProductUpdateFlow } from './catalog/productUpdateFlow.js';
import { createOrderCreateFlow } from './orders/orderCreateFlow.js';
import { createSubscriberCreateFlow } from './subscribers/subscriberCreateFlow.js';
import { createSubscriberUnsubscribeFlow } from './subscribers/subscriberUnsubscribeFlow.js';
import { createCampaignCreateFlow } from './campaigns/campaignCreateFlow.js';
import { createCampaignScheduleFlow } from './campaigns/campaignScheduleFlow.js';
import { createCampaignSendBatchFlow } from './campaigns/campaignSendBatchFlow.js';
export type FlowBuilder = (dependencies: BusinessFlowDependencies, terms?: (key: string) => string) => BusinessFlowChart;
export type ActionFlowEntry = { readonly default: FlowBuilder; readonly variants?: Partial<Readonly<Record<BusinessType, FlowBuilder>>> };
export type ActionFlowRegistry = Readonly<Record<string, ActionFlowEntry>>;
const extra = (actionId: string): FlowBuilder => (dependencies, terms) => createBusinessOperationFlow(actionId, dependencies, `${actionId}: ${terms?.('storefront') ?? 'business operation'}`);
const DEFAULT_FLOWS: ActionFlowRegistry = {
  'create-product': { default: createProductCreateFlow }, 'update-product': { default: createProductUpdateFlow }, 'archive-product': { default: extra('archive-product') },
  'create-order': { default: createOrderCreateFlow }, 'process-payment': { default: extra('process-payment') },
  'create-subscriber': { default: createSubscriberCreateFlow }, unsubscribe: { default: createSubscriberUnsubscribeFlow },
  'create-campaign': { default: createCampaignCreateFlow }, 'schedule-campaign': { default: createCampaignScheduleFlow }, 'send-campaign-batch': { default: createCampaignSendBatchFlow },
  'update-stock': { default: extra('update-stock') }, 'publish-storefront': { default: extra('publish-storefront') },
};
export function resolveFlowBuilder(actionId: string, businessType?: BusinessType, registry: ActionFlowRegistry = DEFAULT_FLOWS): FlowBuilder | undefined { const entry = Object.hasOwn(registry, actionId) ? registry[actionId] : undefined; return businessType ? entry?.variants?.[businessType] ?? entry?.default : entry?.default; }
export function resolveActionBranchId(actionId: string, businessType?: BusinessType, registry: ActionFlowRegistry = DEFAULT_FLOWS) { return businessType && registry[actionId]?.variants?.[businessType] ? `${actionId}:${businessType}` : actionId; }
export function getRegisteredActionIds(registry: ActionFlowRegistry = DEFAULT_FLOWS) { return Object.freeze(Object.keys(registry)); }
export function getActionFlowEntry(actionId: string, registry: ActionFlowRegistry = DEFAULT_FLOWS) { return Object.hasOwn(registry, actionId) ? registry[actionId] : undefined; }
export type ActionBranch = { readonly resolver: () => BusinessFlowChart; readonly mountOptions?: { inputMapper: (scope: unknown) => unknown } };
export type ActionDispatch = { readonly actionId: string; readonly deciderFn: () => string; readonly branches: ReadonlyMap<string, ActionBranch>; readonly input: Record<string, unknown>; readonly meta: { resolvedBusinessType: BusinessType; availableVariants: readonly string[]; selectedBranch: string; description: string } };
const terminology = (type: BusinessType) => (key: string) => { const item = businessTerminology[key as keyof typeof businessTerminology]; return item?.[type] ?? item?.default ?? key; };
export type BusinessTermResolver = (type: BusinessType) => (key: string) => string;
export function buildActionDispatch(actionId: string, type: BusinessType, dependencies: BusinessFlowDependencies, registry: ActionFlowRegistry = DEFAULT_FLOWS, termsForType: BusinessTermResolver = terminology): ActionDispatch | undefined {
  const entry = getActionFlowEntry(actionId, registry); if (!entry) return undefined;
  const branches = new Map<string, ActionBranch>(); branches.set(actionId, { resolver: () => entry.default(dependencies, termsForType(type)) });
  for (const [variant, builder] of Object.entries(entry.variants ?? {})) if (builder) branches.set(`${actionId}:${variant}`, { resolver: () => builder(dependencies, termsForType(variant)) });
  const selectedBranch = resolveActionBranchId(actionId, type, registry);
  return { actionId, deciderFn: () => selectedBranch, branches, input: {}, meta: { resolvedBusinessType: type, availableVariants: [...branches.keys()], selectedBranch, description: `Select ${actionId} for ${type}` } };
}
export type ServiceDescription = { readonly actionId: string; readonly description: string; readonly stages: readonly { name: string; id: string; description: string }[] };
export type BuiltServiceFlow = { readonly flow: BusinessFlowChart; readonly flowMeta: { flowId: string; description: string; stageDescriptions: Record<string, string>; buildTimeStructure: unknown } };
export type BusinessServiceResult = { readonly status: 'success' | 'error'; readonly acknowledgement?: BusinessAcknowledgement; readonly observationError?: string; readonly result?: Record<string, unknown>; readonly error?: string; readonly code?: string; readonly manifest: ReturnType<ManifestFlowRecorder['getManifest']>; readonly narrative: readonly string[]; readonly flowMeta?: BuiltServiceFlow['flowMeta'] & { snapshot?: Record<string, unknown> }; readonly executionSnapshot?: unknown; readonly response?: unknown };
export type PreparedBusinessOperation = { input: Record<string, unknown>; context: BusinessOperationContext };
export type BusinessServiceOptions = { readonly scope?: BusinessScope; readonly providers?: BusinessProviders; readonly operations?: BusinessOperations; readonly flowRegistry?: ActionFlowRegistry; readonly termsForType?: BusinessTermResolver; readonly prepare?: (actionId: string, input: Record<string, unknown>, context: BusinessFlowContext) => Promise<PreparedBusinessOperation>; readonly includeResponse?: boolean };
export type BusinessServiceRegistry = { getFlow(actionId: string): BusinessFlowChart | undefined; getTypedFlow(actionId: string, type: BusinessType): BusinessFlowChart | undefined; serviceIds(): readonly string[]; executeService(actionId: string, input: Record<string, unknown>, context: BusinessFlowContext): Promise<BusinessServiceResult>; buildServiceFlow(actionId: string, context: BusinessFlowContext): BuiltServiceFlow | undefined; describeService(actionId: string, type?: BusinessType): ServiceDescription | undefined; describeAllServices(type?: BusinessType): readonly ServiceDescription[] };
export function createBusinessServiceRegistry(repo: BusinessRepository | undefined, options: BusinessServiceOptions = {}): BusinessServiceRegistry {
  const scope = options.scope ? Object.freeze({ ...options.scope }) : undefined;
  const includeResponse = options.includeResponse === true;
  const termsForType = options.termsForType ?? terminology;
  const operations = createBusinessOperations(repo, options.providers, options.operations); const registry = { ...DEFAULT_FLOWS, ...options.flowRegistry };
  const requests = new Map<string, BusinessRequest>(); const dependencies = (action: string) => ({ requests, operation: Object.hasOwn(operations, action) ? operations[action] : undefined });
  const build = (action: string, type?: BusinessType) => resolveFlowBuilder(action, type, registry)?.(dependencies(action), type ? termsForType(type) : undefined);
  const meta = (flow: BusinessFlowChart, flowId: string) => ({ flowId, description: flow.description, stageDescriptions: Object.fromEntries(flow.stageDescriptions), buildTimeStructure: flow.buildTimeStructure });
  const describe = (action: string, type?: BusinessType) => { const flow = build(action, type); return flow ? { actionId: action, description: flow.description, stages: [...flow.stageDescriptions].map(([id, description]) => ({ name: id, id, description })) } : undefined; };
  return {
    getFlow: action => build(action), getTypedFlow: (action, type) => build(action, type), serviceIds: () => getRegisteredActionIds(registry),
    buildServiceFlow(action, context) { const flow = build(action, context.businessType); return flow ? { flow, flowMeta: meta(flow, action) } : undefined; },
    describeService: describe, describeAllServices: type => getRegisteredActionIds(registry).flatMap(action => { const value = describe(action, type); return value ? [value] : []; }),
    async executeService(action, suppliedInput, suppliedContext) {
      let context: BusinessFlowContext;
      let input: Record<string, unknown>;
      try {
        context = Object.freeze({ ...createTenantContext(suppliedContext), businessType: suppliedContext.businessType, repository: suppliedContext.repository });
        input = immutableValue(suppliedInput);
      } catch { return { status: 'error', code: 'BUSINESS_INPUT_INVALID', error: 'The operation input or context is invalid', manifest: [], narrative: [] }; }
      if (!resolveFlowBuilder(action, context.businessType, registry)) return { status: 'error', error: `No service flow registered for action: ${action}`, code: 'BUSINESS_UNSUPPORTED', manifest: [], narrative: [] };
      let prepared: PreparedBusinessOperation;
      try { assertBusinessScope(scope, context); if (!options.prepare) throw new BusinessOperationError('BUSINESS_UNSUPPORTED', 'A trusted authorization and validation boundary is required'); prepared = await options.prepare(action, input, context); assertBusinessScope(scope, prepared.context); }
      catch (error) { return { status: 'error', error: error instanceof BusinessOperationError ? safeBusinessFailure(error, action).message : 'Action authorization or input validation failed', code: error instanceof BusinessOperationError ? error.code : 'BUSINESS_INPUT_INVALID', manifest: [], narrative: [] }; }
      const ref = randomUUID(); const request: BusinessRequest = { input: structuredClone(prepared.input), context: Object.freeze({ ...prepared.context }) }; requests.set(ref, request);
      const flow = build(action, prepared.context.businessType)!; const manifest = new ManifestFlowRecorder();
      const executor = new FlowChartExecutor(flow, { initialContext: { input: { requestRef: ref } }, scopeFactory: (ctx, name, args, env) => new ScopeFacade(ctx, name, args, env), readTracking: 'summary', writeTracking: 'summary', commitValues: 'full' });
      executor.enableNarrative(); executor.attachFlowRecorder(manifest); executor.setRedactionPolicy({ keys: ['input'], patterns: [/email|token|shipping|secret|password|response|url/i] });
      const observed = () => {
        // Export/recording is observational: it must not erase a provider's acknowledgement.
        try { return { manifest: manifest.getManifest(), narrative: executor.getNarrativeEntries().map(entry => entry.text), executionSnapshot: executor.getSnapshot({ redact: true }) }; }
        catch { return { manifest: [], narrative: [], observationError: 'Execution recording is unavailable' }; }
      };
      const acknowledged = (observationError?: string): BusinessServiceResult => {
        const receipt = validateBusinessReceipt(request.receipt);
        const output = safeBusinessOutput(receipt.output);
        return { status: 'success', acknowledgement: receipt.acknowledgement, result: output, ...observed(), ...(observationError ? { observationError } : {}), flowMeta: { ...meta(flow, action), snapshot: { output } }, ...(includeResponse && receipt.response !== undefined ? { response: receipt.response } : {}) };
      };
      try { await executor.run(); return acknowledged(); }
      catch (error) {
        if (request.receipt) {
          try { return acknowledged('The operation was acknowledged; subsequent observation failed'); }
          catch { /* An invalid receipt never authorizes a success result. */ }
        }
        return { status: 'error', code: error instanceof BusinessOperationError ? error.code : 'BUSINESS_OPERATION_FAILED', error: safeBusinessFailure(error, action).message, ...observed(), flowMeta: meta(flow, action) };
      }
      finally { requests.delete(ref); }
    },
  };
}
