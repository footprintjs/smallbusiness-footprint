import { describe, it, expect } from "vitest";
import {
  catalog,
  orders,
  payments,
  subscribers,
  campaigns,
  inventory,
  storefront,
  allBusinessModules,
} from "../../modules/index.js";

describe("business modules", () => {
  it("defines 7 modules", () => {
    expect(allBusinessModules).toHaveLength(7);
  });

  it("all modules have valid IDs, names, and domains", () => {
    for (const mod of allBusinessModules) {
      expect(mod.id).toBeTruthy();
      expect(mod.name).toBeTruthy();
      expect(mod.domain).toBeTruthy();
    }
  });

  it("module IDs are unique", () => {
    const ids = allBusinessModules.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("allBusinessModules is in valid dependency order", () => {
    const seen = new Set<string>();
    for (const mod of allBusinessModules) {
      for (const dep of mod.requires) {
        expect(seen.has(dep)).toBe(true);
      }
      seen.add(mod.id);
    }
  });

  it("all modules are frozen", () => {
    for (const mod of allBusinessModules) {
      expect(Object.isFrozen(mod)).toBe(true);
    }
  });
});

describe("module dependencies", () => {
  it("catalog has no dependencies", () => {
    expect(catalog.requires).toEqual([]);
  });

  it("subscribers has no dependencies", () => {
    expect(subscribers.requires).toEqual([]);
  });

  it("orders requires catalog", () => {
    expect(orders.requires).toContain("catalog");
  });

  it("payments requires orders", () => {
    expect(payments.requires).toContain("orders");
  });

  it("campaigns requires subscribers", () => {
    expect(campaigns.requires).toContain("subscribers");
  });

  it("inventory requires catalog", () => {
    expect(inventory.requires).toContain("catalog");
  });

  it("storefront requires catalog", () => {
    expect(storefront.requires).toContain("catalog");
  });
});

describe("module domains", () => {
  it("catalog is in catalog domain", () => {
    expect(catalog.domain).toBe("catalog");
  });

  it("orders is in orders domain", () => {
    expect(orders.domain).toBe("orders");
  });

  it("payments is in payments domain", () => {
    expect(payments.domain).toBe("payments");
  });

  it("subscribers and campaigns are in marketing domain", () => {
    expect(subscribers.domain).toBe("marketing");
    expect(campaigns.domain).toBe("marketing");
  });

  it("inventory and storefront are in operations domain", () => {
    expect(inventory.domain).toBe("operations");
    expect(storefront.domain).toBe("operations");
  });
});

describe("module terminology", () => {
  it("catalog module has catalog-domain terminology", () => {
    expect(catalog.terminology).toHaveProperty("product");
    expect(catalog.terminology).toHaveProperty("collection");
    expect(catalog.terminology).toHaveProperty("variant");
  });

  it("orders module has orders-domain terminology", () => {
    expect(orders.terminology).toHaveProperty("order");
    expect(orders.terminology).toHaveProperty("shipping");
  });

  it("subscribers module has marketing-domain terminology", () => {
    expect(subscribers.terminology).toHaveProperty("subscriber");
    expect(subscribers.terminology).toHaveProperty("campaign");
  });
});

describe("module roles", () => {
  it("every module has at least one role mapping", () => {
    for (const mod of allBusinessModules) {
      const roleKeys = Object.keys(mod.roles);
      expect(roleKeys.length).toBeGreaterThanOrEqual(1);
    }
  });
});
