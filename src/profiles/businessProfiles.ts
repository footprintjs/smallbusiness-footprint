import { defineProfile } from "@footprint/features";
import type { ProfileDefinition } from "@footprint/features";
import type { BusinessTypeConfig } from "../types.js";

export const kidsBoutiqueProfile = defineProfile({
  type: "kids-boutique",
  displayName: "Kids Boutique",
  modules: ["catalog", "orders", "payments", "campaigns", "subscribers", "inventory", "storefront"],
  roles: ["Owner", "Admin", "Staff"],
  schedulingPattern: "standard-shipping",
  meta: {
    services: {
      catalog: true,
      orders: true,
      payments: true,
      campaigns: true,
      subscribers: true,
      inventory: true,
      storefront: true,
    },
    theme: { accent: "#e8a0bf", label: "Rose" },
  },
});

export const chocolateShopProfile = defineProfile({
  type: "chocolate-shop",
  displayName: "Chocolate Shop",
  modules: ["catalog", "orders", "payments", "campaigns", "subscribers", "inventory", "storefront"],
  roles: ["Owner", "Admin", "Staff"],
  schedulingPattern: "local-delivery",
  meta: {
    services: {
      catalog: true,
      orders: true,
      payments: true,
      campaigns: true,
      subscribers: true,
      inventory: true,
      storefront: true,
    },
    theme: { accent: "#6b3a2a", label: "Chocolate" },
  },
});

export const allBusinessProfiles = [kidsBoutiqueProfile, chocolateShopProfile] as const;

/** Derive metadata for any registered profile without imposing a built-in brand. */
export function toBusinessTypeConfig(profile: ProfileDefinition): BusinessTypeConfig {
  const services = Object.fromEntries(['catalog', 'orders', 'payments', 'campaigns', 'subscribers', 'inventory', 'storefront', ...profile.modules].map(id => [id, profile.modules.includes(id)]));
  const configuredServices = profile.meta.services;
  if (configuredServices !== undefined) {
    if (!configuredServices || typeof configuredServices !== 'object' || Array.isArray(configuredServices)) throw new Error(`Profile "${profile.type}" has invalid services metadata`);
    for (const [id, enabled] of Object.entries(configuredServices)) {
      if (typeof enabled !== 'boolean') throw new Error(`Profile "${profile.type}" has invalid service "${id}"`);
      Object.defineProperty(services, id, { value: enabled, enumerable: true, writable: true, configurable: true });
    }
  }
  const theme = profile.meta.theme;
  if (theme !== undefined && (!theme || typeof theme !== 'object' || Array.isArray(theme))) throw new Error(`Profile "${profile.type}" has invalid theme metadata`);
  const configuredTheme = theme as Partial<BusinessTypeConfig['theme']> | undefined;
  if (configuredTheme && ((configuredTheme.accent !== undefined && typeof configuredTheme.accent !== 'string') || (configuredTheme.label !== undefined && typeof configuredTheme.label !== 'string'))) throw new Error(`Profile "${profile.type}" has invalid theme metadata`);
  return {
    type: profile.type,
    displayName: profile.displayName,
    services: services as BusinessTypeConfig['services'],
    fulfillmentPattern: profile.schedulingPattern,
    theme: { accent: configuredTheme?.accent ?? '#64748b', label: configuredTheme?.label ?? profile.displayName },
  };
}

export const businessTypeConfigs: Record<string, BusinessTypeConfig> = Object.fromEntries(
  allBusinessProfiles.map((p) => [p.type, toBusinessTypeConfig(p)]),
);
