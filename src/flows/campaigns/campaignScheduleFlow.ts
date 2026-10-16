import { createBusinessOperationFlow, type BusinessFlowDependencies } from '../shared/businessFlow.js';
export function createCampaignScheduleFlow(dependencies: BusinessFlowDependencies, t: (key: string) => string = key => key) {
  return createBusinessOperationFlow('schedule-campaign', dependencies, `Execute schedule-campaign for ${t('campaign')}`);
}
