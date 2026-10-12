import type { Adapter } from '@footprint/adapters';
import type { BusinessRepository } from '../types.js';
import type { BusinessOperations, BusinessScope } from '../operations.js';
import { operationAdapter } from './operationAdapter.js';
import type { BusinessAdapterOptions } from './operationAdapter.js';
export function createCatalogAdapters(_repository: BusinessRepository, operations: BusinessOperations = {}, scope?: BusinessScope, options?: BusinessAdapterOptions): readonly Adapter[] { return [
  operationAdapter('variant-catalog', 'create-product', 'create-product', operations, scope, options),
  operationAdapter('box-catalog', 'create-product', 'create-product', operations, scope, options),
  operationAdapter('catalog-update', 'update-product', 'update-product', operations, scope, options),
  operationAdapter('catalog-archive', 'archive-product', 'archive-product', operations, scope, options),
]; }
export const variantCatalogAdapter = operationAdapter('variant-catalog', 'create-product', 'create-product', {});
export const boxCatalogAdapter = operationAdapter('box-catalog', 'create-product', 'create-product', {});
export const allCatalogAdapters: readonly Adapter[] = [variantCatalogAdapter, boxCatalogAdapter];
