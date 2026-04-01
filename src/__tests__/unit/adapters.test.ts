import { describe, it, expect } from "vitest";
import {
  allBusinessCapabilities,
  createProduct,
  createOrder,
  processPayment,
  sendCampaign,
  manageInventory,
  manageSubscribers,
} from "../../capabilities/index.js";
import {
  allFulfillmentAdapters,
  allPaymentAdapters,
  allCatalogAdapters,
  allMarketingAdapters,
  allInventoryAdapters,
  standardShippingAdapter,
  localDeliveryAdapter,
  stripeCheckoutAdapter,
  variantCatalogAdapter,
  boxCatalogAdapter,
  subscriberManagerAdapter,
  campaignSenderAdapter,
  inventoryTrackerAdapter,
  businessAdapterMappings,
} from "../../adapters/index.js";

describe("business capabilities", () => {
  it("defines 6 capabilities", () => {
    expect(allBusinessCapabilities).toHaveLength(6);
  });

  it("all capabilities have valid IDs, names, and domains", () => {
    for (const cap of allBusinessCapabilities) {
      expect(cap.id).toBeTruthy();
      expect(cap.name).toBeTruthy();
      expect(cap.domain).toBeTruthy();
      expect(cap.description).toBeTruthy();
    }
  });

  it("capability IDs are unique", () => {
    const ids = allBusinessCapabilities.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("capabilities map to expected domains", () => {
    expect(createProduct.domain).toBe("catalog");
    expect(createOrder.domain).toBe("orders");
    expect(processPayment.domain).toBe("payments");
    expect(sendCampaign.domain).toBe("marketing");
    expect(manageInventory.domain).toBe("operations");
    expect(manageSubscribers.domain).toBe("marketing");
  });
});

describe("static adapters", () => {
  it("defines 2 fulfillment adapters", () => {
    expect(allFulfillmentAdapters).toHaveLength(2);
  });

  it("defines 1 payment adapter", () => {
    expect(allPaymentAdapters).toHaveLength(1);
  });

  it("defines 2 catalog adapters", () => {
    expect(allCatalogAdapters).toHaveLength(2);
  });

  it("defines 2 marketing adapters", () => {
    expect(allMarketingAdapters).toHaveLength(2);
  });

  it("defines 1 inventory adapter", () => {
    expect(allInventoryAdapters).toHaveLength(1);
  });

  it("all adapters have valid IDs and capability links", () => {
    const allAdapters = [...allFulfillmentAdapters, ...allPaymentAdapters, ...allCatalogAdapters, ...allMarketingAdapters, ...allInventoryAdapters];
    for (const adapter of allAdapters) {
      expect(adapter.id).toBeTruthy();
      expect(adapter.name).toBeTruthy();
      expect(adapter.capabilityId).toBeTruthy();
    }
  });

  it("adapter IDs are unique across all adapter groups", () => {
    const allAdapters = [...allFulfillmentAdapters, ...allPaymentAdapters, ...allCatalogAdapters, ...allMarketingAdapters, ...allInventoryAdapters];
    const ids = allAdapters.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fulfillment adapters link to create-order capability", () => {
    expect(standardShippingAdapter.capabilityId).toBe("create-order");
    expect(localDeliveryAdapter.capabilityId).toBe("create-order");
  });

  it("payment adapter links to process-payment capability", () => {
    expect(stripeCheckoutAdapter.capabilityId).toBe("process-payment");
  });

  it("catalog adapters link to create-product capability", () => {
    expect(variantCatalogAdapter.capabilityId).toBe("create-product");
    expect(boxCatalogAdapter.capabilityId).toBe("create-product");
  });

  it("marketing adapters link to correct capabilities", () => {
    expect(subscriberManagerAdapter.capabilityId).toBe("manage-subscribers");
    expect(campaignSenderAdapter.capabilityId).toBe("send-campaign");
  });

  it("inventory adapter links to manage-inventory capability", () => {
    expect(inventoryTrackerAdapter.capabilityId).toBe("manage-inventory");
  });

  it("static stubs throw when execute is called", async () => {
    for (const adapter of [...allFulfillmentAdapters, ...allPaymentAdapters, ...allCatalogAdapters, ...allMarketingAdapters, ...allInventoryAdapters]) {
      await expect(adapter.execute({}, {} as any)).rejects.toThrow("Static adapter stub invoked");
    }
  });
});

describe("adapter mappings", () => {
  it("defines 6 mappings (one per capability)", () => {
    expect(businessAdapterMappings).toHaveLength(6);
  });

  it("each mapping covers both business types", () => {
    for (const mapping of businessAdapterMappings) {
      expect(mapping.profileAdapters).toHaveProperty("kids-boutique");
      expect(mapping.profileAdapters).toHaveProperty("chocolate-shop");
    }
  });

  it("create-order routes to correct adapters", () => {
    const mapping = businessAdapterMappings.find((m) => m.capabilityId === "create-order");
    expect(mapping?.profileAdapters["kids-boutique"]).toBe("standard-shipping");
    expect(mapping?.profileAdapters["chocolate-shop"]).toBe("local-delivery");
  });

  it("create-product routes to correct adapters", () => {
    const mapping = businessAdapterMappings.find((m) => m.capabilityId === "create-product");
    expect(mapping?.profileAdapters["kids-boutique"]).toBe("variant-catalog");
    expect(mapping?.profileAdapters["chocolate-shop"]).toBe("box-catalog");
  });

  it("process-payment routes to stripe for both types", () => {
    const mapping = businessAdapterMappings.find((m) => m.capabilityId === "process-payment");
    expect(mapping?.profileAdapters["kids-boutique"]).toBe("stripe-checkout");
    expect(mapping?.profileAdapters["chocolate-shop"]).toBe("stripe-checkout");
  });
});
