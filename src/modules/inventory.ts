import { defineModule } from "@footprint/features";
import { getTermsForDomain } from "../terminology/businessTerms.js";

export const inventory = defineModule({
  id: "inventory",
  name: "Inventory Tracking",
  description: "Stock levels, variant inventory, and availability",
  domain: "operations",
  requires: ["catalog"],
  terminology: getTermsForDomain("operations"),
  roles: {
    canManageInventory: ["Owner", "Admin", "Staff"],
  },
  seed: {
    default: { trackVariants: true },
  },
});
