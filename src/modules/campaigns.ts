import { defineModule } from "footprint-blueprint/features";
import { getTermsForDomain } from "../terminology/businessTerms.js";

export const campaigns = defineModule({
  id: "campaigns",
  name: "Email Campaigns",
  description: "Campaign creation, scheduling, and batch sending",
  domain: "marketing",
  requires: ["subscribers"],
  terminology: getTermsForDomain("marketing"),
  roles: {
    canManageCampaigns: ["Owner", "Admin"],
  },
  seed: {
    default: { batchSize: 25 },
  },
});
