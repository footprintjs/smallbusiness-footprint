import { describe, it, expect } from "vitest";
import {
  createBusinessServiceRegistry,
  resolveFlowBuilder,
  getRegisteredActionIds,
  buildActionDispatch,
} from "../../flows/businessServiceComposer.js";
import { createMockRepository } from "../helpers.js";

describe("service composer", () => {
  const repo = createMockRepository();

  it("registers all 8 action flows", () => {
    const ids = getRegisteredActionIds();
    expect(ids).toHaveLength(8);
    expect(ids).toContain("create-product");
    expect(ids).toContain("create-order");
    expect(ids).toContain("send-campaign-batch");
  });

  it("resolves flow builder for known action", () => {
    const builder = resolveFlowBuilder("create-product");
    expect(builder).toBeDefined();
  });

  it("returns undefined for unknown action", () => {
    const builder = resolveFlowBuilder("nonexistent");
    expect(builder).toBeUndefined();
  });
});

describe("BusinessServiceRegistry", () => {
  const repo = createMockRepository();
  const registry = createBusinessServiceRegistry(repo);

  it("returns all service IDs", () => {
    const ids = registry.serviceIds();
    expect(ids).toHaveLength(8);
  });

  it("gets a generic flow by action ID", () => {
    const flow = registry.getFlow("create-product");
    expect(flow).toBeDefined();
  });

  it("gets a typed flow with terminology", () => {
    const flow = registry.getTypedFlow("create-product", "chocolate-shop");
    expect(flow).toBeDefined();
    expect(flow!.description).toContain("Treat");
  });

  it("describes a service", () => {
    const desc = registry.describeService("create-order");
    expect(desc).toBeDefined();
    expect(desc!.actionId).toBe("create-order");
    expect(desc!.stages.length).toBeGreaterThan(0);
  });

  it("describes a service with terminology", () => {
    const desc = registry.describeService("create-product", "chocolate-shop");
    expect(desc).toBeDefined();
    expect(desc!.stages.some((s) => s.description.includes("Treat"))).toBe(true);
  });

  it("describes all services", () => {
    const descs = registry.describeAllServices();
    expect(descs).toHaveLength(8);
  });

  it("builds a fresh service flow", () => {
    const ctx = { businessType: "kids-boutique" as const, unitId: "shop-1", repository: repo };
    const built = registry.buildServiceFlow("create-product", ctx);
    expect(built).toBeDefined();
    expect(built!.flow).toBeDefined();
    expect(built!.flowMeta.flowId).toBe("create-product");
  });

  it("executes a service flow successfully", async () => {
    const ctx = { businessType: "kids-boutique" as const, unitId: "shop-1", repository: repo };
    const result = await registry.executeService(
      "create-product",
      { name: "Test Dress", basePrice: 2999 },
      ctx,
    );

    expect(result.status).toBe("success");
    expect(result.result).toBeDefined();
    expect(result.manifest).toBeDefined();
    expect(result.narrative).toBeDefined();
    expect(result.flowMeta?.flowId).toBe("create-product");
  });

  it("returns error for unknown action", async () => {
    const ctx = { businessType: "kids-boutique" as const, unitId: "shop-1", repository: repo };
    const result = await registry.executeService("nonexistent", {}, ctx);
    expect(result.status).toBe("error");
    expect(result.error).toContain("No service flow registered");
  });

  it("returns error for invalid input", async () => {
    const ctx = { businessType: "kids-boutique" as const, unitId: "shop-1", repository: repo };
    const result = await registry.executeService("create-product", {}, ctx);
    expect(result.status).toBe("error");
    expect(result.error).toContain("Product name is required");
  });
});

describe("buildActionDispatch", () => {
  const repo = createMockRepository();

  it("builds dispatch for known action", () => {
    const dispatch = buildActionDispatch("create-product", "kids-boutique", repo);
    expect(dispatch).toBeDefined();
    expect(dispatch!.actionId).toBe("create-product");
    expect(dispatch!.branches.size).toBe(1);
    expect(dispatch!.meta.resolvedBusinessType).toBe("kids-boutique");
  });

  it("returns undefined for unknown action", () => {
    const dispatch = buildActionDispatch("nonexistent", "kids-boutique", repo);
    expect(dispatch).toBeUndefined();
  });
});
