import { createModuleRegistry, createActionRegistry, createPlatform, createTenantContext } from '@footprint/platform';
import type { Platform, ProfileStore, TenantContext } from '@footprint/platform';
import { immutableValue, resolveProfileConfig } from '@footprint/features';
import type { ModuleDefinition, ProfileDefinition } from '@footprint/features';
import type { ActionAuthorizer, ActionHandler, TraceRecorder } from '@footprint/actions';
import { allBusinessModules } from './modules/index.js';
import { allBusinessProfiles, toBusinessTypeConfig } from './profiles/index.js';
import { allBusinessActions } from './actions/index.js';
import { createBusinessServiceRegistry, buildActionDispatch } from './flows/index.js';
import type { BusinessServiceRegistry, BusinessServiceResult, ServiceDescription, BuiltServiceFlow, ActionDispatch, ActionFlowRegistry } from './flows/index.js';
import { assertBusinessScope, createBusinessOperations, safeBusinessOutput, validateBusinessReceipt, safeBusinessFailure, BusinessOperationError } from './operations.js';
import type { BusinessScope, BusinessProviders, BusinessOperations } from './operations.js';
import type { BusinessType, BusinessTypeConfig, BusinessRepository, UnitOverrideStore, UnitOverrides } from './types.js';
import { businessTerminology, resolveTerminologyLabel } from './terminology/businessTerms.js';
import { pluralize } from './helpers.js';
export type BusinessPlatform = Platform & {
  getBusinessTypeConfig(type: BusinessType): BusinessTypeConfig | undefined;
  getUnitBusinessConfig(ctx: TenantContext): Promise<BusinessTypeConfig>;
  supportedBusinessTypes(): readonly BusinessType[];
  executeServiceFlow(ctx: TenantContext, actionId: string, input: Record<string, unknown>): Promise<BusinessServiceResult>;
  buildServiceFlow(ctx: TenantContext, actionId: string, input: Record<string, unknown>): Promise<BuiltServiceFlow & { input: Record<string, unknown> } | { error: string }>;
  describeService(actionId: string, type?: BusinessType): ServiceDescription | undefined;
  describeAllServices(type?: BusinessType): readonly ServiceDescription[];
  getUnitOverrides(scope: BusinessScope): Promise<UnitOverrides | undefined>;
  getTermResolverWithOverrides(ctx: TenantContext): Promise<(key: string) => string>;
  getFullTermResolver(ctx: TenantContext): Promise<(key: string) => { singular: string; plural: string }>;
  getActionDispatch(ctx: TenantContext, actionId: string, input: Record<string, unknown>): Promise<ActionDispatch & { input: Record<string, unknown> } | { error: string }>;
  serviceRegistry: BusinessServiceRegistry;
};
/** Omitted arrays use the built-in presets. Supplied arrays replace them; spread defaults to extend. */
export type BusinessDefinitions = { readonly modules?: readonly ModuleDefinition[]; readonly profiles?: readonly ProfileDefinition[] };
export type BusinessPlatformConfig = BusinessDefinitions & { profileStore: ProfileStore; repository?: BusinessRepository; scope?: BusinessScope; overrideStore?: UnitOverrideStore; providers?: BusinessProviders; operations?: BusinessOperations; authorizer?: ActionAuthorizer; flowRegistry?: ActionFlowRegistry; includeResponse?: boolean; traceRecorder?: TraceRecorder; onTraceError?: (error: unknown) => void };
export function createBusinessPlatform(config: BusinessPlatformConfig): BusinessPlatform {
  const scope = config.scope ? Object.freeze({ ...config.scope }) : undefined;
  const registry = createModuleRegistry({ modules: config.modules ?? allBusinessModules, profileTypes: config.profiles ?? allBusinessProfiles });
  if (registry.validate().length) throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'Invalid business module or profile definitions');
  const modules = [...registry.getAllModules().values()];
  const profiles = [...registry.getAllProfiles().values()];
  const businessType = (value: string): BusinessType => { if (!registry.getProfile(value)) throw new BusinessOperationError('BUSINESS_SCOPE_MISMATCH', 'Unknown business profile'); return value; };
  const businessTypeConfigs = new Map(profiles.map(profile => [profile.type, immutableValue(toBusinessTypeConfig(profile))]));
  const termsForType = (type: BusinessType) => {
    const resolved = resolveProfileConfig(registry, businessType(type)).terminology;
    return (key: string) => resolved[key] ?? businessTerminology[key as keyof typeof businessTerminology]?.default ?? key;
  };
  const operations = createBusinessOperations(config.repository, config.providers, config.operations);
  const handlers: Record<string, ActionHandler> = {};
  for (const [actionId, operation] of Object.entries(operations)) if (operation) handlers[actionId] = async (_actionId, input, context) => {
    assertBusinessScope(scope, { tenantId: context.tenantId ?? '', unitId: context.unitId, ...(context.campusId ? { campusId: context.campusId } : {}) });
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'Provide an object command');
    try { const receipt = validateBusinessReceipt(await operation(input as Record<string, unknown>, { ...scope!, businessType: businessType(context.profileType), ...(context.userId ? { userId: context.userId } : {}) })); return { acknowledgement: receipt.acknowledgement, output: safeBusinessOutput(receipt.output) }; }
    catch (error) { throw safeBusinessFailure(error, actionId); }
  };
  const profileStore: ProfileStore = {
    async getBinding(suppliedScope) {
      const scope = createTenantContext(suppliedScope);
      const binding = await config.profileStore.getBinding(scope); if (!binding) return undefined;
      const override = await config.overrideStore?.getOverrides(scope);
      if (!override) return binding;
      if (!Number.isSafeInteger(override.revision) || override.revision < 0 || !Number.isSafeInteger(binding.revision + override.revision)) throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'Invalid unit override revision');
      const profile = registry.getProfile(binding.profileType);
      const enabled = new Set(binding.moduleOverrides ?? profile?.modules ?? []);
      for (const [id, value] of Object.entries(override.moduleToggles ?? {})) {
        if (!registry.getModule(id) || typeof value !== 'boolean') throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'Invalid business module override');
        if (value) enabled.add(id); else enabled.delete(id);
      }
      const disabled = new Set(Object.entries(override.moduleToggles ?? {}).filter(([, value]) => value === false).map(([id]) => id));
      // Explicit disabling takes precedence over transitive dependency expansion.
      let changed = true;
      while (changed) {
        changed = false;
        for (const module of modules) if (enabled.has(module.id) && module.requires.some(id => disabled.has(id))) {
          enabled.delete(module.id); disabled.add(module.id); changed = true;
        }
      }
      return { ...binding, revision: binding.revision + override.revision, moduleOverrides: [...enabled].sort() };
    },
  };
  const basePlatform = createPlatform({ registry, profileStore, actionRegistry: createActionRegistry({ actions: [...allBusinessActions] }), handlers, authorizer: config.authorizer ?? (() => false), traceRecorder: config.traceRecorder, onTraceError: config.onTraceError });
  const serviceRegistry = createBusinessServiceRegistry(config.repository, {
    scope: scope, providers: config.providers, operations: config.operations, flowRegistry: config.flowRegistry, includeResponse: config.includeResponse, termsForType,
    prepare: async (actionId, input, context) => {
      const prepared = await basePlatform.prepareAction({ tenantId: context.tenantId, unitId: context.unitId, ...(context.campusId ? { campusId: context.campusId } : {}), ...(context.userId ? { userId: context.userId } : {}) }, actionId, input);
      return { input: prepared.input as Record<string, unknown>, context: { tenantId: prepared.context.tenantId!, unitId: prepared.context.unitId, ...(prepared.context.campusId ? { campusId: prepared.context.campusId } : {}), ...(prepared.context.userId ? { userId: prepared.context.userId } : {}), businessType: businessType(prepared.context.profileType) } };
    },
  });
  return {
    ...basePlatform,
    async resolveUnit(ctx) { assertBusinessScope(scope, ctx); return basePlatform.resolveUnit(ctx); },
    async setupUnit(ctx) { assertBusinessScope(scope, ctx); return basePlatform.setupUnit(ctx); },
    async gateCheck(ctx, required) { assertBusinessScope(scope, ctx); return basePlatform.gateCheck(ctx, required); },
    async getTermResolver(ctx) { assertBusinessScope(scope, ctx); return basePlatform.getTermResolver(ctx); },
    async getAvailableActions(ctx) { assertBusinessScope(scope, ctx); return basePlatform.getAvailableActions(ctx); },
    async prepareAction(ctx, actionId, input) { assertBusinessScope(scope, ctx); return basePlatform.prepareAction(ctx, actionId, input); },
    async executeAction(ctx, actionId, input) { assertBusinessScope(scope, ctx); return basePlatform.executeAction(ctx, actionId, input); },
    invalidateProfile(ctx) { assertBusinessScope(scope, ctx); basePlatform.invalidateProfile(ctx); },
    getBusinessTypeConfig(type) { const value = businessTypeConfigs.get(type); return value ? structuredClone(value) : undefined; },
    supportedBusinessTypes: () => registry.profileTypeIds(),
    async getUnitBusinessConfig(suppliedContext) {
      assertBusinessScope(scope, suppliedContext);
      const ctx = createTenantContext(suppliedContext);
      const unit = await basePlatform.resolveUnit(ctx);
      const base = structuredClone(businessTypeConfigs.get(businessType(unit.profileType))!);
      const override = await config.overrideStore?.getOverrides(ctx);
      return { ...base, services: Object.fromEntries(Object.keys(base.services).map(id => [id, unit.config.modules.has(id)])) as BusinessTypeConfig['services'], theme: { ...base.theme, ...override?.themeOverrides } };
    },
    async executeServiceFlow(suppliedContext, actionId, suppliedInput) {
      try { const ctx = createTenantContext(suppliedContext); const input = immutableValue(suppliedInput); assertBusinessScope(scope, ctx); const unit = await basePlatform.resolveUnit(ctx); return serviceRegistry.executeService(actionId, input, { ...ctx, businessType: businessType(unit.profileType), repository: config.repository }); }
      catch (error) { return { status: 'error', error: error instanceof BusinessOperationError ? safeBusinessFailure(error, actionId).message : 'Could not resolve business type for unit', code: error instanceof BusinessOperationError ? error.code : 'BUSINESS_SCOPE_MISMATCH', manifest: [], narrative: [] }; }
    },
    async buildServiceFlow(suppliedContext, actionId, suppliedInput) {
      try { const ctx = createTenantContext(suppliedContext); const input = immutableValue(suppliedInput); assertBusinessScope(scope, ctx); const prepared = await basePlatform.prepareAction(ctx, actionId, input); const built = serviceRegistry.buildServiceFlow(actionId, { ...ctx, businessType: businessType(prepared.context.profileType), repository: config.repository }); return built ? { ...built, input: {} } : { error: 'No configured service flow' }; }
      catch { return { error: 'Action authorization or input validation failed' }; }
    },
    describeService: (action, type) => serviceRegistry.describeService(action, type), describeAllServices: type => serviceRegistry.describeAllServices(type),
    async getUnitOverrides(requestedScope) { const ctx = createTenantContext(requestedScope); assertBusinessScope(scope, ctx); return immutableValue(await config.overrideStore?.getOverrides(ctx)); },
    async getTermResolverWithOverrides(suppliedContext) {
      assertBusinessScope(scope, suppliedContext);
      const ctx = createTenantContext(suppliedContext);
      const unit = await basePlatform.resolveUnit(ctx); businessType(unit.profileType); const overrides = immutableValue(await config.overrideStore?.getOverrides(ctx));
      return key => overrides?.terminologyOverrides?.[key] ?? unit.config.terminology[key] ?? businessTerminology[key as keyof typeof businessTerminology]?.default ?? key;
    },
    async getFullTermResolver(suppliedContext) {
      assertBusinessScope(scope, suppliedContext);
      const ctx = createTenantContext(suppliedContext);
      const unit = await basePlatform.resolveUnit(ctx); const type = businessType(unit.profileType); const overrides = immutableValue(await config.overrideStore?.getOverrides(ctx));
      return key => {
        const baseline = resolveTerminologyLabel(key as keyof typeof businessTerminology, type);
        const singular = overrides?.terminologyOverrides?.[key] ?? unit.config.terminology[key] ?? baseline.singular;
        return singular === baseline.singular ? { ...baseline } : { singular, plural: pluralize(singular) };
      };
    },
    async getActionDispatch(suppliedContext, actionId, suppliedInput) {
      try { const ctx = createTenantContext(suppliedContext); const input = immutableValue(suppliedInput); assertBusinessScope(scope, ctx); const prepared = await basePlatform.prepareAction(ctx, actionId, input); const dispatch = buildActionDispatch(actionId, businessType(prepared.context.profileType), { requests: { get: () => undefined }, operation: operations[actionId] }, config.flowRegistry, termsForType); return dispatch ? { ...dispatch, input: {} } : { error: 'No configured action dispatch' }; }
      catch { return { error: 'Action authorization or input validation failed' }; }
    },
    serviceRegistry,
  };
}
