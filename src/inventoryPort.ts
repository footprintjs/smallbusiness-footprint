import { BusinessOperationError } from './operations.js';
import { validateBusinessCommand } from './commandValidation.js';
import type { BusinessOperation, BusinessOperationContext } from './operations.js';
export type BusinessInventoryCommand = { productId: string; sku: string; quantityChange: number; expectedRevision: number; idempotencyKey: string };
export type BusinessInventoryReceipt = { productId: string; sku: string; inventoryRevision: number; quantity: number; reservedQuantity: number };
/** Must atomically CAS inventory, preserve reservations, and deduplicate the command key. */
export type BusinessInventoryPort = { adjust(command: BusinessInventoryCommand, context: BusinessOperationContext): Promise<BusinessInventoryReceipt> };
export function createInventoryOperation(port: BusinessInventoryPort): BusinessOperation {
  return async (input, context) => {
    validateBusinessCommand('update-stock', input);
    if (typeof input.productId !== 'string' || !input.productId || typeof input.sku !== 'string' || !input.sku || typeof input.idempotencyKey !== 'string' || !input.idempotencyKey || !Number.isSafeInteger(input.quantityChange) || !Number.isSafeInteger(input.expectedRevision) || ((input.expectedRevision as number) < 0 || input.expectedRevision === Number.MAX_SAFE_INTEGER)) throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'Provide a stock command with its revision and idempotency key');
    const command = structuredClone(input) as BusinessInventoryCommand;
    const receipt = await port.adjust(command, context);
    if (!receipt || receipt.productId !== command.productId || receipt.sku !== command.sku || receipt.inventoryRevision !== command.expectedRevision + 1 || !Number.isSafeInteger(receipt.quantity) || receipt.quantity < 0 || !Number.isSafeInteger(receipt.reservedQuantity) || receipt.reservedQuantity < 0) throw new BusinessOperationError('BUSINESS_RECEIPT_INVALID', 'The stock operation returned no matching committed revision');
    return { acknowledgement: 'committed', output: { ...receipt, productId: command.productId } };
  };
}
