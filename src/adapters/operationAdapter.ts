import type { Adapter } from 'footprint-blueprint/adapters';
import { validateActionInput } from 'footprint-blueprint/actions';
import { allBusinessActions } from '../actions/businessActions.js';
import { defineProfile } from 'footprint-blueprint/features';
import type { ProfileDefinition } from 'footprint-blueprint/features';
import { allBusinessProfiles } from '../profiles/index.js';
import { assertBusinessScope, BusinessOperationError, safeBusinessOutput, validateBusinessReceipt, safeBusinessFailure } from '../operations.js';
import type { BusinessOperations, BusinessOperationContext, BusinessScope } from '../operations.js';
export type BusinessAdapterOptions = { readonly profiles?: readonly ProfileDefinition[] };
export function operationAdapter(id: string, capabilityId: string, actionId: string, operations: BusinessOperations, scope?: BusinessScope, options: BusinessAdapterOptions = {}): Adapter {
  const boundScope = scope ? Object.freeze({ ...scope }) : undefined;
  const profiles = new Set((options.profiles ?? allBusinessProfiles).map(profile => defineProfile(profile).type));
  return { id, name: id, capabilityId, async execute(value, context) {
    const identity = context as unknown as Partial<BusinessOperationContext> & { profileType?: string };
    assertBusinessScope(boundScope, { tenantId: identity.tenantId ?? '', unitId: identity.unitId ?? '', ...(identity.campusId ? { campusId: identity.campusId } : {}) });
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'Provide an object command');
    const operation = Object.hasOwn(operations, actionId) ? operations[actionId] : undefined;
    if (!operation) throw new BusinessOperationError('BUSINESS_UNSUPPORTED', `No authoritative implementation is configured for ${actionId}`);
    const type = identity.businessType ?? identity.profileType;
    if (identity.businessType && identity.profileType && identity.businessType !== identity.profileType) throw new BusinessOperationError('BUSINESS_SCOPE_MISMATCH', 'Business profile context does not match');
    if (!type || !profiles.has(type)) throw new BusinessOperationError('BUSINESS_SCOPE_MISMATCH', 'Unknown business profile');
    const action = allBusinessActions.find(item => item.id === actionId);
    if (!action) throw new BusinessOperationError('BUSINESS_UNSUPPORTED', 'Unknown business action');
    validateActionInput(action, value);
    try { const receipt = validateBusinessReceipt(await operation(value as Record<string, unknown>, { ...boundScope!, businessType: type, ...(identity.userId ? { userId: identity.userId } : {}) })); return { acknowledgement: receipt.acknowledgement, output: safeBusinessOutput(receipt.output) }; }
    catch (error) { throw safeBusinessFailure(error, actionId); }
  } };
}
