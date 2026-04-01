import { describe, it, expect } from "vitest";
import {
  kidsBoutiqueProfile,
  chocolateShopProfile,
  allBusinessProfiles,
  businessTypeConfigs,
} from "../../profiles/index.js";

describe("business profiles", () => {
  it("defines 2 profiles", () => {
    expect(allBusinessProfiles).toHaveLength(2);
  });

  it("all profiles are frozen", () => {
    for (const profile of allBusinessProfiles) {
      expect(Object.isFrozen(profile)).toBe(true);
    }
  });

  it("kids-boutique has correct metadata", () => {
    expect(kidsBoutiqueProfile.type).toBe("kids-boutique");
    expect(kidsBoutiqueProfile.displayName).toBe("Kids Boutique");
    expect(kidsBoutiqueProfile.modules).toHaveLength(7);
    expect(kidsBoutiqueProfile.roles).toContain("Owner");
    expect(kidsBoutiqueProfile.schedulingPattern).toBe("standard-shipping");
  });

  it("chocolate-shop has correct metadata", () => {
    expect(chocolateShopProfile.type).toBe("chocolate-shop");
    expect(chocolateShopProfile.displayName).toBe("Chocolate Shop");
    expect(chocolateShopProfile.modules).toHaveLength(7);
    expect(chocolateShopProfile.schedulingPattern).toBe("local-delivery");
  });

  it("both profiles include all 7 modules", () => {
    const expectedModules = ["catalog", "orders", "payments", "campaigns", "subscribers", "inventory", "storefront"];
    for (const profile of allBusinessProfiles) {
      for (const mod of expectedModules) {
        expect(profile.modules).toContain(mod);
      }
    }
  });
});

describe("businessTypeConfigs", () => {
  it("has configs for both types", () => {
    expect(businessTypeConfigs).toHaveProperty("kids-boutique");
    expect(businessTypeConfigs).toHaveProperty("chocolate-shop");
  });

  it("kids-boutique config has correct theme", () => {
    const config = businessTypeConfigs["kids-boutique"];
    expect(config.theme.accent).toBe("#e8a0bf");
    expect(config.theme.label).toBe("Rose");
  });

  it("chocolate-shop config has correct theme", () => {
    const config = businessTypeConfigs["chocolate-shop"];
    expect(config.theme.accent).toBe("#6b3a2a");
    expect(config.theme.label).toBe("Chocolate");
  });

  it("fulfillmentPattern is derived from schedulingPattern", () => {
    expect(businessTypeConfigs["kids-boutique"].fulfillmentPattern).toBe("standard-shipping");
    expect(businessTypeConfigs["chocolate-shop"].fulfillmentPattern).toBe("local-delivery");
  });

  it("all services are enabled for both types", () => {
    for (const config of Object.values(businessTypeConfigs)) {
      expect(config.services.catalog).toBe(true);
      expect(config.services.orders).toBe(true);
      expect(config.services.payments).toBe(true);
      expect(config.services.campaigns).toBe(true);
      expect(config.services.subscribers).toBe(true);
      expect(config.services.inventory).toBe(true);
      expect(config.services.storefront).toBe(true);
    }
  });
});
