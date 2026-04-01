import { defineModule } from "@footprint/features";
import { getTermsForDomain } from "../terminology/businessTerms.js";

export const orders = defineModule({
  id: "orders",
  name: "Order Management",
  description: "Order lifecycle, shipping, and fulfillment tracking",
  domain: "orders",
  requires: ["catalog"],
  terminology: getTermsForDomain("orders"),
  roles: {
    canManageOrders: ["Owner", "Admin", "Staff"],
    canViewOrders: ["Owner", "Admin", "Staff"],
  },
  seed: {
    default: { statuses: ["CREATED", "PAID", "SHIPPED"] },
  },
});
