import { defineModule } from "@footprint/features";
import { getTermsForDomain } from "../terminology/businessTerms.js";

export const subscribers = defineModule({
  id: "subscribers",
  name: "Subscriber Management",
  description: "Email list management, subscribe and unsubscribe flows",
  domain: "marketing",
  terminology: getTermsForDomain("marketing"),
  roles: {
    canManageSubscribers: ["Owner", "Admin"],
  },
  seed: {
    default: { sources: ["signup", "checkout", "import"] },
  },
});
