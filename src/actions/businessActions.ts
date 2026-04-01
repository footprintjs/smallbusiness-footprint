import type { ActionDefinition } from "@footprint/actions";

/**
 * Business-domain action definitions.
 * Each action maps to a business operation that can be exported as MCP tools.
 */

export const createProductAction: ActionDefinition = {
  id: "create-product",
  name: "Create Product",
  description: "Add a new product to the catalog",
  domain: "catalog",
  category: "crud",
  requiredModules: ["catalog"],
  capabilityId: "create-product",
  parameters: [
    { name: "name", type: "string", required: true, description: "Product name" },
    { name: "basePrice", type: "number", required: true, description: "Base price in cents" },
    { name: "description", type: "string", required: false, description: "Product description" },
    { name: "colors", type: "object", required: false, description: "Available colors" },
    { name: "sizes", type: "object", required: false, description: "Available sizes" },
    { name: "images", type: "object", required: false, description: "Image URLs" },
    { name: "tags", type: "object", required: false, description: "Product tags" },
  ],
};

export const updateProductAction: ActionDefinition = {
  id: "update-product",
  name: "Update Product",
  description: "Update an existing product's details",
  domain: "catalog",
  category: "crud",
  requiredModules: ["catalog"],
  capabilityId: "create-product",
  parameters: [
    { name: "id", type: "string", required: true, description: "Product ID" },
    { name: "name", type: "string", required: false, description: "New product name" },
    { name: "basePrice", type: "number", required: false, description: "New base price in cents" },
    { name: "description", type: "string", required: false, description: "New description" },
  ],
};

export const archiveProductAction: ActionDefinition = {
  id: "archive-product",
  name: "Archive Product",
  description: "Archive a product, removing it from the active catalog",
  domain: "catalog",
  category: "crud",
  requiredModules: ["catalog"],
  parameters: [
    { name: "id", type: "string", required: true, description: "Product ID to archive" },
  ],
};

export const createOrderAction: ActionDefinition = {
  id: "create-order",
  name: "Create Order",
  description: "Create a new order with cart items and shipping details",
  domain: "orders",
  category: "crud",
  requiredModules: ["orders"],
  capabilityId: "create-order",
  parameters: [
    { name: "email", type: "string", required: true, description: "Customer email" },
    { name: "items", type: "object", required: true, description: "Cart items array" },
    { name: "shipping", type: "object", required: true, description: "Shipping address details" },
    { name: "currency", type: "string", required: false, description: "Currency code (default: usd)" },
  ],
};

export const processPaymentAction: ActionDefinition = {
  id: "process-payment",
  name: "Process Payment",
  description: "Process payment for an existing order",
  domain: "payments",
  category: "workflow",
  requiredModules: ["payments"],
  capabilityId: "process-payment",
  parameters: [
    { name: "orderId", type: "string", required: true, description: "Order ID to process payment for" },
  ],
};

export const createSubscriberAction: ActionDefinition = {
  id: "create-subscriber",
  name: "Create Subscriber",
  description: "Add or update an email subscriber",
  domain: "marketing",
  category: "crud",
  requiredModules: ["subscribers"],
  capabilityId: "manage-subscribers",
  parameters: [
    { name: "email", type: "string", required: true, description: "Subscriber email" },
    { name: "name", type: "string", required: false, description: "Subscriber name" },
    { name: "tags", type: "object", required: false, description: "Subscriber tags" },
    { name: "source", type: "string", required: false, description: "Signup source" },
  ],
};

export const unsubscribeAction: ActionDefinition = {
  id: "unsubscribe",
  name: "Unsubscribe",
  description: "Unsubscribe an email subscriber using their unsubscribe token",
  domain: "marketing",
  category: "workflow",
  requiredModules: ["subscribers"],
  capabilityId: "manage-subscribers",
  parameters: [
    { name: "token", type: "string", required: true, description: "Unsubscribe token" },
  ],
};

export const createCampaignAction: ActionDefinition = {
  id: "create-campaign",
  name: "Create Campaign",
  description: "Create a new email campaign draft",
  domain: "marketing",
  category: "crud",
  requiredModules: ["campaigns"],
  parameters: [
    { name: "label", type: "string", required: true, description: "Campaign name" },
    { name: "subject", type: "string", required: true, description: "Email subject line" },
    { name: "templateId", type: "string", required: false, description: "Email template ID" },
    { name: "data", type: "object", required: false, description: "Template variable data" },
  ],
};

export const scheduleCampaignAction: ActionDefinition = {
  id: "schedule-campaign",
  name: "Schedule Campaign",
  description: "Schedule a campaign for future delivery",
  domain: "marketing",
  category: "workflow",
  requiredModules: ["campaigns"],
  parameters: [
    { name: "campaignId", type: "string", required: true, description: "Campaign ID to schedule" },
    { name: "scheduleAt", type: "string", required: true, description: "ISO datetime for delivery" },
  ],
};

export const sendCampaignBatchAction: ActionDefinition = {
  id: "send-campaign-batch",
  name: "Send Campaign Batch",
  description: "Send a batch of campaign emails to active subscribers",
  domain: "marketing",
  category: "workflow",
  requiredModules: ["campaigns", "subscribers"],
  capabilityId: "send-campaign",
  parameters: [
    { name: "campaignId", type: "string", required: true, description: "Campaign ID to send" },
  ],
};

export const allBusinessActions: readonly ActionDefinition[] = [
  createProductAction,
  updateProductAction,
  archiveProductAction,
  createOrderAction,
  processPaymentAction,
  createSubscriberAction,
  unsubscribeAction,
  createCampaignAction,
  scheduleCampaignAction,
  sendCampaignBatchAction,
];
