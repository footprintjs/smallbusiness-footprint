import { createBusinessOperationFlow, type BusinessFlowDependencies } from '../shared/businessFlow.js';
export function createCampaignCreateFlow(dependencies: BusinessFlowDependencies, t: (key: string) => string = key => key) {
  return createBusinessOperationFlow('create-campaign', dependencies, `Execute create-campaign for ${t('campaign')}`);
}
