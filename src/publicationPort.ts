import { BusinessOperationError } from './operations.js';
import { validateBusinessCommand } from './commandValidation.js';
import type { BusinessOperation, BusinessOperationContext } from './operations.js';

export type BusinessPublicationSource = { kind: 'theme' | 'variant-set' | 'template' | 'hero' | 'draft'; id: string; page?: string };
export type BusinessThemeSchedule = { id: string; themeId: string; startDate: string; endDate?: string; enabled: boolean; label?: string };
export type BusinessPublicationPatch = { themeSchedule?: BusinessThemeSchedule[]; features?: { paymentEnabled?: boolean; shippingEnabled?: boolean; manualOrderMessage?: string }; componentOverrides?: Record<string, unknown> };
export type BusinessPublicationCommand =
  | { kind: 'activate'; expectedVersion: number; expectedRevision: number; source: BusinessPublicationSource; themeSchedule?: BusinessThemeSchedule[] }
  | { kind: 'archive-hero'; expectedVersion: number; expectedRevision: number; source: BusinessPublicationSource & { kind: 'hero' } }
  | { kind: 'patch'; expectedVersion: number; patch: BusinessPublicationPatch }
  | { kind: 'rollback'; expectedVersion: number; version: number };
export type BusinessPublicationReceipt = { config: { version: number; publication: { storeId: string; revision: number; publishedAt: string } }; source?: { revision: number }; traceRunId: string };
/** The implementation owns immutable snapshot/history/config CAS in ONE transaction. */
export type BusinessPublicationPort = { publish(command: BusinessPublicationCommand, context: BusinessOperationContext): Promise<BusinessPublicationReceipt> };
const version = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function invalid(): never { throw new BusinessOperationError('BUSINESS_INPUT_INVALID', 'Provide a supported publication command with captured revisions'); }
const only = (value: Record<string, unknown>, keys: readonly string[]) => { if (Object.keys(value).some(key => !keys.includes(key))) invalid(); };
function schedules(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) invalid();
  const ids = new Set<string>();
  for (const entry of value) {
    if (!object(entry)) invalid();
    only(entry, ['id', 'themeId', 'startDate', 'endDate', 'enabled', 'label']);
    if (entry.endDate === '') delete entry.endDate;
    if (!text(entry.id) || !text(entry.themeId) || !text(entry.startDate) || !Number.isFinite(Date.parse(entry.startDate)) || typeof entry.enabled !== 'boolean' || (entry.endDate !== undefined && (!text(entry.endDate) || !Number.isFinite(Date.parse(entry.endDate)) || Date.parse(entry.endDate) < Date.parse(entry.startDate))) || (entry.label !== undefined && (typeof entry.label !== 'string' || entry.label.length > 256)) || ids.has(entry.id)) invalid();
    ids.add(entry.id);
  }
}
export function parseBusinessPublicationCommand(raw: Readonly<Record<string, unknown>>): BusinessPublicationCommand {
  const input = structuredClone(raw);
  validateBusinessCommand('publish-storefront', input);
  if (!version(input.expectedVersion)) invalid();
  if (input.kind === 'activate' || input.kind === 'archive-hero') {
    only(input, input.kind === 'activate' ? ['kind', 'expectedVersion', 'expectedRevision', 'source', 'themeSchedule'] : ['kind', 'expectedVersion', 'expectedRevision', 'source']);
    const source = input.source;
    if (!version(input.expectedRevision) || !object(source)) invalid();
    only(source, ['kind', 'id', 'page']);
    if (!['theme', 'variant-set', 'template', 'hero', 'draft'].includes(String(source.kind)) || !text(source.id) || (source.page !== undefined && !text(source.page)) || (source.kind === 'template' && !text(source.page)) || (input.kind === 'archive-hero' && source.kind !== 'hero')) invalid();
    if (input.themeSchedule !== undefined) schedules(input.themeSchedule);
  } else if (input.kind === 'rollback') {
    only(input, ['kind', 'expectedVersion', 'version']);
    if (!version(input.version)) invalid();
  } else if (input.kind === 'patch') {
    only(input, ['kind', 'expectedVersion', 'patch']);
    if (!object(input.patch)) invalid();
    only(input.patch, ['features', 'themeSchedule', 'componentOverrides']);
    if (input.patch.features !== undefined) {
      if (!object(input.patch.features)) invalid();
      only(input.patch.features, ['paymentEnabled', 'shippingEnabled', 'manualOrderMessage']);
      for (const key of ['paymentEnabled', 'shippingEnabled']) if (input.patch.features[key] !== undefined && typeof input.patch.features[key] !== 'boolean') invalid();
      if (input.patch.features.manualOrderMessage !== undefined && (typeof input.patch.features.manualOrderMessage !== 'string' || input.patch.features.manualOrderMessage.length > 2000)) invalid();
    }
    if (input.patch.themeSchedule !== undefined) schedules(input.patch.themeSchedule);
    if (input.patch.componentOverrides !== undefined && !object(input.patch.componentOverrides)) invalid();
  } else invalid();
  return structuredClone(input) as BusinessPublicationCommand;
}
/** Wrap an existing authoritative workflow; this bridge performs no storage writes. */
export function createPublicationOperation(port: BusinessPublicationPort): BusinessOperation {
  return async (input, context) => {
    const command = parseBusinessPublicationCommand(input);
    const receipt = await port.publish(command, context);
    if (!receipt || receipt.config?.version !== command.expectedVersion + 1 || receipt.config.publication?.revision !== receipt.config.version || receipt.config.publication.storeId !== context.unitId || !text(receipt.traceRunId) || !text(receipt.config.publication.publishedAt) || !Number.isFinite(Date.parse(receipt.config.publication.publishedAt)) || ('expectedRevision' in command && receipt.source?.revision !== command.expectedRevision + 1)) throw new BusinessOperationError('BUSINESS_RECEIPT_INVALID', 'The publisher returned no matching committed revision');
    return { acknowledgement: 'committed', output: { ...receipt.config.publication, traceRunId: receipt.traceRunId, ...(receipt.source ? { sourceRevision: receipt.source.revision } : {}) }, response: receipt };
  };
}
