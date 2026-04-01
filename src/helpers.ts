/**
 * Shared helper functions for consuming smallbusiness-footprint.
 * All config/terminology getters return deep copies to prevent mutation.
 */
import { businessTypeConfigs, allBusinessProfiles } from "./profiles/index.js";
import { allBusinessModules } from "./modules/index.js";
import { businessTerminologyFull } from "./terminology/businessTerms.js";
import {
  createBusinessPlatform,
  type BusinessPlatform,
} from "./businessPlatform.js";
import { createMemoryProfileStore, createTenantContext, createModuleRegistry } from "@footprint/platform";
import type { TenantContext, ModuleRegistry } from "@footprint/platform";
import type {
  BusinessType,
  BusinessTypeConfig,
  TerminologyLabel,
  BusinessRepository,
} from "./types.js";
import type { BusinessServiceResult } from "./flows/businessServiceComposer.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BUSINESS_TYPES_LIST = Object.freeze(
  ["kids-boutique", "chocolate-shop"] as const,
);

// ---------------------------------------------------------------------------
// Module registry singleton
// ---------------------------------------------------------------------------

let _businessModuleRegistry: ModuleRegistry | null = null;

export function getBusinessModuleRegistry(): ModuleRegistry {
  if (!_businessModuleRegistry) {
    _businessModuleRegistry = createModuleRegistry({
      modules: [...allBusinessModules],
      profileTypes: [...allBusinessProfiles],
    });
  }
  return _businessModuleRegistry;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isValidBusinessType(type: string): type is BusinessType {
  return (BUSINESS_TYPES_LIST as readonly string[]).includes(type);
}

// ---------------------------------------------------------------------------
// Config getters (deep copy)
// ---------------------------------------------------------------------------

export function getAllBusinessTypeConfigs(): Record<string, BusinessTypeConfig> {
  const result: Record<string, BusinessTypeConfig> = {};
  for (const [key, config] of Object.entries(businessTypeConfigs)) {
    result[key] = { ...config, services: { ...config.services }, theme: { ...config.theme } };
  }
  return result;
}

export function getBusinessTypeConfig(businessType: string): BusinessTypeConfig | undefined {
  if (!Object.hasOwn(businessTypeConfigs, businessType)) return undefined;
  const config = businessTypeConfigs[businessType as BusinessType];
  return { ...config, services: { ...config.services }, theme: { ...config.theme } };
}

export function getAllBusinessProfiles() {
  return allBusinessProfiles.map((p) => ({ ...p }));
}

// ---------------------------------------------------------------------------
// Terminology getters (deep copy)
// ---------------------------------------------------------------------------

export function resolveBusinessTerminology(businessType: string): Record<string, TerminologyLabel> {
  const terms = Object.hasOwn(businessTerminologyFull, businessType)
    ? businessTerminologyFull[businessType]
    : businessTerminologyFull.default;
  const copy: Record<string, TerminologyLabel> = {};
  for (const [key, label] of Object.entries(terms)) {
    copy[key] = { singular: label.singular, plural: label.plural };
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Pluralization
// ---------------------------------------------------------------------------

const IRREGULAR_PLURALS: Record<string, string> = {
  "Variety": "Varieties",
  "Delivery": "Deliveries",
  "Stock": "Stock",
  "Inventory": "Inventory",
};

export function pluralize(singular: string): string {
  if (Object.hasOwn(IRREGULAR_PLURALS, singular)) return IRREGULAR_PLURALS[singular];
  if (singular.endsWith("y") && !/[aeiou]y$/i.test(singular)) {
    return singular.slice(0, -1) + "ies";
  }
  if (singular.endsWith("s") || singular.endsWith("sh") || singular.endsWith("ch") || singular.endsWith("x") || singular.endsWith("z")) {
    return singular + "es";
  }
  return singular + "s";
}

// ---------------------------------------------------------------------------
// Stub repository
// ---------------------------------------------------------------------------

export function createStubRepository(serviceName: string = "this service"): BusinessRepository {
  const stub = () => {
    throw new Error(`${serviceName} does not execute data flows`);
  };
  return {
    createProduct: stub as any,
    updateProduct: stub as any,
    getProduct: stub as any,
    listProducts: stub as any,
    archiveProduct: stub as any,
    createOrder: stub as any,
    getOrder: stub as any,
    updateOrderStatus: stub as any,
    listOrders: stub as any,
    getSubscriber: stub as any,
    upsertSubscriber: stub as any,
    unsubscribeByToken: stub as any,
    listSubscribers: stub as any,
    createCampaign: stub as any,
    updateCampaign: stub as any,
    recordSendResult: stub as any,
    deleteCampaign: stub as any,
    getCampaign: stub as any,
    listCampaigns: stub as any,
    getInventory: stub as any,
    updateStock: stub as any,
  };
}

// ---------------------------------------------------------------------------
// Platform factories
// ---------------------------------------------------------------------------

export function createConfigPlatform(businessType: BusinessType, unitId: string): BusinessPlatform {
  const profileStore = createMemoryProfileStore([
    { unitId, profileType: businessType, createdAt: new Date().toISOString() },
  ]);
  return createBusinessPlatform({ profileStore, repository: createStubRepository() });
}

export function createPlatformForRequest(opts: {
  businessType: BusinessType;
  unitId: string;
  repository: BusinessRepository;
  userId?: string;
}): { platform: BusinessPlatform; ctx: TenantContext } {
  const profileStore = createMemoryProfileStore([
    { unitId: opts.unitId, profileType: opts.businessType, createdAt: new Date().toISOString() },
  ]);
  const platform = createBusinessPlatform({ profileStore, repository: opts.repository });
  const ctx = createTenantContext({
    tenantId: opts.unitId,
    unitId: opts.unitId,
    userId: opts.userId,
  });
  return { platform, ctx };
}

// ---------------------------------------------------------------------------
// Flow error helper
// ---------------------------------------------------------------------------

export function checkFlowError(
  result: BusinessServiceResult,
  operationTitle: string,
): { title: string; status: number; detail: string } | null {
  if (result.status === "error") {
    return {
      title: `${operationTitle} Failed`,
      status: 400,
      detail: result.error ?? "Unknown error",
    };
  }
  return null;
}
