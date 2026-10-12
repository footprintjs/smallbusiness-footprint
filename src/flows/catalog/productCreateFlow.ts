import { createBusinessOperationFlow, type BusinessFlowDependencies } from '../shared/businessFlow.js';
export function createProductCreateFlow(dependencies: BusinessFlowDependencies, t: (key: string) => string = key => key) {
  return createBusinessOperationFlow('create-product', dependencies, `Execute create-product for ${t('product')}`);
}
