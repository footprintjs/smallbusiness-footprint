/** Optional, configuration-only developer entry. Does not import an executor or evaluate a flow builder. */
import { allBusinessActions } from '../actions/businessActions.js';
import type { DeveloperConfiguredFlowRegistry, DeveloperFieldContract, DeveloperFlowDescription, DeveloperFlowRegistration, DeveloperSourceManifest, DeveloperSourceReference, DeveloperSourceSelector } from './types.js';
export type * from './types.js';

const envelopeFile = 'src/flows/shared/businessFlow.ts';
const wrappers: Readonly<Record<string, readonly [string, string]>> = {
  'create-product': ['src/flows/catalog/productCreateFlow.ts', 'createProductCreateFlow'],
  'update-product': ['src/flows/catalog/productUpdateFlow.ts', 'createProductUpdateFlow'],
  'create-order': ['src/flows/orders/orderCreateFlow.ts', 'createOrderCreateFlow'],
  'create-subscriber': ['src/flows/subscribers/subscriberCreateFlow.ts', 'createSubscriberCreateFlow'],
  unsubscribe: ['src/flows/subscribers/subscriberUnsubscribeFlow.ts', 'createSubscriberUnsubscribeFlow'],
  'create-campaign': ['src/flows/campaigns/campaignCreateFlow.ts', 'createCampaignCreateFlow'],
  'schedule-campaign': ['src/flows/campaigns/campaignScheduleFlow.ts', 'createCampaignScheduleFlow'],
  'send-campaign-batch': ['src/flows/campaigns/campaignSendBatchFlow.ts', 'createCampaignSendBatchFlow'],
};
const contracts: Readonly<Record<string, string>> = {
  'create-order': 'BusinessCheckoutPort.reserve', 'process-payment': 'BusinessProviders.payments.start',
  'schedule-campaign': 'BusinessProviders.campaigns.schedule', 'send-campaign-batch': 'BusinessProviders.campaigns.sendBatch',
  'update-stock': 'BusinessInventoryPort.adjust', 'publish-storefront': 'BusinessPublicationPort.publish',
};
const ownValue = (value: object | undefined, key: string): unknown => value && Object.getOwnPropertyDescriptor(value, key)?.value;
const names = (value: object | undefined): string[] => value ? Object.keys(value).filter(key => Object.getOwnPropertyDescriptor(value, key)?.value !== undefined) : [];
const fieldPath = /^[A-Za-z_$][\w$]*(?:\[\]|\.[A-Za-z_$][\w$]*)*$/;
// Static descriptor data must not execute getters/toJSON hooks or retain a closure.
function staticRegistration(value: unknown): DeveloperFlowRegistration | undefined {
  const seen = new Set<object>(); let entries = 0;
  function copy(item: unknown, depth: number): unknown {
    if (item === undefined || item === null || ['string','boolean','number'].includes(typeof item)) return item;
    if (!item || typeof item !== 'object' || depth > 12 || seen.has(item) || ++entries > 4000) throw new Error('Non-static descriptor');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw new Error('Non-static descriptor');
    seen.add(item); const descriptors = Object.getOwnPropertyDescriptors(item);
    const result: Record<string, unknown> | unknown[] = Array.isArray(item) ? [] : Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(item) && key === 'length') continue;
      if (!Object.hasOwn(descriptor, 'value')) throw new Error('Accessor descriptor');
      Object.defineProperty(result, key, {value: copy(descriptor.value, depth + 1), enumerable: true, configurable: true, writable: true});
    }
    seen.delete(item); return result;
  }
  try {
    const copied = copy(value, 0);
    if (!copied || typeof copied !== 'object' || Array.isArray(copied)) return undefined;
    const item = copied as DeveloperFlowRegistration;
    const text = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length <= max;
    const selector = (v: DeveloperSourceSelector | undefined) => !v || (typeof v === 'object' && text(v.file, 4096) && [v.symbol,v.unitId,v.stageId,v.role].every(x => x === undefined || text(x)));
    if ((item.description !== undefined && !text(item.description)) || !selector(item.source)) return undefined;
    if (item.stages !== undefined && (!Array.isArray(item.stages) || item.stages.length > 512 || !item.stages.every(s => s && text(s.id, 128) && selector(s.source)))) return undefined;
    if (item.fields !== undefined && (!Array.isArray(item.fields) || item.fields.length > 512 || !item.fields.every(f => f && text(f.path) && fieldPath.test(f.path) && ['library','host','unknown'].includes(f.owner) && ['read','write','input'].includes(f.access) && selector(f.source)))) return undefined;
    if (item.operation && (!text(item.operation.owner) || (item.operation.contract !== undefined && !text(item.operation.contract)))) return undefined;
    return item;
  } catch { return undefined; }
}

export function resolveDeveloperSource(manifest: DeveloperSourceManifest | undefined, selector: DeveloperSourceSelector | undefined): DeveloperSourceReference {
  selector = selector ? {file: selector.file, ...(selector.symbol !== undefined ? {symbol:selector.symbol} : {}), ...(selector.unitId !== undefined ? {unitId:selector.unitId} : {}), ...(selector.stageId !== undefined ? {stageId:selector.stageId} : {}), ...(selector.role !== undefined ? {role:selector.role} : {})} : undefined;
  const unknown = (reason: string): DeveloperSourceReference => ({ status: 'unknown', ...(selector ? { selector } : {}), reason, freshness: 'not-checked', authenticity: 'caller-trusted-build' });
  if (!selector) return unknown('No static source registration was provided');
  if (!manifest || manifest.schemaVersion !== 1 || manifest.scope !== 'source-only-static-syntax') return unknown('No supported source manifest was supplied');
  const file = ownValue(manifest.files, selector.file) as DeveloperSourceManifest['files'][string] | undefined;
  if (!file || file.parseStatus !== 'parsed') return unknown('Source file is missing or its syntax was not resolved');
  const units = file.units.filter(unit => (!selector.unitId || unit.id === selector.unitId) && (!selector.symbol || unit.symbol === selector.symbol) && (!selector.stageId || unit.stageId === selector.stageId) && (!selector.role || unit.role === selector.role));
  const functions = units.filter(unit => unit.kind === 'function');
  const candidates = selector.symbol && !selector.role && !selector.stageId && !selector.unitId ? functions.length ? functions : units.filter(unit => unit.kind === 'binding') : units;
  if (candidates.length !== 1) return unknown(candidates.length ? 'Source selector is ambiguous' : 'Source selector was not resolved');
  return { status: 'build-manifest', selector, file: selector.file, moduleSha256: file.sha256, sourceTreeSha256: manifest.sourceTreeSha256, unit: candidates[0], freshness: 'not-checked', authenticity: 'caller-trusted-build' };
}
function inputFields(actionId: string): DeveloperFieldContract[] {
  const action = allBusinessActions.find(item => item.id === actionId);
  const out: DeveloperFieldContract[] = [];
  function visit(schema: unknown, prefix: string, depth: number) {
    if (!schema || typeof schema !== 'object' || depth > 10) return;
    const value = schema as { properties?: Record<string, unknown>; items?: unknown };
    for (const [name, child] of Object.entries(value.properties ?? {})) {
      const next = prefix + '.' + name;
      if (fieldPath.test(next)) out.push({ path: next, owner: 'host', access: 'input' });
      visit(child, next, depth + 1);
    }
    if (value.items) visit(value.items, prefix + '[]', depth + 1);
  }
  visit(action?.inputSchema, 'command', 0);
  return out;
}
function builtin(actionId: string): DeveloperFlowRegistration {
  const wrapper = wrappers[actionId];
  return {
    description: `${actionId}: library request envelope; authoritative operation is opaque`,
    source: wrapper ? { file: wrapper[0], symbol: wrapper[1] } : { file: envelopeFile, symbol: 'createBusinessOperationFlow' },
    stages: ['validate-command', 'execute-operation', 'build-output'].map(id => ({ id, source: { file: envelopeFile, stageId: id, role: 'handler' } })),
    fields: inputFields(actionId), operation: { owner: 'configured application operation or repository', contract: contracts[actionId] ?? `BusinessOperations[${actionId}]` },
  };
}
/** Reads only static registrations/manifest data. Builders, term resolvers, operations and providers are never called. */
export function describeDeveloperService(actionId: string, options: { readonly manifest?: DeveloperSourceManifest; readonly flowRegistry?: DeveloperConfiguredFlowRegistry; readonly businessType?: string } = {}): DeveloperFlowDescription | undefined {
  const known = allBusinessActions.some(action => action.id === actionId);
  const configured = ownValue(options.flowRegistry, actionId) as DeveloperConfiguredFlowRegistry[string] | undefined;
  if (!known && !configured) return undefined;
  const variants = ownValue(configured, 'variants') as Readonly<Record<string, unknown>> | undefined;
  const variantNames = names(variants).filter(name => Boolean(ownValue(variants, name)));
  const selectedVariant = options.businessType && variantNames.includes(options.businessType) ? options.businessType : undefined;
  const registrations = ownValue(configured, 'developer') as import('./types.js').DeveloperFlowRegistrations | undefined;
  const registration = configured ? staticRegistration(selectedVariant ? ownValue(ownValue(registrations, 'variants') as object | undefined, selectedVariant) : ownValue(registrations, 'default')) : builtin(actionId);
  const selectedBranch = selectedVariant ? `${actionId}:${selectedVariant}` : actionId;
  const source = resolveDeveloperSource(options.manifest, registration?.source);
  const stages = (registration?.stages ?? []).map(stage => ({ id: stage.id, source: resolveDeveloperSource(options.manifest, stage.source) }));
  const fields = (registration?.fields ?? []).filter(field => fieldPath.test(field.path)).map(field => ({ path: field.path, owner: field.owner, access: field.access, verification: 'declared' as const, location: resolveDeveloperSource(options.manifest, field.source) }));
  const stateAccesses = !configured && options.manifest?.files[envelopeFile]?.parseStatus === 'parsed'
    ? options.manifest.files[envelopeFile].units.filter(unit => unit.kind === 'state-access' && unit.field && unit.access).map(unit => ({ field: unit.field!, access: unit.access!, owner: 'library' as const, verification: 'syntactic-source' as const, source: resolveDeveloperSource(options.manifest, { file: envelopeFile, unitId: unit.id }) })) : [];
  return {
    actionId, selectedBranch, availableVariants: [actionId, ...variantNames.map(name => `${actionId}:${name}`)],
    description: registration?.description ?? `${selectedBranch}: no static developer descriptor was registered`,
    coverage: { scope: !configured ? 'library-envelope' : registration ? 'custom-declared' : 'unknown', businessSemantics: 'opaque', completeApplication: false },
    source, operation: { owner: registration?.operation?.owner ?? 'unknown', ...(registration?.operation?.contract ? {contract: registration.operation.contract} : {}), semantics: 'opaque' }, stages, fields, stateAccesses,
    unknowns: ['Authoritative business-operation internals and execution outcomes are not established by this source descriptor', ...(source.status === 'unknown' ? [source.reason!] : []), ...(!registration ? ['The selected custom builder has no static developer descriptor'] : [])],
  };
}
export function describeDeveloperServices(options: Parameters<typeof describeDeveloperService>[1] = {}): readonly DeveloperFlowDescription[] {
  const ids = new Set([...allBusinessActions.map(action => action.id), ...names(options.flowRegistry)]);
  return [...ids].sort().flatMap(id => { const result = describeDeveloperService(id, options); return result ? [result] : []; });
}
