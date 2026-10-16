// Main entry point
export { createBusinessPlatform } from "./businessPlatform.js";
export type { BusinessPlatform, BusinessPlatformConfig, BusinessDefinitions } from "./businessPlatform.js";

// Types
export type {
  BusinessType,
  DefaultBusinessType,
  BusinessServices,
  FulfillmentPattern,
  BusinessTypeConfig,
  BusinessTermKey,
  TerminologyLabel,
  OrderStatus,
  SubscriberStatus,
  CampaignStatus,
  ProductStatus,
  Product,
  CreateProductInput,
  UpdateProductInput,
  ListProductsQuery,
  OrderItem,
  CreateOrderItemInput,
  ShippingInfo,
  Order,
  CreateOrderInput,
  ListOrdersQuery,
  Subscriber,
  UpsertSubscriberInput,
  ListSubscribersQuery,
  Campaign,
  CreateCampaignInput,
  UpdateCampaignInput,
  RecordSendResultInput,
  ListCampaignsQuery,
  InventoryItem,
  UpdateStockInput,
  BusinessRepository,
  UnitOverrides,
  UnitOverrideStore,
  BusinessFlowContext,
} from "./types.js";

// Modules
export {
  catalog,
  orders,
  payments,
  subscribers,
  campaigns,
  inventory,
  storefront,
  allBusinessModules,
} from "./modules/index.js";

// Profiles
export {
  kidsBoutiqueProfile,
  chocolateShopProfile,
  allBusinessProfiles,
  businessTypeConfigs,
  toBusinessTypeConfig,
} from "./profiles/index.js";

// Capabilities
export {
  createProduct,
  createOrder,
  processPayment,
  sendCampaign,
  manageInventory,
  manageSubscribers,
  allBusinessCapabilities,
} from "./capabilities/index.js";

// Adapters
export {
  createFulfillmentAdapters,
  standardShippingAdapter,
  localDeliveryAdapter,
  allFulfillmentAdapters,
  createPaymentAdapters,
  checkoutPaymentAdapter,
  stripeCheckoutAdapter,
  allPaymentAdapters,
  createCatalogAdapters,
  variantCatalogAdapter,
  boxCatalogAdapter,
  allCatalogAdapters,
  createMarketingAdapters,
  subscriberManagerAdapter,
  campaignSenderAdapter,
  allMarketingAdapters,
  createInventoryAdapters,
  inventoryTrackerAdapter,
  allInventoryAdapters,
  businessAdapterMappings,
} from "./adapters/index.js";

// Actions
export {
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
  updateStockAction,
  publishStorefrontAction,
  allBusinessActions,
} from "./actions/index.js";

// Flows
export {
  createProductCreateFlow,
  createProductUpdateFlow,
  createOrderCreateFlow,
  createSubscriberCreateFlow,
  createSubscriberUnsubscribeFlow,
  createCampaignCreateFlow,
  createCampaignScheduleFlow,
  createCampaignSendBatchFlow,
  createBusinessServiceRegistry,
  resolveFlowBuilder,
  resolveActionBranchId,
  getRegisteredActionIds,
  getActionFlowEntry,
  buildActionDispatch,
} from "./flows/index.js";
export type {
  BusinessServiceRegistry,
  BusinessServiceResult,
  BuiltServiceFlow,
  ServiceDescription,
  FlowBuilder,
  ActionFlowEntry,
  ActionFlowRegistry,
  ActionDispatch,
  ActionBranch,
} from "./flows/index.js";
export type { BusinessAdapterOptions } from './adapters/index.js';

// Terminology
export {
  businessTerminology,
  businessTerminologyFull,
  resolveTerminologyLabel,
  getTermsForDomain,
} from "./terminology/businessTerms.js";

// Helpers
export {
  BUSINESS_TYPES_LIST,
  isValidBusinessType,
  getAllBusinessTypeConfigs,
  getBusinessTypeConfig,
  getAllBusinessProfiles,
  resolveBusinessTerminology,
  getBusinessModuleRegistry,
  createStubRepository,
  createConfigPlatform,
  createPlatformForRequest,
  checkFlowError,
  pluralize,
} from "./helpers.js";

// Overrides
export { createMemoryOverrideStore } from "./overrides/unitOverrides.js";

// Re-exports from footprint-blueprint
export {
  createMemoryProfileStore,
  createTenantContext,
  createFeatureGate,
  createTermResolver,
  resolveProfileConfig,
  createServiceBridge,
} from "footprint-blueprint/platform";
export type {
  TenantContext,
  ProfileStore,
  ProfileBinding,
  ResolvedProfileConfig,
  MCPToolDefinition,
  ActionResult,
} from "footprint-blueprint/platform";

export { createBusinessOperations, BusinessOperationError, assertBusinessScope, safeBusinessOutput } from './operations.js';
export type { BusinessScope, BusinessOperations, BusinessProviders, BusinessOperation, BusinessOperationReceipt, BusinessOperationContext, BusinessAcknowledgement } from './operations.js';
export type { BusinessServiceOptions, PreparedBusinessOperation, BusinessTermResolver } from './flows/businessServiceComposer.js';
export { createBusinessOperationFlow } from './flows/shared/businessFlow.js';
export type { BusinessFlowDependencies, BusinessFlowChart } from './flows/shared/businessFlow.js';


export { createPublicationOperation, parseBusinessPublicationCommand } from './publicationPort.js';
export type { BusinessPublicationPort, BusinessPublicationCommand, BusinessPublicationReceipt, BusinessPublicationSource, BusinessPublicationPatch, BusinessThemeSchedule } from './publicationPort.js';
export { createInventoryOperation } from './inventoryPort.js';
export type { BusinessInventoryPort, BusinessInventoryCommand, BusinessInventoryReceipt } from './inventoryPort.js';
export { createCheckoutOperation } from './checkoutPort.js';
export type { BusinessCheckoutPort, BusinessCheckoutCommand, BusinessCheckoutReceipt } from './checkoutPort.js';
