/**
 * Shared helper functions for consuming smallbusiness-footprint.
 * All config/terminology getters return deep copies to prevent mutation.
 */
import { allBusinessProfiles, toBusinessTypeConfig } from "./profiles/index.js";
import { allBusinessModules } from "./modules/index.js";
import { businessTerminologyFull } from "./terminology/businessTerms.js";
import {
  createBusinessPlatform,
  type BusinessPlatform,
  type BusinessDefinitions,
} from "./businessPlatform.js";
import { createMemoryProfileStore, createTenantContext, createModuleRegistry } from "footprint-blueprint/platform";
import type { TenantContext, ModuleRegistry } from "footprint-blueprint/platform";
import type { ProfileDefinition } from 'footprint-blueprint/features';
import type {
  BusinessType,
  BusinessTypeConfig,
  TerminologyLabel,
  BusinessRepository,
} from "./types.js";
import type { BusinessServiceResult } from "./flows/businessServiceComposer.js";
import type { ActionAuthorizer } from 'footprint-blueprint/actions';
import type { BusinessOperations, BusinessProviders } from './operations.js';

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

export function getBusinessModuleRegistry(definitions?: BusinessDefinitions): ModuleRegistry {
  if (definitions) return createModuleRegistry({ modules: definitions.modules ?? allBusinessModules, profileTypes: definitions.profiles ?? allBusinessProfiles });
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

export function isValidBusinessType(type: string, profiles: readonly ProfileDefinition[] = allBusinessProfiles): type is BusinessType {
  return profiles.some(profile => profile.type === type);
}

// ---------------------------------------------------------------------------
// Config getters (deep copy)
// ---------------------------------------------------------------------------

export function getAllBusinessTypeConfigs(profiles: readonly ProfileDefinition[] = allBusinessProfiles): Record<string, BusinessTypeConfig> {
  return Object.fromEntries(profiles.map(profile => [profile.type, toBusinessTypeConfig(profile)]));
}

export function getBusinessTypeConfig(businessType: string, profiles: readonly ProfileDefinition[] = allBusinessProfiles): BusinessTypeConfig | undefined {
  const profile = profiles.find(profile => profile.type === businessType);
  return profile ? toBusinessTypeConfig(profile) : undefined;
}

export function getAllBusinessProfiles(profiles: readonly ProfileDefinition[] = allBusinessProfiles) {
  return structuredClone(profiles);
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
    createProduct: stub,
    updateProduct: stub,
    getProduct: stub,
    listProducts: stub,
    archiveProduct: stub,
    createOrder: stub,
    getOrder: stub,
    updateOrderStatus: stub,
    listOrders: stub,
    getSubscriber: stub,
    upsertSubscriber: stub,
    unsubscribeByToken: stub,
    listSubscribers: stub,
    createCampaign: stub,
    updateCampaign: stub,
    recordSendResult: stub,
    deleteCampaign: stub,
    getCampaign: stub,
    listCampaigns: stub,
    getInventory: stub,
    updateStock: stub,
  };
}

// ---------------------------------------------------------------------------
// Platform factories
// ---------------------------------------------------------------------------

export function createConfigPlatform(businessType: BusinessType, unitId: string, definitions: BusinessDefinitions = {}): BusinessPlatform {
  const profileStore = createMemoryProfileStore([
    { tenantId: unitId, unitId, revision: 1, profileType: businessType, createdAt: new Date().toISOString() },
  ]);
  return createBusinessPlatform({ ...definitions, profileStore, scope: { tenantId: unitId, unitId } });
}

export function createPlatformForRequest(opts: BusinessDefinitions & {
  tenantId: string;
  businessType: BusinessType;
  unitId: string;
  repository: BusinessRepository;
  userId?: string;
  authorizer?: ActionAuthorizer;
  operations?: BusinessOperations;
  providers?: BusinessProviders;
}): { platform: BusinessPlatform; ctx: TenantContext } {
  const profileStore = createMemoryProfileStore([
    { tenantId: opts.tenantId, unitId: opts.unitId, revision: 1, profileType: opts.businessType, createdAt: new Date().toISOString() },
  ]);
  const platform = createBusinessPlatform({ profileStore, repository: opts.repository, scope: { tenantId: opts.tenantId, unitId: opts.unitId }, authorizer: opts.authorizer, operations: opts.operations, providers: opts.providers, profiles: opts.profiles, modules: opts.modules });
  const ctx = createTenantContext({
    tenantId: opts.tenantId,
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
