import { validateActionInput } from 'footprint-blueprint/actions';
import { allBusinessActions } from './actions/businessActions.js';
import { BusinessOperationError } from './operations.js';

/** Provider bridges also validate when called outside Platform.prepareAction. */
export function validateBusinessCommand(actionId: string, input: unknown): void {
  const action = allBusinessActions.find(item => item.id === actionId);
  if (!action) throw new BusinessOperationError('BUSINESS_UNSUPPORTED', 'Unknown business operation');
  try { validateActionInput(action, input); }
  catch { throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'The operation input is invalid'); }
}
