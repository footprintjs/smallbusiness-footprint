import { describe, it, expect } from "vitest";
import {
  BUSINESS_TYPES_LIST,
  isValidBusinessType,
  getAllBusinessTypeConfigs,
  getBusinessTypeConfig,
  resolveBusinessTerminology,
  pluralize,
  createStubRepository,
} from "../../helpers.js";

describe("BUSINESS_TYPES_LIST", () => {
  it("contains both business types", () => {
    expect(BUSINESS_TYPES_LIST).toContain("kids-boutique");
    expect(BUSINESS_TYPES_LIST).toContain("chocolate-shop");
    expect(BUSINESS_TYPES_LIST).toHaveLength(2);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(BUSINESS_TYPES_LIST)).toBe(true);
  });
});

describe("isValidBusinessType", () => {
  it("returns true for valid types", () => {
    expect(isValidBusinessType("kids-boutique")).toBe(true);
    expect(isValidBusinessType("chocolate-shop")).toBe(true);
  });

  it("returns false for invalid types", () => {
    expect(isValidBusinessType("unknown")).toBe(false);
    expect(isValidBusinessType("")).toBe(false);
    expect(isValidBusinessType("k12")).toBe(false);
  });
});

describe("getAllBusinessTypeConfigs", () => {
  it("returns configs for both types", () => {
    const configs = getAllBusinessTypeConfigs();
    expect(Object.keys(configs)).toHaveLength(2);
    expect(configs).toHaveProperty("kids-boutique");
    expect(configs).toHaveProperty("chocolate-shop");
  });

  it("returns deep copies", () => {
    const a = getAllBusinessTypeConfigs();
    const b = getAllBusinessTypeConfigs();
    expect(a).toEqual(b);
    expect(a["kids-boutique"]).not.toBe(b["kids-boutique"]);
    expect(a["kids-boutique"].theme).not.toBe(b["kids-boutique"].theme);
  });
});

describe("getBusinessTypeConfig", () => {
  it("returns config for valid type", () => {
    const config = getBusinessTypeConfig("kids-boutique");
    expect(config).toBeDefined();
    expect(config!.type).toBe("kids-boutique");
  });

  it("returns undefined for invalid type", () => {
    expect(getBusinessTypeConfig("unknown")).toBeUndefined();
  });

  it("returns deep copy", () => {
    const a = getBusinessTypeConfig("kids-boutique");
    const b = getBusinessTypeConfig("kids-boutique");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it("prevents prototype pollution", () => {
    expect(getBusinessTypeConfig("__proto__")).toBeUndefined();
    expect(getBusinessTypeConfig("constructor")).toBeUndefined();
  });
});

describe("resolveBusinessTerminology", () => {
  it("resolves terminology for valid type", () => {
    const terms = resolveBusinessTerminology("chocolate-shop");
    expect(terms.product.singular).toBe("Treat");
    expect(terms.product.plural).toBe("Treats");
  });

  it("falls back to generic defaults for unknown type", () => {
    const terms = resolveBusinessTerminology("unknown");
    expect(terms.product.singular).toBe("Product");
  });

  it("returns deep copy", () => {
    const a = resolveBusinessTerminology("kids-boutique");
    const b = resolveBusinessTerminology("kids-boutique");
    expect(a).toEqual(b);
    expect(a.product).not.toBe(b.product);
  });
});

describe("pluralize", () => {
  it("handles regular plurals", () => {
    expect(pluralize("Product")).toBe("Products");
    expect(pluralize("Order")).toBe("Orders");
  });

  it("handles -y plurals", () => {
    expect(pluralize("Variety")).toBe("Varieties");
    expect(pluralize("Delivery")).toBe("Deliveries");
  });

  it("handles irregular plurals", () => {
    expect(pluralize("Stock")).toBe("Stock");
    expect(pluralize("Inventory")).toBe("Inventory");
  });
});

describe("createStubRepository", () => {
  it("throws on any method call", () => {
    const repo = createStubRepository("test");
    expect(() => (repo.createProduct as any)()).toThrow("test does not execute data flows");
    expect(() => (repo.createOrder as any)()).toThrow("test does not execute data flows");
  });
});
