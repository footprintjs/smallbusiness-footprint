import { describe, it, expect } from "vitest";
import { createBusinessPlatform } from "../../businessPlatform.js";
import { createBusinessServiceRegistry, buildActionDispatch } from "../../flows/businessServiceComposer.js";
import { createMemoryProfileStore, createTenantContext } from "@footprint/platform";
import { createMockRepository } from "../helpers.js";

describe("performance: platform creation", () => {
  it("creates platform under 50ms", () => {
    const repo = createMockRepository();
    const profileStore = createMemoryProfileStore([
      { unitId: "shop-1", profileType: "kids-boutique", createdAt: "2024-01-01" },
    ]);

    const start = performance.now();
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      createBusinessPlatform({ profileStore, repository: repo });
    }
    const elapsed = performance.now() - start;
    expect(elapsed / iterations).toBeLessThan(50);
  });
});

describe("performance: service registry", () => {
  it("creates service registry under 10ms", () => {
    const repo = createMockRepository();

    const start = performance.now();
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      createBusinessServiceRegistry(repo);
    }
    const elapsed = performance.now() - start;
    expect(elapsed / iterations).toBeLessThan(10);
  });
});

describe("performance: flow execution", () => {
  it("executes product create flow under 20ms", async () => {
    const repo = createMockRepository();
    const registry = createBusinessServiceRegistry(repo);
    const ctx = { businessType: "kids-boutique" as const, unitId: "shop-1", repository: repo };

    const start = performance.now();
    const iterations = 50;
    for (let i = 0; i < iterations; i++) {
      await registry.executeService("create-product", { name: `Product-${i}`, basePrice: 1000 }, ctx);
    }
    const elapsed = performance.now() - start;
    expect(elapsed / iterations).toBeLessThan(20);
  });
});

describe("performance: buildActionDispatch", () => {
  it("completes under 1ms per call", () => {
    const repo = createMockRepository();

    const start = performance.now();
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      buildActionDispatch("create-product", "kids-boutique", repo);
    }
    const elapsed = performance.now() - start;
    expect(elapsed / iterations).toBeLessThan(1);
  });
});
