/** Browser-safe after-sales contracts. Authentication and provider/storage adapters belong to the host. */
export type AfterSalesKind = 'cancellation' | 'return';
export type AfterSalesState = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RETURN_RECEIVED' | 'INSPECTION_FAILED' | 'REFUND_PENDING' | 'REFUND_UNKNOWN' | 'REFUND_FAILED' | 'REFUNDED';
export type AfterSalesItems = readonly { readonly lineId: string; readonly quantity: number }[];
export type AfterSalesPolicy = { readonly version: string; readonly returnWindowDays: number; readonly requireUnworn: boolean; readonly requireTags: boolean; readonly cancellationEnabled?: boolean; readonly returnsEnabled?: boolean };
export const DEFAULT_AFTER_SALES_POLICY: AfterSalesPolicy = Object.freeze({ version: 'returns-v1', returnWindowDays: 30, requireUnworn: true, requireTags: true, cancellationEnabled: true, returnsEnabled: true });
export function validateAfterSalesPolicy(value: unknown): AfterSalesPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new AfterSalesError('AFTERSALES_INVALID', 'The policy is invalid');
  const allowed = ['version', 'returnWindowDays', 'requireUnworn', 'requireTags', 'cancellationEnabled', 'returnsEnabled'];
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !allowed.includes(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new AfterSalesError('AFTERSALES_INVALID', 'The policy is invalid');
  }
  const policy = value as AfterSalesPolicy;
  if (typeof policy.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(policy.version)
    || !Number.isSafeInteger(policy.returnWindowDays) || policy.returnWindowDays < 1 || policy.returnWindowDays > 365
    || typeof policy.requireUnworn !== 'boolean' || typeof policy.requireTags !== 'boolean'
    || policy.cancellationEnabled !== undefined && typeof policy.cancellationEnabled !== 'boolean'
    || policy.returnsEnabled !== undefined && typeof policy.returnsEnabled !== 'boolean') throw new AfterSalesError('AFTERSALES_INVALID', 'The policy is invalid');
  return Object.freeze({ ...policy, cancellationEnabled: policy.cancellationEnabled ?? true, returnsEnabled: policy.returnsEnabled ?? true });
}
export type AfterSalesContext = { readonly actorId: string; readonly role: 'customer' | 'owner' };
export type AfterSalesPayment = { readonly provider: string; readonly paymentId: string; readonly currency: string; readonly mode: 'test' | 'production'; readonly capturedCents: number; readonly refundedCents: number };
export type AfterSalesOrderLine = { readonly lineId: string; readonly productId: string; readonly color: string; readonly size: string; readonly quantity: number; readonly unitPriceCents: number; readonly tracked: boolean };
export type AfterSalesOrder = { readonly storeId: string; readonly orderId: string; readonly version: number; readonly status: 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled'; readonly deliveredAt?: string; readonly shippedAt?: string; readonly fulfillmentLocked: boolean; readonly items: readonly AfterSalesOrderLine[]; readonly payment: AfterSalesPayment; readonly refundReservedCents: number; readonly allocatedQuantities: Readonly<Record<string, number>> };
export type AfterSalesRefundEvidence = { readonly provider: string; readonly refundId: string; readonly paymentId: string; readonly idempotencyKey: string; readonly amountCents: number; readonly currency: string; readonly mode: 'test' | 'production'; readonly status: 'pending' | 'succeeded' | 'failed' };
export type AfterSalesRefundIntent = { readonly intentId: string; readonly idempotencyKey: string; readonly payment: AfterSalesPayment; readonly amountCents: number; readonly status: 'PREPARED' | 'PENDING' | 'UNKNOWN' | 'SUCCEEDED' | 'FAILED'; readonly preparedAt: string; readonly providerRefundId?: string };
export type AfterSalesCase = { readonly caseId: string; readonly storeId: string; readonly orderId: string; readonly kind: AfterSalesKind; readonly state: AfterSalesState; readonly version: number; readonly requestId: string; readonly items: AfterSalesItems; readonly policy: AfterSalesPolicy; readonly reason?: string; readonly ownerReason?: string; readonly condition?: { readonly unworn: boolean; readonly tagsAttached: boolean }; readonly createdAt: string; readonly updatedAt: string; readonly approvedAt?: string; readonly approvedBy?: string; readonly inspection?: { readonly accepted: boolean; readonly receivedAt: string; readonly receivedBy: string }; readonly refund?: AfterSalesRefundIntent; readonly restock?: { readonly requested: boolean; readonly completedAt?: string } };
export type AfterSalesRequest = { readonly orderId: string; readonly requestId: string; readonly kind: AfterSalesKind; readonly items: AfterSalesItems; readonly reason?: string; readonly unworn?: boolean; readonly tagsAttached?: boolean };
export type AfterSalesAction =
  | { readonly action: 'approve' | 'reject'; readonly caseId: string; readonly expectedVersion: number; readonly reason?: string }
  | { readonly action: 'receive'; readonly caseId: string; readonly expectedVersion: number; readonly accepted: boolean; readonly reason?: string }
  | { readonly action: 'refund'; readonly caseId: string; readonly expectedVersion: number; readonly amountCents: number; readonly restock?: boolean }
  | { readonly action: 'reconcile'; readonly caseId: string; readonly expectedVersion: number };
export type AfterSalesErrorCode = 'AFTERSALES_INVALID' | 'AFTERSALES_UNAUTHORIZED' | 'AFTERSALES_NOT_FOUND' | 'AFTERSALES_INELIGIBLE' | 'AFTERSALES_CONFLICT' | 'AFTERSALES_PROVIDER_UNKNOWN' | 'AFTERSALES_STORAGE_UNAVAILABLE';
export class AfterSalesError extends Error { constructor(readonly code: AfterSalesErrorCode, message: string) { super(message); this.name = 'AfterSalesError'; } }

/** Each repository is bound to one store. Its atomic invariants are part of the adapter contract. */
export interface AfterSalesRepository {
  getOrder(orderId: string): Promise<AfterSalesOrder | undefined>;
  getCase(caseId: string): Promise<AfterSalesCase | undefined>;
  findCase(orderId: string, requestId: string): Promise<AfterSalesCase | undefined>;
  /** Atomically deduplicate requestId, claim available item quantities and, for cancellation, acquire a fulfillment hold only if no shipping/label claim has won. Same key with different command must conflict. */
  createCase(input: { record: AfterSalesCase; expectedOrderVersion: number }): Promise<AfterSalesCase>;
  /** CAS the case. Rejection releases item allocations and a matching cancellation hold atomically. */
  saveCase(input: { record: AfterSalesCase; expectedVersion: number }): Promise<AfterSalesCase>;
  /** CAS case AND order version; persist intent and reserve amount atomically against captured - refunded - all pending reservations. Cancellation must still hold fulfillment; never acquire after carrier handoff/label claim. */
  prepareRefund(input: { record: AfterSalesCase; expectedVersion: number; expectedOrderVersion: number }): Promise<AfterSalesCase>;
  /** CAS case + order; success moves reserved cents to refunded, pending/unknown keep the reservation, confirmed failure releases amount. Do not release item allocations on confirmed refund. */
  completeRefund(input: { record: AfterSalesCase; expectedVersion: number; orderDisposition: 'cancelled' | 'hold-for-review' | 'unchanged' }): Promise<AfterSalesCase>;
  /** Atomic exactly-once inventory change + case restock marker. Only confirmed refunds and accepted return inspections qualify. Replayed commands never increment inventory twice. */
  restock(input: { record: AfterSalesCase; expectedVersion: number; items: readonly (AfterSalesOrderLine & { readonly quantity: number })[] }): Promise<AfterSalesCase>;
}
export interface AfterSalesPayments {
  getPayment(input: { orderId: string; paymentId: string }): Promise<AfterSalesPayment>;
  refund(input: { orderId: string; caseId: string; paymentId: string; amountCents: number; currency: string; idempotencyKey: string; preparedAt: string }): Promise<AfterSalesRefundEvidence>;
  retrieveRefund(input: { orderId: string; paymentId: string; refundId: string; idempotencyKey: string }): Promise<AfterSalesRefundEvidence>;
  /** A missing result is uncertainty, never permission to create another refund/key. */
  findRefund(input: { orderId: string; paymentId: string; idempotencyKey: string }): Promise<AfterSalesRefundEvidence | undefined>;
}
export type AfterSalesTrace = { readonly flowId: 'aftersales-request' | 'aftersales-action'; readonly runId: string; readonly startedAt: string; readonly finishedAt: string; readonly outcome: 'ok' | 'error'; readonly stages: readonly string[]; readonly decisions: readonly string[]; readonly code?: AfterSalesErrorCode; readonly nativeSnapshot: import('footprintjs').RuntimeSnapshot; readonly flowSpec: import('footprintjs/advanced').SerializedPipelineStructure; readonly narrative: readonly import('footprintjs').CombinedNarrativeEntry[]; readonly runtime?: { readonly library: 'footprintjs'; readonly version: string } };
