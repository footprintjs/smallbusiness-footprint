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



export const updateProduct: Capability = { id: 'update-product', name: 'Update Product', domain: 'catalog', description: 'Update an existing product' };
export const archiveProduct: Capability = { id: 'archive-product', name: 'Archive Product', domain: 'catalog', description: 'Archive a product' };
export const unsubscribeSubscriber: Capability = { id: 'unsubscribe', name: 'Unsubscribe', domain: 'marketing', description: 'Validate an unsubscribe command' };
export const createCampaignCapability: Capability = { id: 'create-campaign', name: 'Create Campaign', domain: 'marketing', description: 'Create a campaign draft' };
export const scheduleCampaignCapability: Capability = { id: 'schedule-campaign', name: 'Schedule Campaign', domain: 'marketing', description: 'Delegate durable campaign scheduling' };
export const publishStorefront: Capability = { id: 'publish-storefront', name: 'Publish Storefront', domain: 'operations', description: 'Delegate immutable version-checked publication' };

export const allBusinessCapabilities: readonly Capability[] = [
  updateProduct, archiveProduct, unsubscribeSubscriber, createCampaignCapability, scheduleCampaignCapability, publishStorefront,
  createProduct,
  createOrder,
  processPayment,
  sendCampaign,
  manageInventory,
  manageSubscribers,
];
