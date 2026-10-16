import { createBusinessOperationFlow, type BusinessFlowDependencies } from '../shared/businessFlow.js';
export function createSubscriberUnsubscribeFlow(dependencies: BusinessFlowDependencies, t: (key: string) => string = key => key) {
  return createBusinessOperationFlow('unsubscribe', dependencies, `Execute unsubscribe for ${t('subscriber')}`);
}
