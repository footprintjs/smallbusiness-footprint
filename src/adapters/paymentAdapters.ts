import type { Adapter } from 'footprint-blueprint/adapters';
import type { BusinessRepository } from '../types.js';
import type { BusinessOperations, BusinessScope } from '../operations.js';
import { operationAdapter } from './operationAdapter.js';
import type { BusinessAdapterOptions } from './operationAdapter.js';
export function createPaymentAdapters(_repository: BusinessRepository, operations: BusinessOperations = {}, scope?: BusinessScope, options?: BusinessAdapterOptions): readonly Adapter[] { return [
  operationAdapter('checkout-payment', 'process-payment', 'process-payment', operations, scope, options),
 ]; }
export const checkoutPaymentAdapter: Adapter = operationAdapter('checkout-payment', 'process-payment', 'process-payment', {});
/** Legacy explicit adapter ID; the default payment adapter is provider-neutral. */
export const stripeCheckoutAdapter: Adapter = operationAdapter('stripe-checkout', 'process-payment', 'process-payment', {});
export const allPaymentAdapters: readonly Adapter[] = [checkoutPaymentAdapter];
