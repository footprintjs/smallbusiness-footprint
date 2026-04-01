/**
 * Business terminology definitions — the 12 configurable entity labels
 * per business type, derived from the charming-cherubs domain.
 */
import type { BusinessTermKey } from "../types.js";

/**
 * Complete terminology map: term key -> { default, per-business-type overrides }.
 * This is consumed by defineModule() in each business module.
 */
export const businessTerminology: Record<BusinessTermKey, Record<string, string>> = {
  customer: {
    default: "Customer",
    "kids-boutique": "Parent",
  },
  product: {
    default: "Product",
    "kids-boutique": "Outfit",
    "chocolate-shop": "Treat",
  },
  order: {
    default: "Order",
  },
  collection: {
    default: "Collection",
    "chocolate-shop": "Selection",
  },
  size: {
    default: "Size",
    "chocolate-shop": "Box Size",
  },
  color: {
    default: "Color",
    "chocolate-shop": "Flavor",
  },
  subscriber: {
    default: "Subscriber",
  },
  campaign: {
    default: "Campaign",
    "kids-boutique": "Newsletter",
    "chocolate-shop": "Promotion",
  },
  shipping: {
    default: "Shipping",
    "chocolate-shop": "Delivery",
  },
  inventory: {
    default: "Inventory",
    "kids-boutique": "Stock",
    "chocolate-shop": "Stock",
  },
  storefront: {
    default: "Storefront",
    "kids-boutique": "Shop",
    "chocolate-shop": "Shop",
  },
  variant: {
    default: "Variant",
    "kids-boutique": "Style",
    "chocolate-shop": "Variety",
  },
};

/**
 * Full terminology map with singular/plural forms.
 * Keyed by business type, each value is a complete map of all 12 terms.
 */
export const businessTerminologyFull: Record<
  string,
  Record<BusinessTermKey, { singular: string; plural: string }>
> = {
  default: {
    customer: { singular: "Customer", plural: "Customers" },
    product: { singular: "Product", plural: "Products" },
    order: { singular: "Order", plural: "Orders" },
    collection: { singular: "Collection", plural: "Collections" },
    size: { singular: "Size", plural: "Sizes" },
    color: { singular: "Color", plural: "Colors" },
    subscriber: { singular: "Subscriber", plural: "Subscribers" },
    campaign: { singular: "Campaign", plural: "Campaigns" },
    shipping: { singular: "Shipping", plural: "Shipments" },
    inventory: { singular: "Inventory", plural: "Inventory" },
    storefront: { singular: "Storefront", plural: "Storefronts" },
    variant: { singular: "Variant", plural: "Variants" },
  },
  "kids-boutique": {
    customer: { singular: "Parent", plural: "Parents" },
    product: { singular: "Outfit", plural: "Outfits" },
    order: { singular: "Order", plural: "Orders" },
    collection: { singular: "Collection", plural: "Collections" },
    size: { singular: "Size", plural: "Sizes" },
    color: { singular: "Color", plural: "Colors" },
    subscriber: { singular: "Subscriber", plural: "Subscribers" },
    campaign: { singular: "Newsletter", plural: "Newsletters" },
    shipping: { singular: "Shipping", plural: "Shipments" },
    inventory: { singular: "Stock", plural: "Stock" },
    storefront: { singular: "Shop", plural: "Shops" },
    variant: { singular: "Style", plural: "Styles" },
  },
  "chocolate-shop": {
    customer: { singular: "Customer", plural: "Customers" },
    product: { singular: "Treat", plural: "Treats" },
    order: { singular: "Order", plural: "Orders" },
    collection: { singular: "Selection", plural: "Selections" },
    size: { singular: "Box Size", plural: "Box Sizes" },
    color: { singular: "Flavor", plural: "Flavors" },
    subscriber: { singular: "Subscriber", plural: "Subscribers" },
    campaign: { singular: "Promotion", plural: "Promotions" },
    shipping: { singular: "Delivery", plural: "Deliveries" },
    inventory: { singular: "Stock", plural: "Stock" },
    storefront: { singular: "Shop", plural: "Shops" },
    variant: { singular: "Variety", plural: "Varieties" },
  },
};

/**
 * Resolve a full terminology label (singular + plural) for a given key and business type.
 * Falls back to kids-boutique defaults if the type is not found.
 */
export function resolveTerminologyLabel(
  key: BusinessTermKey,
  businessType: string,
): { singular: string; plural: string } {
  const typeTerms = businessTerminologyFull[businessType];
  if (typeTerms?.[key]) return typeTerms[key];
  return businessTerminologyFull.default[key] ?? { singular: key, plural: key };
}

/**
 * Get terminology for a specific domain (e.g., "catalog" modules get product/collection/variant terms).
 */
export function getTermsForDomain(domain: string): Record<string, Record<string, string>> {
  const domainTermMap: Record<string, BusinessTermKey[]> = {
    catalog: ["product", "collection", "variant", "color", "size"],
    orders: ["order", "shipping", "customer"],
    marketing: ["subscriber", "campaign"],
    operations: ["inventory", "storefront"],
  };

  const keys = domainTermMap[domain];
  if (!keys) return {};

  const result: Record<string, Record<string, string>> = {};
  for (const key of keys) {
    result[key] = businessTerminology[key];
  }
  return result;
}
