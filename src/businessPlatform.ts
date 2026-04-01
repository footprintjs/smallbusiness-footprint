import {
  createModuleRegistry,
  createAdapterRegistry,
  createActionRegistry,
  createPlatform,
} from "@footprint/platform";
import type {
  Platform,
  ProfileStore,
  TenantContext,
} from "@footprint/platform";
import { allBusinessModules } from "./modules/index.js";
import { allBusinessProfiles, businessTypeConfigs } from "./profiles/index.js";
import { allBusinessCapabilities } from "./capabilities/index.js";
import {
  createFulfillmentAdapters,
  createPaymentAdapters,
  createCatalogAdapters,
  createMarketingAdapters,
  createInventoryAdapters,
  businessAdapterMappings,
} from "./adapters/index.js";
import { allBusinessActions } from "./actions/index.js";
import { createBusinessServiceRegistry, buildActionDispatch } from "./flows/index.js";
import type { BusinessServiceRegistry, BusinessServiceResult, ServiceDescription, BuiltServiceFlow, ActionDispatch } from "./flows/index.js";
import type {
  BusinessType,
  BusinessTypeConfig,
  BusinessRepository,
  UnitOverrideStore,
  UnitOverrides,
} from "./types.js";
import { businessTerminology, resolveTerminologyLabel } from "./terminology/businessTerms.js";
import { pluralize } from "./helpers.js";

export type BusinessPlatform = Platform & {
  getBusinessTypeConfig(businessType: BusinessType): BusinessTypeConfig | undefined;
  supportedBusinessTypes(): readonly BusinessType[];
  executeServiceFlow(
    ctx: TenantContext,
    actionId: string,
    input: Record<string, unknown>,
  ): Promise<BusinessServiceResult>;
  buildServiceFlow(
    ctx: TenantContext,
    actionId: string,
    input: Record<string, unknown>,
  ): Promise<BuiltServiceFlow & { input: Record<string, unknown> } | { error: string }>;
  describeService(actionId: string, businessType?: BusinessType): ServiceDescription | undefined;
  describeAllServices(businessType?: BusinessType): readonly ServiceDescription[];
  getUnitOverrides(unitId: string): Promise<UnitOverrides | undefined>;
  getTermResolverWithOverrides(ctx: TenantContext): Promise<(key: string) => string>;
  getFullTermResolver(ctx: TenantContext): Promise<(key: string) => { singular: string; plural: string }>;
  getActionDispatch(
    ctx: TenantContext,
    actionId: string,
    input: Record<string, unknown>,
  ): Promise<ActionDispatch & { input: Record<string, unknown> } | { error: string }>;
  serviceRegistry: BusinessServiceRegistry;
};

export type BusinessPlatformConfig = {
  profileStore: ProfileStore;
  repository: BusinessRepository;
  overrideStore?: UnitOverrideStore;
};

export function createBusinessPlatform(config: BusinessPlatformConfig): BusinessPlatform {
  const registry = createModuleRegistry({
    modules: [...allBusinessModules],
    profileTypes: [...allBusinessProfiles],
  });

  const liveFulfillmentAdapters = createFulfillmentAdapters(config.repository);
  const livePaymentAdapters = createPaymentAdapters(config.repository);
  const liveCatalogAdapters = createCatalogAdapters(config.repository);
  const liveMarketingAdapters = createMarketingAdapters(config.repository);
  const liveInventoryAdapters = createInventoryAdapters(config.repository);

  const adapterRegistry = createAdapterRegistry({
    capabilities: [...allBusinessCapabilities],
    adapters: [...liveFulfillmentAdapters, ...livePaymentAdapters, ...liveCatalogAdapters, ...liveMarketingAdapters, ...liveInventoryAdapters],
    mappings: [...businessAdapterMappings],
  });

  const actionRegistry = createActionRegistry({
    actions: [...allBusinessActions],
  });

  const basePlatform = createPlatform({
    registry,
    profileStore: config.profileStore,
    adapterRegistry,
    actionRegistry,
  });

  const serviceRegistry = createBusinessServiceRegistry(config.repository);

  async function resolveBusinessType(ctx: TenantContext): Promise<BusinessType | undefined> {
    try {
      const unit = await basePlatform.resolveUnit(ctx);
      return unit?.profileType as BusinessType | undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("No profile binding found")) {
        return undefined;
      }
      throw err;
    }
  }

  return {
    ...basePlatform,

    getBusinessTypeConfig(businessType) {
      return businessTypeConfigs[businessType];
    },

    supportedBusinessTypes() {
      return Object.freeze(["kids-boutique", "chocolate-shop"] as const);
    },

    async executeServiceFlow(ctx, actionId, input) {
      const businessType = await resolveBusinessType(ctx);
      if (!businessType) {
        return { status: "error", error: "Could not resolve business type for unit", manifest: [], narrative: [] };
      }

      const gateResult = await basePlatform.gateCheck(ctx, []);
      if (!gateResult.allowed) {
        return { status: "error", error: "Access denied by feature gate", manifest: [], narrative: [] };
      }

      return serviceRegistry.executeService(actionId, input, {
        businessType,
        unitId: ctx.unitId,
        repository: config.repository,
      });
    },

    async buildServiceFlow(ctx, actionId, input) {
      const businessType = await resolveBusinessType(ctx);
      if (!businessType) return { error: "Could not resolve business type for unit" };

      const built = serviceRegistry.buildServiceFlow(actionId, {
        businessType,
        unitId: ctx.unitId,
        repository: config.repository,
      });
      if (!built) return { error: `No flow registered for action: ${actionId}` };
      return { ...built, input };
    },

    describeService(actionId, businessType) {
      return serviceRegistry.describeService(actionId, businessType);
    },

    describeAllServices(businessType) {
      return serviceRegistry.describeAllServices(businessType);
    },

    async getUnitOverrides(unitId) {
      if (!config.overrideStore) return undefined;
      return config.overrideStore.getOverrides(unitId);
    },

    async getTermResolverWithOverrides(ctx) {
      const businessType = await resolveBusinessType(ctx);
      const overrides = config.overrideStore
        ? await config.overrideStore.getOverrides(ctx.unitId)
        : undefined;

      return (key: string) => {
        const termKey = key as keyof typeof businessTerminology;
        const override = overrides?.terminologyOverrides?.[termKey];
        if (override) return override;
        const entry = businessTerminology[termKey];
        if (!entry) return key;
        return (businessType ? entry[businessType] : undefined) ?? entry.default ?? key;
      };
    },

    async getFullTermResolver(ctx) {
      const businessType = await resolveBusinessType(ctx);
      const overrides = config.overrideStore
        ? await config.overrideStore.getOverrides(ctx.unitId)
        : undefined;

      return (key: string) => {
        const termKey = key as keyof typeof businessTerminology;
        const override = overrides?.terminologyOverrides?.[termKey];
        if (override) {
          return { singular: override, plural: pluralize(override) };
        }
        const type = businessType ?? "default";
        return resolveTerminologyLabel(termKey, type);
      };
    },

    async getActionDispatch(ctx, actionId, input) {
      const businessType = await resolveBusinessType(ctx);
      if (!businessType) return { error: "Could not resolve business type for unit" };

      const dispatch = buildActionDispatch(actionId, businessType, config.repository);
      if (!dispatch) return { error: `No dispatch for action: ${actionId}` };
      return { ...dispatch, input };
    },

    serviceRegistry,
  };
}
