import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  isValidBusinessType,
  getBusinessTypeConfig,
  resolveBusinessTerminology,
  BUSINESS_TYPES_LIST,
} from "../../helpers.js";
import { businessTerminologyFull } from "../../terminology/businessTerms.js";
import { allBusinessModules } from "../../modules/index.js";
import { allBusinessProfiles } from "../../profiles/index.js";
import { allBusinessCapabilities } from "../../capabilities/index.js";
import { allBusinessActions } from "../../actions/index.js";
import type { BusinessTermKey } from "../../types.js";

const validTypeArb = fc.constantFrom(...BUSINESS_TYPES_LIST);
const allTermKeys: BusinessTermKey[] = [
  "customer", "product", "order", "collection", "size", "color",
  "subscriber", "campaign", "shipping", "inventory", "storefront", "variant",
];
const termKeyArb = fc.constantFrom(...allTermKeys);

describe("property: isValidBusinessType", () => {
  it("always returns true for valid types", () => {
    fc.assert(
      fc.property(validTypeArb, (type) => {
        expect(isValidBusinessType(type)).toBe(true);
      }),
    );
  });

  it("always returns false for arbitrary strings", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !(BUSINESS_TYPES_LIST as readonly string[]).includes(s)),
        (type) => {
          expect(isValidBusinessType(type)).toBe(false);
        },
      ),
    );
  });
});

describe("property: getBusinessTypeConfig deep copy", () => {
  it("configs are always deep copies (never share identity)", () => {
    fc.assert(
      fc.property(validTypeArb, (type) => {
        const a = getBusinessTypeConfig(type);
        const b = getBusinessTypeConfig(type);
        expect(a).toEqual(b);
        expect(a).not.toBe(b);
        expect(a!.theme).not.toBe(b!.theme);
      }),
    );
  });
});

describe("property: terminology consistency", () => {
  it("every business type has all 12 term keys", () => {
    fc.assert(
      fc.property(validTypeArb, (type) => {
        const terms = businessTerminologyFull[type];
        for (const key of allTermKeys) {
          expect(terms[key]).toBeDefined();
          expect(terms[key].singular).toBeTruthy();
          expect(terms[key].plural).toBeTruthy();
        }
      }),
    );
  });

  it("resolveBusinessTerminology always returns all keys", () => {
    fc.assert(
      fc.property(validTypeArb, (type) => {
        const terms = resolveBusinessTerminology(type);
        expect(Object.keys(terms)).toHaveLength(12);
      }),
    );
  });

  it("term labels are non-empty strings", () => {
    fc.assert(
      fc.property(validTypeArb, termKeyArb, (type, key) => {
        const terms = businessTerminologyFull[type];
        expect(typeof terms[key].singular).toBe("string");
        expect(terms[key].singular.length).toBeGreaterThan(0);
      }),
    );
  });
});

describe("property: module invariants", () => {
  it("all module IDs are unique", () => {
    const ids = allBusinessModules.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all module dependencies reference existing modules", () => {
    const ids = new Set(allBusinessModules.map((m) => m.id));
    for (const mod of allBusinessModules) {
      for (const dep of mod.requires) {
        expect(ids.has(dep)).toBe(true);
      }
    }
  });
});

describe("property: profile invariants", () => {
  it("all profiles reference only valid module IDs", () => {
    const moduleIds = new Set(allBusinessModules.map((m) => m.id));
    for (const profile of allBusinessProfiles) {
      for (const mod of profile.modules) {
        expect(moduleIds.has(mod)).toBe(true);
      }
    }
  });
});

describe("property: capability invariants", () => {
  it("all capability IDs are unique", () => {
    const ids = allBusinessCapabilities.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("property: action invariants", () => {
  it("all action IDs are unique", () => {
    const ids = allBusinessActions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all action requiredModules reference existing modules", () => {
    const moduleIds = new Set(allBusinessModules.map((m) => m.id));
    for (const action of allBusinessActions) {
      for (const mod of action.requiredModules) {
        expect(moduleIds.has(mod)).toBe(true);
      }
    }
  });
});
