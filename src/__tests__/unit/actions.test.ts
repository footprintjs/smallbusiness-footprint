import { describe, it, expect } from "vitest";
import { allBusinessActions } from "../../actions/index.js";

describe("business actions", () => {
  it("defines 12 actions", () => {
    expect(allBusinessActions).toHaveLength(12);
  });

  it("all actions have valid IDs, names, and domains", () => {
    for (const action of allBusinessActions) {
      expect(action.id).toBeTruthy();
      expect(action.name).toBeTruthy();
      expect(action.domain).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.category).toBeTruthy();
    }
  });

  it("action IDs are unique", () => {
    const ids = allBusinessActions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all actions have requiredModules", () => {
    for (const action of allBusinessActions) {
      expect(action.requiredModules.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("all actions have at least one required parameter", () => {
    for (const action of allBusinessActions) {
      const required = action.parameters.filter((p) => p.required);
      expect(required.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("actions with capabilityId link to valid capabilities", () => {
    const validCapabilities = ["create-product", "update-product", "archive-product", "create-order", "process-payment", "send-campaign", "manage-subscribers", "unsubscribe", "create-campaign", "schedule-campaign", "manage-inventory", "publish-storefront"];
    const actionsWithCapability = allBusinessActions.filter((a) => a.capabilityId);
    expect(actionsWithCapability.length).toBeGreaterThanOrEqual(6);
    for (const action of actionsWithCapability) {
      expect(validCapabilities).toContain(action.capabilityId);
    }
  });

  it("catalog actions require catalog module", () => {
    const catalogActions = allBusinessActions.filter((a) => a.domain === "catalog");
    for (const action of catalogActions) {
      expect(action.requiredModules).toContain("catalog");
    }
  });

  it("marketing actions require appropriate modules", () => {
    const campaignActions = allBusinessActions.filter((a) => a.id.includes("campaign"));
    for (const action of campaignActions) {
      expect(action.requiredModules).toContain("campaigns");
    }
  });
});
