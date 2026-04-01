import { describe, it, expect } from "vitest";
import { FlowChartExecutor } from "footprintjs";
import { createProductCreateFlow } from "../../flows/catalog/productCreateFlow.js";
import { createProductUpdateFlow } from "../../flows/catalog/productUpdateFlow.js";
import { createMockRepository } from "../helpers.js";

describe("product create flow", () => {
  const repo = createMockRepository();

  it("creates a product with required fields", async () => {
    const flow = createProductCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { name: "Summer Dress", basePrice: 2999 },
    }});
    executor.enableNarrative();

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;

    expect(state.createdProduct).toBeDefined();
    expect((state.createdProduct as any).name).toBe("Summer Dress");
    expect((state.createdProduct as any).basePrice).toBe(2999);
    expect((state.output as any).productId).toBeTruthy();
  });

  it("creates a product with optional fields", async () => {
    const flow = createProductCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: {
        name: "Chocolate Box",
        basePrice: 1499,
        description: "Assorted truffles",
        colors: ["dark", "milk", "white"],
        tags: ["gift", "premium"],
      },
    }});

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;
    const product = state.createdProduct as any;

    expect(product.description).toBe("Assorted truffles");
    expect(product.colors).toEqual(["dark", "milk", "white"]);
    expect(product.tags).toEqual(["gift", "premium"]);
  });

  it("rejects product without name", async () => {
    const flow = createProductCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { basePrice: 1000 },
    }});

    await expect(executor.run()).rejects.toThrow("Product name is required");
  });

  it("rejects product without base price", async () => {
    const flow = createProductCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { name: "Test" },
    }});

    await expect(executor.run()).rejects.toThrow("Base price is required");
  });

  it("rejects negative base price", async () => {
    const flow = createProductCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { name: "Test", basePrice: -100 },
    }});

    await expect(executor.run()).rejects.toThrow("Base price must be non-negative");
  });

  it("produces narrative entries", async () => {
    const flow = createProductCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { name: "Test Product", basePrice: 500 },
    }});
    executor.enableNarrative();

    await executor.run();
    const narrative = executor.getNarrative();
    expect(narrative.length).toBeGreaterThan(0);
  });

  it("uses terminology in descriptions", () => {
    const t = (key: string) => key === "product" ? "Treat" : key;
    const flow = createProductCreateFlow(repo, t);
    expect(flow.description).toContain("Treat");
  });
});

describe("product update flow", () => {
  const repo = createMockRepository();

  it("updates a product with partial fields", async () => {
    const flow = createProductUpdateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { id: "product-1", name: "Updated Name", basePrice: 3999 },
    }});

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;

    expect(state.updatedProduct).toBeDefined();
    expect((state.output as any).productId).toBe("product-1");
  });

  it("rejects update without product ID", async () => {
    const flow = createProductUpdateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { name: "No ID" },
    }});

    await expect(executor.run()).rejects.toThrow("Product ID is required");
  });
});
