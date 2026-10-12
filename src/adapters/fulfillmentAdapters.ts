import type { Adapter } from '@footprint/adapters';
import type { BusinessRepository } from '../types.js';
import type { BusinessOperations, BusinessScope } from '../operations.js';
import { operationAdapter } from './operationAdapter.js';
import type { BusinessAdapterOptions } from './operationAdapter.js';
export function createFulfillmentAdapters(_repository: BusinessRepository, operations: BusinessOperations = {}, scope?: BusinessScope, options?: BusinessAdapterOptions): readonly Adapter[] { return [
  operationAdapter('standard-shipping', 'create-order', 'create-order', operations, scope, options),
  operationAdapter('local-delivery', 'create-order', 'create-order', operations, scope, options),
 ]; }
export const standardShippingAdapter: Adapter = operationAdapter('standard-shipping', 'create-order', 'create-order', {});
export const localDeliveryAdapter: Adapter = operationAdapter('local-delivery', 'create-order', 'create-order', {});
export const allFulfillmentAdapters: readonly Adapter[] = [standardShippingAdapter, localDeliveryAdapter];
