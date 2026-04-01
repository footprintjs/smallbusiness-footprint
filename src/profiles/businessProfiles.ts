import { defineProfile } from "@footprint/features";
import type { ProfileDefinition } from "@footprint/features";
import type { BusinessType, BusinessTypeConfig, FulfillmentPattern } from "../types.js";

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

function toBusinessTypeConfig(profile: ProfileDefinition): BusinessTypeConfig {
  const meta = profile.meta as {
    services: BusinessTypeConfig["services"];
    theme: BusinessTypeConfig["theme"];
  };
  return {
    type: profile.type as BusinessType,
    displayName: profile.displayName,
    services: meta.services,
    fulfillmentPattern: profile.schedulingPattern as FulfillmentPattern,
    theme: meta.theme,
  };
}

export const businessTypeConfigs: Record<string, BusinessTypeConfig> = Object.fromEntries(
  allBusinessProfiles.map((p) => [p.type, toBusinessTypeConfig(p)]),
);
