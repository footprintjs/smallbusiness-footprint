import type { Capability } from "@footprint/adapters";

/**
 * Business-domain capability contracts.
 * Each capability defines WHAT needs to be done — adapters define HOW.
 */

export const createProduct: Capability = {
  id: "create-product",
  name: "Create Product",
  domain: "catalog",
  description: "Add a new product to the catalog with type-specific variant handling",
};

export const createOrder: Capability = {
  id: "create-order",
  name: "Create Order",
  domain: "orders",
  description: "Process a new order with type-specific fulfillment handling",
};

export const processPayment: Capability = {
  id: "process-payment",
  name: "Process Payment",
  domain: "payments",
  description: "Process payment for an order via the configured payment gateway",
};

export const sendCampaign: Capability = {
  id: "send-campaign",
  name: "Send Campaign",
  domain: "marketing",
  description: "Send a campaign email batch to active subscribers",
};

export const manageInventory: Capability = {
  id: "manage-inventory",
  name: "Manage Inventory",
  domain: "operations",
  description: "Track and update stock levels for products and variants",
};

export const manageSubscribers: Capability = {
  id: "manage-subscribers",
  name: "Manage Subscribers",
  domain: "marketing",
  description: "Subscribe, unsubscribe, and manage email list members",
};

export const allBusinessCapabilities: readonly Capability[] = [
  createProduct,
  createOrder,
  processPayment,
  sendCampaign,
  manageInventory,
  manageSubscribers,
];
