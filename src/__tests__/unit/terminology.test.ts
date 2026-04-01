import { describe, it, expect } from "vitest";
import {
  businessTerminology,
  businessTerminologyFull,
  resolveTerminologyLabel,
  getTermsForDomain,
} from "../../terminology/businessTerms.js";
import type { BusinessTermKey } from "../../types.js";

const ALL_TERM_KEYS: BusinessTermKey[] = [
  "customer", "product", "order", "collection", "size", "color",
  "subscriber", "campaign", "shipping", "inventory", "storefront", "variant",
];

const ALL_BUSINESS_TYPES = ["kids-boutique", "chocolate-shop"] as const;

describe("businessTerminology", () => {
  it("defines all 12 term keys", () => {
    const keys = Object.keys(businessTerminology);
    expect(keys).toHaveLength(12);
    for (const key of ALL_TERM_KEYS) {
      expect(businessTerminology).toHaveProperty(key);
    }
  });

  it("every term has a default value", () => {
    for (const key of ALL_TERM_KEYS) {
      expect(businessTerminology[key].default).toBeTruthy();
    }
  });

  it("kids-boutique overrides are correct", () => {
    expect(businessTerminology.customer["kids-boutique"]).toBe("Parent");
    expect(businessTerminology.product["kids-boutique"]).toBe("Outfit");
    expect(businessTerminology.campaign["kids-boutique"]).toBe("Newsletter");
    expect(businessTerminology.variant["kids-boutique"]).toBe("Style");
  });

  it("chocolate-shop overrides are correct", () => {
    expect(businessTerminology.product["chocolate-shop"]).toBe("Treat");
    expect(businessTerminology.color["chocolate-shop"]).toBe("Flavor");
    expect(businessTerminology.size["chocolate-shop"]).toBe("Box Size");
    expect(businessTerminology.shipping["chocolate-shop"]).toBe("Delivery");
    expect(businessTerminology.variant["chocolate-shop"]).toBe("Variety");
  });
});

describe("businessTerminologyFull", () => {
  it("defines entries for both business types", () => {
    for (const type of ALL_BUSINESS_TYPES) {
      expect(businessTerminologyFull).toHaveProperty(type);
    }
  });

  it("each business type has all 12 term keys with singular and plural", () => {
    for (const type of ALL_BUSINESS_TYPES) {
      const terms = businessTerminologyFull[type];
      for (const key of ALL_TERM_KEYS) {
        const label = terms[key];
        expect(label).toBeDefined();
        expect(label.singular).toBeTruthy();
        expect(label.plural).toBeTruthy();
      }
    }
  });

  it("plurals are distinct from singulars where appropriate", () => {
    expect(businessTerminologyFull["kids-boutique"].product.singular).toBe("Outfit");
    expect(businessTerminologyFull["kids-boutique"].product.plural).toBe("Outfits");
    expect(businessTerminologyFull["chocolate-shop"].variant.singular).toBe("Variety");
    expect(businessTerminologyFull["chocolate-shop"].variant.plural).toBe("Varieties");
    expect(businessTerminologyFull["chocolate-shop"].shipping.singular).toBe("Delivery");
    expect(businessTerminologyFull["chocolate-shop"].shipping.plural).toBe("Deliveries");
  });

  it("uncountable nouns use same singular and plural", () => {
    for (const type of ALL_BUSINESS_TYPES) {
      const inv = businessTerminologyFull[type].inventory;
      expect(inv.singular).toBe("Stock");
      expect(inv.plural).toBe("Stock");
    }
  });
});

describe("resolveTerminologyLabel", () => {
  it("resolves known type and key", () => {
    const label = resolveTerminologyLabel("product", "chocolate-shop");
    expect(label.singular).toBe("Treat");
    expect(label.plural).toBe("Treats");
  });

  it("falls back to generic defaults for unknown type", () => {
    const label = resolveTerminologyLabel("product", "unknown-type");
    expect(label.singular).toBe("Product");
    expect(label.plural).toBe("Products");
  });

  it("returns key string for completely unknown key", () => {
    const label = resolveTerminologyLabel("nonexistent" as BusinessTermKey, "kids-boutique");
    expect(label.singular).toBe("nonexistent");
    expect(label.plural).toBe("nonexistent");
  });
});

describe("getTermsForDomain", () => {
  it("returns catalog domain terms", () => {
    const terms = getTermsForDomain("catalog");
    expect(Object.keys(terms)).toEqual(
      expect.arrayContaining(["product", "collection", "variant", "color", "size"]),
    );
    expect(Object.keys(terms)).toHaveLength(5);
  });

  it("returns orders domain terms", () => {
    const terms = getTermsForDomain("orders");
    expect(Object.keys(terms)).toEqual(
      expect.arrayContaining(["order", "shipping", "customer"]),
    );
    expect(Object.keys(terms)).toHaveLength(3);
  });

  it("returns marketing domain terms", () => {
    const terms = getTermsForDomain("marketing");
    expect(Object.keys(terms)).toEqual(
      expect.arrayContaining(["subscriber", "campaign"]),
    );
    expect(Object.keys(terms)).toHaveLength(2);
  });

  it("returns operations domain terms", () => {
    const terms = getTermsForDomain("operations");
    expect(Object.keys(terms)).toEqual(
      expect.arrayContaining(["inventory", "storefront"]),
    );
    expect(Object.keys(terms)).toHaveLength(2);
  });

  it("returns empty object for unknown domain", () => {
    expect(getTermsForDomain("unknown")).toEqual({});
  });
});
