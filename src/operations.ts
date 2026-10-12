import type { BusinessRepository, BusinessType } from './types.js';

export type BusinessScope = { readonly tenantId: string; readonly unitId: string; readonly campusId?: string };
export type BusinessOperationContext = BusinessScope & { readonly businessType: BusinessType; readonly userId?: string };
export type BusinessAcknowledgement = 'committed' | 'held' | 'pending' | 'scheduled' | 'accepted';
export type BusinessOperationReceipt = { readonly acknowledgement: BusinessAcknowledgement; readonly output: Readonly<Record<string, unknown>>; readonly response?: unknown };
export type BusinessOperation = (input: Readonly<Record<string, unknown>>, context: BusinessOperationContext) => Promise<BusinessOperationReceipt>;
export type BusinessOperations = Readonly<Partial<Record<string, BusinessOperation>>>;
/** These ports delegate to authoritative application workflows, not CRUD status changes. */
export type BusinessProviders = {
  readonly checkout?: { reserve: BusinessOperation };
  readonly payments?: { start: BusinessOperation };
  readonly campaigns?: { schedule: BusinessOperation; sendBatch: BusinessOperation };
  readonly inventory?: { adjust: BusinessOperation };
  readonly publication?: { publish: BusinessOperation };
};
export class BusinessOperationError extends Error {
  constructor(readonly code: 'BUSINESS_UNSUPPORTED' | 'BUSINESS_SCOPE_MISMATCH' | 'BUSINESS_INPUT_INVALID' | 'BUSINESS_OPERATION_FAILED' | 'BUSINESS_RECEIPT_INVALID', message: string) { super(message); this.name = 'BusinessOperationError'; }
}
export function assertBusinessScope(expected: BusinessScope | undefined, actual: BusinessScope) {
  if (!expected || !expected.tenantId || !expected.unitId || actual.tenantId !== expected.tenantId || actual.unitId !== expected.unitId || actual.campusId !== expected.campusId) throw new BusinessOperationError('BUSINESS_SCOPE_MISMATCH', 'This operation is not bound to the requested store');
}
const safeKeys = new Set(['productId', 'orderId', 'attemptId', 'campaignId', 'storeId', 'revision', 'sourceRevision', 'inventoryRevision', 'status', 'state', 'reservationState', 'outcome', 'provider', 'traceRunId', 'sentCount', 'failedCount', 'batchSize', 'quantity', 'reservedQuantity', 'publishedAt', 'scheduleAt']);
export function safeBusinessOutput(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (!safeKeys.has(key)) continue;
    if (typeof field === 'number' && Number.isFinite(field)) output[key] = field;
    else if (typeof field === 'boolean') output[key] = field;
    else if (typeof field === 'string' && field.length <= 256 && !/@|https?:\/\/|[\r\n]/i.test(field)) output[key] = field;
  }
  return output;
}
export function validateBusinessReceipt(value: unknown): BusinessOperationReceipt {
  if (!value || typeof value !== 'object') throw new BusinessOperationError('BUSINESS_RECEIPT_INVALID', 'The operation returned no authoritative acknowledgement');
  const receipt = value as Partial<BusinessOperationReceipt>;
  if (!['committed', 'held', 'pending', 'scheduled', 'accepted'].includes(receipt.acknowledgement ?? '') || !receipt.output || typeof receipt.output !== 'object' || Array.isArray(receipt.output)) throw new BusinessOperationError('BUSINESS_RECEIPT_INVALID', 'The operation returned an invalid acknowledgement');
  return receipt as BusinessOperationReceipt;
}
export function createBusinessOperations(repo: BusinessRepository | undefined, providers: BusinessProviders = {}, overrides: BusinessOperations = {}): BusinessOperations {
  const base: Record<string, BusinessOperation> = repo ? {
    'create-product': async input => { const value = await repo.createProduct(input as Parameters<BusinessRepository['createProduct']>[0]); return { acknowledgement: 'committed', output: { productId: value.id, status: value.status } }; },
    'update-product': async input => { const value = await repo.updateProduct(input as Parameters<BusinessRepository['updateProduct']>[0]); return { acknowledgement: 'committed', output: { productId: value.id, status: value.status } }; },
    'archive-product': async input => { const value = await repo.archiveProduct(String(input.id)); return { acknowledgement: 'committed', output: { productId: value.id, status: value.status } }; },
    'create-subscriber': async input => { const value = await repo.upsertSubscriber({ ...input, email: String(input.email).trim().toLowerCase() } as Parameters<BusinessRepository['upsertSubscriber']>[0]); return { acknowledgement: 'committed', output: { status: value.status } }; },
    'unsubscribe': async input => { const value = await repo.unsubscribeByToken(String(input.token)); return { acknowledgement: 'committed', output: { status: value.status } }; },
    'create-campaign': async input => { const value = await repo.createCampaign({ ...input, label: typeof input.label === 'string' ? input.label : 'Untitled Campaign' } as Parameters<BusinessRepository['createCampaign']>[0]); return { acknowledgement: 'committed', output: { campaignId: value.campaignId, status: value.status } }; },
  } : {};
  const configured = { 'create-order': providers.checkout?.reserve, 'process-payment': providers.payments?.start, 'schedule-campaign': providers.campaigns?.schedule, 'send-campaign-batch': providers.campaigns?.sendBatch, 'update-stock': providers.inventory?.adjust, 'publish-storefront': providers.publication?.publish };
  for (const [key, handler] of Object.entries(configured)) if (handler) base[key] = handler;
  return { ...base, ...overrides };
}

export function safeBusinessFailure(error: unknown, actionId: string): BusinessOperationError {
  const messages = { BUSINESS_UNSUPPORTED: 'This operation is not configured', BUSINESS_SCOPE_MISMATCH: 'The operation does not match this store', BUSINESS_INPUT_INVALID: 'The operation input is invalid', BUSINESS_RECEIPT_INVALID: 'The operation returned no valid acknowledgement', BUSINESS_OPERATION_FAILED: `${actionId} is temporarily unavailable` };
  const code = error instanceof BusinessOperationError ? error.code : 'BUSINESS_OPERATION_FAILED';
  return new BusinessOperationError(code, messages[code]);
}
