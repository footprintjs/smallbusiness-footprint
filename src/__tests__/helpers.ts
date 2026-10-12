import type {
  BusinessRepository,
  Product,
  Order,
  Subscriber,
  Campaign,
  InventoryItem,
} from "../types.js";

/**
 * Create a mock repository for testing.
 * All operations succeed with predictable results.
 */
export function createMockRepository(): BusinessRepository {
  let productIdCounter = 0;
  let orderIdCounter = 0;
  let campaignIdCounter = 0;
  const now = () => new Date().toISOString();

  return {
    async createProduct(input): Promise<Product> {
      productIdCounter++;
      return {
        id: `product-${productIdCounter}`,
        name: input.name,
        basePrice: input.basePrice,
        originalPrice: input.originalPrice,
        description: input.description,
        images: input.images ? [...input.images] : [],
        videos: input.videos ? [...input.videos] : [],
        tags: input.tags ? [...input.tags] : [],
        colors: input.colors ? [...input.colors] : [],
        sizes: input.sizes ? [...input.sizes] : [],
        status: "ACTIVE",
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        seoSlug: input.seoSlug,
        createdAt: now(),
        updatedAt: now(),
      };
    },
    async updateProduct(input): Promise<Product> {
      return {
        id: input.id,
        name: input.name ?? "Updated Product",
        basePrice: input.basePrice ?? 1000,
        images: input.images ? [...input.images] : [],
        videos: input.videos ? [...input.videos] : [],
        tags: input.tags ? [...input.tags] : [],
        colors: input.colors ? [...input.colors] : [],
        sizes: input.sizes ? [...input.sizes] : [],
        status: "ACTIVE",
        createdAt: now(),
        updatedAt: now(),
      };
    },
    async getProduct(id): Promise<Product | undefined> {
      return {
        id, name: "Test Product", basePrice: 1000,
        images: [], videos: [], tags: [], colors: [], sizes: [],
        status: "ACTIVE", createdAt: now(), updatedAt: now(),
      };
    },
    async listProducts(): Promise<readonly Product[]> {
      return [];
    },
    async archiveProduct(id): Promise<Product> {
      return {
        id, name: "Archived Product", basePrice: 1000,
        images: [], videos: [], tags: [], colors: [], sizes: [],
        status: "ARCHIVED", createdAt: now(), updatedAt: now(),
      };
    },
    async createOrder(input): Promise<Order> {
      orderIdCounter++;
      const subtotal = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      return {
        orderId: `order-${orderIdCounter}`,
        email: input.email,
        status: "CREATED",
        items: input.items.map((item, i) => ({
          id: `item-${i + 1}`, name: item.name, imageUrl: item.imageUrl,
          color: item.color, size: item.size, quantity: item.quantity, price: item.price,
        })),
        shipping: input.shipping,
        subtotal, shippingCost: 500, total: subtotal + 500,
        currency: input.currency ?? "usd",
        createdAt: now(), updatedAt: now(),
      };
    },
    async getOrder(orderId): Promise<Order | undefined> {
      return {
        orderId, email: "test@example.com", status: "CREATED", items: [],
        shipping: { firstName: "Test", lastName: "User", email: "test@example.com", address: "123 Main St", city: "Anytown", state: "CA", zipCode: "90210" },
        subtotal: 1000, shippingCost: 500, total: 1500, currency: "usd",
        createdAt: now(), updatedAt: now(),
      };
    },
    async updateOrderStatus(orderId, status): Promise<Order> {
      return {
        orderId, email: "test@example.com", status, items: [],
        shipping: { firstName: "Test", lastName: "User", email: "test@example.com", address: "123 Main St", city: "Anytown", state: "CA", zipCode: "90210" },
        subtotal: 1000, shippingCost: 500, total: 1500, currency: "usd",
        createdAt: now(), updatedAt: now(),
      };
    },
    async listOrders(): Promise<readonly Order[]> {
      return [];
    },
    async getSubscriber(email): Promise<Subscriber | undefined> {
      return {
        email, status: "ACTIVE", tags: [],
        unsubToken: `token-${email.replace("@", "-at-")}`,
        createdAt: now(),
      };
    },
    async upsertSubscriber(input): Promise<Subscriber> {
      return {
        email: input.email, name: input.name, status: "ACTIVE",
        tags: input.tags ? [...input.tags] : [],
        source: input.source ?? "signup",
        unsubToken: `token-${input.email.replace("@", "-at-")}`,
        createdAt: now(),
      };
    },
    async unsubscribeByToken(token): Promise<Subscriber> {
      return {
        email: `unsubscribed-${token}@example.com`, status: "UNSUBSCRIBED",
        tags: [], unsubToken: token, createdAt: now(),
      };
    },
    async listSubscribers(): Promise<readonly Subscriber[]> {
      return [
        { email: "sub1@example.com", status: "ACTIVE", tags: [], unsubToken: "tok-1", createdAt: now() },
        { email: "sub2@example.com", status: "ACTIVE", tags: [], unsubToken: "tok-2", createdAt: now() },
      ];
    },
    async createCampaign(input): Promise<Campaign> {
      campaignIdCounter++;
      return {
        campaignId: `campaign-${campaignIdCounter}`, label: input.label,
        subject: input.subject, templateId: input.templateId,
        data: input.data ?? {}, status: "DRAFT",
        sentCount: 0, failedCount: 0, createdAt: now(), updatedAt: now(),
      };
    },
    async updateCampaign(input): Promise<Campaign> {
      return {
        campaignId: input.campaignId, label: input.label ?? "Updated Campaign",
        subject: input.subject ?? "Updated Subject", templateId: input.templateId,
        data: input.data ?? {}, status: input.status ?? "DRAFT",
        scheduleAt: input.scheduleAt,
        sentCount: 0, failedCount: 0, createdAt: now(), updatedAt: now(),
      };
    },
    async recordSendResult(input): Promise<Campaign> {
      return {
        campaignId: input.campaignId, label: "Campaign",
        subject: "Subject", data: {},
        status: "SENT", sentCount: input.sentCount,
        failedCount: input.failedCount, createdAt: now(), updatedAt: now(),
      };
    },
    async deleteCampaign(): Promise<void> {},
    async getCampaign(campaignId): Promise<Campaign | undefined> {
      return {
        campaignId, label: "Test Campaign", subject: "Test Subject",
        data: {}, status: "SCHEDULED",
        sentCount: 0, failedCount: 0, createdAt: now(), updatedAt: now(),
      };
    },
    async listCampaigns(): Promise<readonly Campaign[]> {
      return [];
    },
    async getInventory(productId): Promise<readonly InventoryItem[]> {
      return [{ productId, sku: `${productId}-default`, quantity: 10, reservedQuantity: 0, updatedAt: now() }];
    },
    async updateStock(input): Promise<InventoryItem> {
      return { productId: input.productId, sku: input.sku, quantity: 10 + input.quantityChange, reservedQuantity: 0, updatedAt: now() };
    },
  };
}

import { createMemoryProfileStore } from '@footprint/platform';
import { createBusinessPlatform } from '../businessPlatform.js';
import type { BusinessPlatformConfig } from '../businessPlatform.js';
export const fixtureScope = { tenantId: 'tenant-fixture', unitId: 'shop-fixture' };
export const fixtureContext = { ...fixtureScope, userId: 'admin-fixture' };
export const validCheckout = { idempotencyKey: 'command-key', items: [{ productId: 'product-1', quantity: 1 }], shipping: { firstName: 'Private', lastName: 'Customer', email: 'PRIVATE@example.test', address: 'PRIVATE STREET', city: 'Town', state: 'CA', zipCode: '12345' } };
export function createFixturePlatform(options: Partial<BusinessPlatformConfig> = {}, profileType = 'kids-boutique') {
  const scope = options.scope ?? fixtureScope;
  return createBusinessPlatform({ profileStore: createMemoryProfileStore([{ ...scope, profileType, revision: 1, createdAt: '2030-01-01T00:00:00Z' }]), repository: createMockRepository(), scope, authorizer: () => true, ...options });
}
