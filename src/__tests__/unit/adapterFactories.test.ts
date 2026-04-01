import { describe, it, expect } from "vitest";
import { createFulfillmentAdapters } from "../../adapters/fulfillmentAdapters.js";
import { createPaymentAdapters } from "../../adapters/paymentAdapters.js";
import { createCatalogAdapters } from "../../adapters/catalogAdapters.js";
import { createMarketingAdapters } from "../../adapters/marketingAdapters.js";
import { createInventoryAdapters } from "../../adapters/inventoryAdapters.js";
import { createMockRepository } from "../helpers.js";

describe("fulfillment adapter factories", () => {
  const repo = createMockRepository();
  const adapters = createFulfillmentAdapters(repo);

  it("creates 2 adapters", () => {
    expect(adapters).toHaveLength(2);
  });

  it("standard-shipping creates an order via repo", async () => {
    const adapter = adapters.find((a) => a.id === "standard-shipping")!;
    const result = await adapter.execute({
      email: "test@example.com",
      items: [{ name: "Dress", quantity: 1, price: 2999 }],
      shipping: { firstName: "Jane", lastName: "Doe", email: "test@example.com", address: "123 Main", city: "Town", state: "CA", zipCode: "90210" },
    }, {} as any) as any;
    expect(result.created).toBe(true);
    expect(result.pattern).toBe("standard-shipping");
    expect(result.order.orderId).toBeTruthy();
  });

  it("local-delivery creates an order via repo", async () => {
    const adapter = adapters.find((a) => a.id === "local-delivery")!;
    const result = await adapter.execute({
      email: "test@example.com",
      items: [{ name: "Box", quantity: 1, price: 1499 }],
      shipping: { firstName: "Jane", lastName: "Doe", email: "test@example.com", address: "123 Main", city: "Town", state: "CA", zipCode: "90210" },
    }, {} as any) as any;
    expect(result.created).toBe(true);
    expect(result.pattern).toBe("local-delivery");
  });

  it("standard-shipping rejects missing email", async () => {
    const adapter = adapters.find((a) => a.id === "standard-shipping")!;
    await expect(adapter.execute({ items: [{ name: "X", quantity: 1, price: 100 }], shipping: {} }, {} as any))
      .rejects.toThrow("email is required");
  });

  it("standard-shipping rejects empty items", async () => {
    const adapter = adapters.find((a) => a.id === "standard-shipping")!;
    await expect(adapter.execute({ email: "test@example.com", items: [], shipping: {} }, {} as any))
      .rejects.toThrow("items are required");
  });
});

describe("payment adapter factories", () => {
  const repo = createMockRepository();
  const adapters = createPaymentAdapters(repo);

  it("creates 1 adapter", () => {
    expect(adapters).toHaveLength(1);
  });

  it("stripe-checkout processes payment via repo", async () => {
    const adapter = adapters.find((a) => a.id === "stripe-checkout")!;
    const result = await adapter.execute({ orderId: "order-1" }, {} as any) as any;
    expect(result.processed).toBe(true);
    expect(result.gateway).toBe("stripe");
    expect(result.order.status).toBe("PAYMENT_PENDING");
  });

  it("stripe-checkout rejects missing orderId", async () => {
    const adapter = adapters.find((a) => a.id === "stripe-checkout")!;
    await expect(adapter.execute({}, {} as any)).rejects.toThrow("orderId is required");
  });

  it("stripe-checkout throws when order not found", async () => {
    const noOrderRepo = { ...createMockRepository(), getOrder: async () => undefined };
    const [adapter] = createPaymentAdapters(noOrderRepo as any);
    await expect(adapter.execute({ orderId: "nonexistent" }, {} as any)).rejects.toThrow("order not found");
  });
});

describe("catalog adapter factories", () => {
  const repo = createMockRepository();
  const adapters = createCatalogAdapters(repo);

  it("creates 2 adapters", () => {
    expect(adapters).toHaveLength(2);
  });

  it("variant-catalog creates product with variant count", async () => {
    const adapter = adapters.find((a) => a.id === "variant-catalog")!;
    const result = await adapter.execute({
      name: "Summer Dress", basePrice: 2999,
      colors: ["red", "blue"], sizes: ["S", "M", "L"],
    }, {} as any) as any;
    expect(result.created).toBe(true);
    expect(result.catalogType).toBe("variant");
    expect(result.variantCount).toBe(6);
  });

  it("box-catalog creates product with box sizes and flavors", async () => {
    const adapter = adapters.find((a) => a.id === "box-catalog")!;
    const result = await adapter.execute({
      name: "Truffle Box", basePrice: 1499,
      sizes: ["4-piece", "8-piece"], colors: ["dark", "milk", "white"],
    }, {} as any) as any;
    expect(result.created).toBe(true);
    expect(result.catalogType).toBe("box");
    expect(result.boxSizes).toEqual(["4-piece", "8-piece"]);
    expect(result.flavors).toEqual(["dark", "milk", "white"]);
  });

  it("variant-catalog rejects missing name", async () => {
    const adapter = adapters.find((a) => a.id === "variant-catalog")!;
    await expect(adapter.execute({ basePrice: 100 }, {} as any)).rejects.toThrow("product name is required");
  });
});

describe("marketing adapter factories", () => {
  const repo = createMockRepository();
  const adapters = createMarketingAdapters(repo);

  it("creates 2 adapters", () => {
    expect(adapters).toHaveLength(2);
  });

  it("subscriber-manager upserts a subscriber", async () => {
    const adapter = adapters.find((a) => a.id === "subscriber-manager")!;
    const result = await adapter.execute({ email: "test@example.com", action: "upsert" }, {} as any) as any;
    expect(result.managed).toBe(true);
    expect(result.action).toBe("upsert");
  });

  it("subscriber-manager rejects missing email", async () => {
    const adapter = adapters.find((a) => a.id === "subscriber-manager")!;
    await expect(adapter.execute({}, {} as any)).rejects.toThrow("email is required");
  });

  it("campaign-sender sends campaign batch", async () => {
    const adapter = adapters.find((a) => a.id === "campaign-sender")!;
    const result = await adapter.execute({ campaignId: "campaign-1" }, {} as any) as any;
    expect(result.sent).toBe(true);
    expect(result.batchSize).toBeGreaterThanOrEqual(2);
  });

  it("campaign-sender rejects missing campaignId", async () => {
    const adapter = adapters.find((a) => a.id === "campaign-sender")!;
    await expect(adapter.execute({}, {} as any)).rejects.toThrow("campaignId is required");
  });
});

describe("inventory adapter factories", () => {
  const repo = createMockRepository();
  const adapters = createInventoryAdapters(repo);

  it("creates 1 adapter", () => {
    expect(adapters).toHaveLength(1);
  });

  it("inventory-tracker updates stock", async () => {
    const adapter = adapters.find((a) => a.id === "inventory-tracker")!;
    const result = await adapter.execute({
      productId: "product-1", sku: "product-1-red-M", quantityChange: -2,
    }, {} as any) as any;
    expect(result.updated).toBe(true);
    expect(result.item.quantity).toBe(8);
  });

  it("inventory-tracker rejects missing productId", async () => {
    const adapter = adapters.find((a) => a.id === "inventory-tracker")!;
    await expect(adapter.execute({ sku: "x", quantityChange: 1 }, {} as any)).rejects.toThrow("productId is required");
  });
});
