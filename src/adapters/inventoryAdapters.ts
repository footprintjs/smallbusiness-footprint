import type { Adapter } from 'footprint-blueprint/adapters';
import type { BusinessRepository } from '../types.js';
import type { BusinessOperations, BusinessScope } from '../operations.js';
import { operationAdapter } from './operationAdapter.js';
import type { BusinessAdapterOptions } from './operationAdapter.js';
export function createInventoryAdapters(_repository: BusinessRepository, operations: BusinessOperations = {}, scope?: BusinessScope, options?: BusinessAdapterOptions): readonly Adapter[] { return [
  operationAdapter('inventory-tracker', 'manage-inventory', 'update-stock', operations, scope, options),
 ]; }
export const inventoryTrackerAdapter: Adapter = operationAdapter('inventory-tracker', 'manage-inventory', 'update-stock', {});
export const allInventoryAdapters: readonly Adapter[] = [inventoryTrackerAdapter];
