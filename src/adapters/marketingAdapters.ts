import type { Adapter } from '@footprint/adapters';
import type { BusinessRepository } from '../types.js';
import type { BusinessOperations, BusinessScope } from '../operations.js';
import { operationAdapter } from './operationAdapter.js';
import type { BusinessAdapterOptions } from './operationAdapter.js';
export function createMarketingAdapters(_repository: BusinessRepository, operations: BusinessOperations = {}, scope?: BusinessScope, options?: BusinessAdapterOptions): readonly Adapter[] { return [
  operationAdapter('subscriber-manager', 'manage-subscribers', 'create-subscriber', operations, scope, options),
  operationAdapter('campaign-sender', 'send-campaign', 'send-campaign-batch', operations, scope, options),
 ]; }
export const subscriberManagerAdapter: Adapter = operationAdapter('subscriber-manager', 'manage-subscribers', 'create-subscriber', {});
export const campaignSenderAdapter: Adapter = operationAdapter('campaign-sender', 'send-campaign', 'send-campaign-batch', {});
export const allMarketingAdapters: readonly Adapter[] = [subscriberManagerAdapter, campaignSenderAdapter];
