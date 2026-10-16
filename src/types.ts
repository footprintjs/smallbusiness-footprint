/**
 * Small-business e-commerce domain types that extend the generic blueprint types.
 */

/**
 * Built-in presets remain available; each platform admits only its registered profiles.
 */
export type DefaultBusinessType = "kids-boutique" | "chocolate-shop";
export type BusinessType = DefaultBusinessType | (string & {});

/**
 * Service enablement per business type.
 */
export type BusinessServices = {
  readonly [moduleId: string]: boolean;
  readonly catalog: boolean;
  readonly orders: boolean;
  readonly payments: boolean;
  readonly campaigns: boolean;
  readonly subscribers: boolean;
  readonly inventory: boolean;
  readonly storefront: boolean;
};

/**
 * Fulfillment pattern for a business type.
 */
export type FulfillmentPattern = "standard-shipping" | "local-delivery" | (string & {});

/**
 * Business type metadata — enriches the generic ProfileDefinition.
 */
export type BusinessTypeConfig = {
  readonly type: BusinessType;
  readonly displayName: string;
  readonly services: BusinessServices;
  readonly fulfillmentPattern: FulfillmentPattern;
  readonly theme: {
    readonly accent: string;
    readonly label: string;
  };
};

/**
 * The 12 configurable terminology keys for business entities.
 */
export type BusinessTermKey =
  | "customer"
  | "product"
  | "order"
  | "collection"
  | "size"
  | "color"
  | "subscriber"
  | "campaign"
  | "shipping"
  | "inventory"
  | "storefront"
  | "variant";

/**
 * Terminology label with singular/plural forms.
 */
export type TerminologyLabel = {
  readonly singular: string;
  readonly plural: string;
};

// ---------------------------------------------------------------------------
// Domain entities — concrete types for repository operations
// ---------------------------------------------------------------------------

export type OrderStatus =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "FULFILLING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELED"
  | "REFUNDED";

export type SubscriberStatus = "ACTIVE" | "UNSUBSCRIBED";

export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "SENDING"
  | "SENT"
  | "FAILED";

export type ProductStatus = "ACTIVE" | "ARCHIVED";

export type Product = {
  readonly id: string;
  readonly name: string;
  readonly basePrice: number;
  readonly originalPrice?: number;
  readonly description?: string;
  readonly images: readonly string[];
  readonly videos: readonly string[];
  readonly tags: readonly string[];
  readonly colors: readonly string[];
  readonly sizes: readonly string[];
  readonly status: ProductStatus;
  readonly seoTitle?: string;
  readonly seoDescription?: string;
  readonly seoSlug?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateProductInput = {
  readonly name: string;
  readonly basePrice: number;
  readonly originalPrice?: number;
  readonly description?: string;
  readonly images?: readonly string[];
  readonly videos?: readonly string[];
  readonly tags?: readonly string[];
  readonly colors?: readonly string[];
  readonly sizes?: readonly string[];
  readonly seoTitle?: string;
  readonly seoDescription?: string;
  readonly seoSlug?: string;
};

export type UpdateProductInput = {
  readonly id: string;
  readonly name?: string;
  readonly basePrice?: number;
  readonly originalPrice?: number;
  readonly description?: string;
  readonly images?: readonly string[];
  readonly videos?: readonly string[];
  readonly tags?: readonly string[];
  readonly colors?: readonly string[];
  readonly sizes?: readonly string[];
  readonly seoTitle?: string;
  readonly seoDescription?: string;
  readonly seoSlug?: string;
};

export type ListProductsQuery = {
  readonly status?: ProductStatus;
  readonly tag?: string;
  readonly limit?: number;
  readonly offset?: number;
};

export type OrderItem = {
  readonly id: string;
  readonly name: string;
  readonly imageUrl?: string;
  readonly color?: string;
  readonly size?: string;
  readonly quantity: number;
  readonly price: number;
};

export type CreateOrderItemInput = {
  readonly name: string;
  readonly imageUrl?: string;
  readonly color?: string;
  readonly size?: string;
  readonly quantity: number;
  readonly price: number;
};

export type ShippingInfo = {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone?: string;
  readonly address: string;
  readonly apartment?: string;
  readonly city: string;
  readonly state: string;
  readonly zipCode: string;
  /** Optional ISO 3166-1 alpha-2 code; the application owns allowed-country policy. */
  readonly country?: string;
};

export type Order = {
  readonly orderId: string;
  readonly email: string;
  readonly status: OrderStatus;
  readonly items: readonly OrderItem[];
  readonly shipping: ShippingInfo;
  readonly subtotal: number;
  readonly shippingCost: number;
  readonly total: number;
  readonly currency: string;
  readonly provider?: string;
  readonly providerSessionId?: string;
  readonly providerPaymentId?: string;
  /** Legacy Stripe field retained for existing stored records. */
  readonly stripeSessionId?: string;
  readonly stripePaymentIntentId?: string;
  readonly trackingNumber?: string;
  readonly trackingUrl?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateOrderInput = {
  readonly email: string;
  readonly items: readonly CreateOrderItemInput[];
  readonly shipping: ShippingInfo;
  readonly currency?: string;
};

export type ListOrdersQuery = {
  readonly status?: OrderStatus;
  readonly email?: string;
  readonly limit?: number;
  readonly offset?: number;
};

export type Subscriber = {
  readonly email: string;
  readonly name?: string;
  readonly status: SubscriberStatus;
  readonly tags: readonly string[];
  readonly source?: string;
  readonly unsubToken: string;
  readonly createdAt: string;
};

export type UpsertSubscriberInput = {
  readonly email: string;
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly source?: string;
};

export type ListSubscribersQuery = {
  readonly status?: SubscriberStatus;
  readonly limit?: number;
  readonly cursor?: string;
};

export type Campaign = {
  readonly campaignId: string;
  readonly label: string;
  readonly subject: string;
  readonly templateId?: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly status: CampaignStatus;
  readonly scheduleAt?: string;
  readonly sentCount: number;
  readonly failedCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateCampaignInput = {
  readonly label: string;
  readonly subject: string;
  readonly templateId?: string;
  readonly data?: Readonly<Record<string, unknown>>;
};

export type UpdateCampaignInput = {
  readonly campaignId: string;
  readonly label?: string;
  readonly subject?: string;
  readonly templateId?: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly status?: CampaignStatus;
  readonly scheduleAt?: string;
};

export type RecordSendResultInput = {
  readonly campaignId: string;
  readonly sentCount: number;
  readonly failedCount: number;
};

export type ListCampaignsQuery = {
  readonly status?: CampaignStatus;
  readonly limit?: number;
  readonly offset?: number;
};

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export type InventoryItem = {
  readonly productId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly reservedQuantity: number;
  readonly updatedAt: string;
};

export type UpdateStockInput = {
  readonly productId: string;
  readonly sku: string;
  readonly quantityChange: number;
};

// ---------------------------------------------------------------------------
// Repository interface — port for data operations
// ---------------------------------------------------------------------------

/**
 * Repository interface for business-specific data operations.
 * Consumers implement this to connect to their storage layer.
 */
export type BusinessRepository = {
  readonly createProduct: (input: CreateProductInput) => Promise<Product>;
  readonly updateProduct: (input: UpdateProductInput) => Promise<Product>;
  readonly getProduct: (id: string) => Promise<Product | undefined>;
  readonly listProducts: (query: ListProductsQuery) => Promise<readonly Product[]>;
  readonly archiveProduct: (id: string) => Promise<Product>;

  readonly createOrder: (input: CreateOrderInput) => Promise<Order>;
  readonly getOrder: (orderId: string) => Promise<Order | undefined>;
  readonly updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<Order>;
  readonly listOrders: (query: ListOrdersQuery) => Promise<readonly Order[]>;

  readonly getSubscriber: (email: string) => Promise<Subscriber | undefined>;
  readonly upsertSubscriber: (input: UpsertSubscriberInput) => Promise<Subscriber>;
  readonly unsubscribeByToken: (token: string) => Promise<Subscriber>;
  readonly listSubscribers: (query: ListSubscribersQuery) => Promise<readonly Subscriber[]>;

  readonly createCampaign: (input: CreateCampaignInput) => Promise<Campaign>;
  readonly updateCampaign: (input: UpdateCampaignInput) => Promise<Campaign>;
  readonly recordSendResult: (input: RecordSendResultInput) => Promise<Campaign>;
  readonly deleteCampaign: (campaignId: string) => Promise<void>;
  readonly getCampaign: (campaignId: string) => Promise<Campaign | undefined>;
  readonly listCampaigns: (query: ListCampaignsQuery) => Promise<readonly Campaign[]>;

  readonly getInventory: (productId: string) => Promise<readonly InventoryItem[]>;
  readonly updateStock: (input: UpdateStockInput) => Promise<InventoryItem>;
};

// ---------------------------------------------------------------------------
// Per-unit overrides
// ---------------------------------------------------------------------------

/**
 * Per-unit configuration overrides.
 * Individual shops can override terminology, module toggles, and theme.
 */
export type UnitOverrides = {
  /** Monotonic source version; keep a higher-revision tombstone on deletion. */
  readonly revision: number;
  readonly terminologyOverrides?: Partial<Readonly<Record<string, string>>>;
  readonly moduleToggles?: Partial<Readonly<Record<string, boolean>>>;
  readonly themeOverrides?: {
    readonly accent?: string;
    readonly label?: string;
  };
};

export type UnitOverrideStore = {
  readonly getOverrides: (scope: import('./operations.js').BusinessScope) => Promise<UnitOverrides | undefined>;
};

// ---------------------------------------------------------------------------
// Flow context
// ---------------------------------------------------------------------------

/**
 * Context passed through business flows.
 */
export type BusinessFlowContext = {
  readonly tenantId: string;
  readonly campusId?: string;
  readonly businessType: BusinessType;
  readonly unitId: string;
  readonly userId?: string;
  readonly repository?: BusinessRepository;
};

/** A repository instance is consumed only under a matching, explicit store scope. */
export type { BusinessScope, BusinessOperations, BusinessProviders, BusinessOperation, BusinessOperationReceipt, BusinessOperationContext } from './operations.js';
