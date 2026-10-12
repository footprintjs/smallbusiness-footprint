import { createBusinessOperationFlow, type BusinessFlowDependencies } from '../shared/businessFlow.js';
export function createOrderCreateFlow(dependencies: BusinessFlowDependencies, t: (key: string) => string = key => key) {
  return createBusinessOperationFlow('create-order', dependencies, `Execute create-order for ${t('order')}`);
}
