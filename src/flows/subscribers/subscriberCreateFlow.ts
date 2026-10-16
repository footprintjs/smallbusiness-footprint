import { createBusinessOperationFlow, type BusinessFlowDependencies } from '../shared/businessFlow.js';
export function createSubscriberCreateFlow(dependencies: BusinessFlowDependencies, t: (key: string) => string = key => key) {
  return createBusinessOperationFlow('create-subscriber', dependencies, `Execute create-subscriber for ${t('subscriber')}`);
}
