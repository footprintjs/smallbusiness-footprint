import { defineModule } from "@footprint/features";
import { getTermsForDomain } from "../terminology/businessTerms.js";

export const catalog = defineModule({
  id: "catalog",
  name: "Product Catalog",
  description: "Product management, variants, media, and SEO",
  domain: "catalog",
  terminology: getTermsForDomain("catalog"),
  roles: {
    canManageProducts: ["Owner", "Admin"],
  },
  seed: {
    "kids-boutique": { sampleProducts: 5, categories: ["dresses", "rompers", "accessories"] },
    "chocolate-shop": { sampleProducts: 5, categories: ["truffles", "bars", "gift-boxes"] },
  },
});
