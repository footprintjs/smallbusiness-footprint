import { defineModule } from "@footprint/features";
import { getTermsForDomain } from "../terminology/businessTerms.js";

export const storefront = defineModule({
  id: "storefront",
  name: "Storefront Configuration",
  description: "Theme, SEO, store settings, and public-facing configuration",
  domain: "operations",
  requires: ["catalog"],
  terminology: getTermsForDomain("operations"),
  roles: {
    canManageStorefront: ["Owner", "Admin"],
  },
  seed: {
    "kids-boutique": { heroStyle: "playful", showAgeRange: true },
    "chocolate-shop": { heroStyle: "elegant", showAgeRange: false },
  },
});
