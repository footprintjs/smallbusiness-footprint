import { BusinessOperationError } from './operations.js';
import { validateBusinessCommand } from './commandValidation.js';
import type { BusinessOperation, BusinessOperationContext } from './operations.js';
import type { ShippingInfo } from './types.js';
export type BusinessCheckoutCommand = { idempotencyKey: string; items: Array<{ productId: string; quantity: number; color?: string; size?: string }>; shipping: ShippingInfo; emailVerificationToken?: string };
export type BusinessCheckoutReceipt = { orderId: string; attemptId: string; state: string; reservationState: 'HELD' | 'COMMITTED' | 'RELEASED'; traceRunId: string; checkoutToken?: string };
/** Owns proof verification when required, server pricing, whole-cart atomic reservation, command deduplication and recovery. */
export type BusinessCheckoutPort = { reserve(command: BusinessCheckoutCommand, context: BusinessOperationContext): Promise<BusinessCheckoutReceipt> };
export function createCheckoutOperation(port: BusinessCheckoutPort): BusinessOperation {
  return async (input, context) => {
    validateBusinessCommand('create-order', input);
    if (typeof input.idempotencyKey !== 'string' || !input.idempotencyKey || !Array.isArray(input.items) || !input.items.length || !input.shipping || typeof input.shipping !== 'object') throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'Provide a checkout command with its idempotency key');
    for (const value of input.items) { const item = value as { productId?: unknown; quantity?: unknown }; if (!item || typeof item.productId !== 'string' || !item.productId || !Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1) throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'Checkout lines need product identity and positive whole quantities'); }
    const receipt = await port.reserve(structuredClone(input) as BusinessCheckoutCommand, context);
    if (!receipt?.orderId || !receipt.attemptId || !receipt.traceRunId || !['HELD', 'COMMITTED', 'RELEASED'].includes(receipt.reservationState) || (receipt.reservationState === 'COMMITTED' && receipt.state !== 'PAID')) throw new BusinessOperationError('BUSINESS_RECEIPT_INVALID', 'The checkout returned no matching durable identity');
    return { acknowledgement: receipt.reservationState === 'COMMITTED' ? 'committed' : receipt.reservationState === 'HELD' ? 'held' : 'accepted', output: { orderId: receipt.orderId, attemptId: receipt.attemptId, state: receipt.state, reservationState: receipt.reservationState, traceRunId: receipt.traceRunId }, response: receipt };
  };
}
