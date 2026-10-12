import { createBusinessOperationFlow, type BusinessFlowDependencies } from '../shared/businessFlow.js';
export function createCampaignSendBatchFlow(dependencies: BusinessFlowDependencies, t: (key: string) => string = key => key) {
  return createBusinessOperationFlow('send-campaign-batch', dependencies, `Execute send-campaign-batch for ${t('campaign')}`);
}
