import type { AdapterMapping } from "@footprint/adapters";

/**
 * Maps capabilities to adapters per business type.
 * Same operation routes to a different implementation per business type.
 */
export const businessAdapterMappings: readonly AdapterMapping[] = [
  { capabilityId: 'update-product', profileAdapters: { 'kids-boutique': 'catalog-update', 'chocolate-shop': 'catalog-update' } },
  { capabilityId: 'archive-product', profileAdapters: { 'kids-boutique': 'catalog-archive', 'chocolate-shop': 'catalog-archive' } },
  {
    capabilityId: "create-order",
    profileAdapters: {
      "kids-boutique": "standard-shipping",
      "chocolate-shop": "local-delivery",
    },
  },
  {
    capabilityId: "process-payment",
    profileAdapters: {
      "kids-boutique": "checkout-payment",
      "chocolate-shop": "checkout-payment",
    },
  },
  {
    capabilityId: "create-product",
    profileAdapters: {
      "kids-boutique": "variant-catalog",
      "chocolate-shop": "box-catalog",
    },
  },
  {
    capabilityId: "send-campaign",
    profileAdapters: {
      "kids-boutique": "campaign-sender",
      "chocolate-shop": "campaign-sender",
    },
  },
  {
    capabilityId: "manage-subscribers",
    profileAdapters: {
      "kids-boutique": "subscriber-manager",
      "chocolate-shop": "subscriber-manager",
    },
  },
  {
    capabilityId: "manage-inventory",
    profileAdapters: {
      "kids-boutique": "inventory-tracker",
      "chocolate-shop": "inventory-tracker",
    },
  },
];
