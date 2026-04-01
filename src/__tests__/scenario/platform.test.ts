import { describe, it, expect } from "vitest";
import { createBusinessPlatform } from "../../businessPlatform.js";
import { createMemoryProfileStore, createTenantContext } from "@footprint/platform";
import { createMemoryOverrideStore } from "../../overrides/unitOverrides.js";
import { createMockRepository } from "../helpers.js";

function createTestPlatform() {
  const repo = createMockRepository();
  const profileStore = createMemoryProfileStore([
    { unitId: "boutique-1", profileType: "kids-boutique", createdAt: "2024-01-01" },
    { unitId: "choco-1", profileType: "chocolate-shop", createdAt: "2024-01-01" },
  ]);
  const overrideStore = createMemoryOverrideStore({
    "boutique-1": {
      terminologyOverrides: { product: "Garment" },
      themeOverrides: { accent: "#ff0000" },
    },
  });
  const platform = createBusinessPlatform({ profileStore, repository: repo, overrideStore });
  return { platform, repo };
}

describe("BusinessPlatform", () => {
  it("creates successfully", () => {
    const { platform } = createTestPlatform();
    expect(platform).toBeDefined();
  });

  it("returns supported business types", () => {
    const { platform } = createTestPlatform();
    const types = platform.supportedBusinessTypes();
    expect(types).toContain("kids-boutique");
    expect(types).toContain("chocolate-shop");
  });

  it("returns business type config", () => {
    const { platform } = createTestPlatform();
    const config = platform.getBusinessTypeConfig("kids-boutique");
    expect(config).toBeDefined();
    expect(config!.displayName).toBe("Kids Boutique");
    expect(config!.theme.accent).toBe("#e8a0bf");
  });

  it("resolves unit to profile type", async () => {
    const { platform } = createTestPlatform();
    const ctx = createTenantContext({ tenantId: "t1", unitId: "boutique-1" });
    const unit = await platform.resolveUnit(ctx);
    expect(unit).toBeDefined();
    expect(unit!.profileType).toBe("kids-boutique");
  });

  it("executes a service flow", async () => {
    const { platform } = createTestPlatform();
    const ctx = createTenantContext({ tenantId: "t1", unitId: "boutique-1" });
    const result = await platform.executeServiceFlow(ctx, "create-product", {
      name: "Summer Dress",
      basePrice: 2999,
    });

    expect(result.status).toBe("success");
    expect(result.result).toBeDefined();
  });

  it("returns error for unresolvable unit", async () => {
    const { platform } = createTestPlatform();
    const ctx = createTenantContext({ tenantId: "t1", unitId: "unknown-unit" });
    const result = await platform.executeServiceFlow(ctx, "create-product", { name: "Test", basePrice: 100 });
    expect(result.status).toBe("error");
    expect(result.error).toContain("Could not resolve business type");
  });

  it("describes all services", () => {
    const { platform } = createTestPlatform();
    const descs = platform.describeAllServices("kids-boutique");
    expect(descs.length).toBe(8);
  });

  it("describes a specific service with terminology", () => {
    const { platform } = createTestPlatform();
    const desc = platform.describeService("create-product", "chocolate-shop");
    expect(desc).toBeDefined();
    expect(desc!.stages.some((s) => s.description.includes("Treat"))).toBe(true);
  });
});

describe("BusinessPlatform — overrides", () => {
  it("resolves term with per-unit override", async () => {
    const { platform } = createTestPlatform();
    const ctx = createTenantContext({ tenantId: "t1", unitId: "boutique-1" });
    const t = await platform.getTermResolverWithOverrides(ctx);

    expect(t("product")).toBe("Garment");
    expect(t("order")).toBe("Order");
  });

  it("falls back to business-type default when no override", async () => {
    const { platform } = createTestPlatform();
    const ctx = createTenantContext({ tenantId: "t1", unitId: "choco-1" });
    const t = await platform.getTermResolverWithOverrides(ctx);

    expect(t("product")).toBe("Treat");
    expect(t("color")).toBe("Flavor");
  });

  it("returns unit overrides", async () => {
    const { platform } = createTestPlatform();
    const overrides = await platform.getUnitOverrides("boutique-1");
    expect(overrides).toBeDefined();
    expect(overrides!.terminologyOverrides!.product).toBe("Garment");
  });

  it("returns undefined overrides for unit without overrides", async () => {
    const { platform } = createTestPlatform();
    const overrides = await platform.getUnitOverrides("choco-1");
    expect(overrides).toBeUndefined();
  });

  it("full term resolver returns singular/plural", async () => {
    const { platform } = createTestPlatform();
    const ctx = createTenantContext({ tenantId: "t1", unitId: "boutique-1" });
    const t = await platform.getFullTermResolver(ctx);

    const overridden = t("product");
    expect(overridden.singular).toBe("Garment");
    expect(overridden.plural).toBeTruthy();

    const defaultTerm = t("order");
    expect(defaultTerm.singular).toBe("Order");
    expect(defaultTerm.plural).toBe("Orders");
  });
});
