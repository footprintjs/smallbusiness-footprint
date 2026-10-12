import { defineModule } from "footprint-blueprint/features";
import { getTermsForDomain } from "../terminology/businessTerms.js";

export const payments = defineModule({
  id: "payments",
  name: "Payment Processing",
  description: "Payment gateway integration and checkout flows",
  domain: "payments",
  requires: ["orders"],
  terminology: getTermsForDomain("orders"),
  roles: {
    canProcessPayments: ["Owner", "Admin"],
  },
  seed: {
    default: { gateway: "stripe" },
  },
});
