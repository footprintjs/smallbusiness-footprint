import { isExecutionKey } from 'foottrace';
import {
  CauseRecordingError, createRecordedCauseReader,
  type CauseReaderLimits, type RecordedCauseSource, type RecordScope,
} from 'footprint-blueprint/diagnostics/cause';

export { CauseRecordingError } from 'footprint-blueprint/diagnostics/cause';
export type { CauseReaderLimits, RecordedCauseSource } from 'footprint-blueprint/diagnostics/cause';

const invalid = (): never => { throw new CauseRecordingError('CAUSE_RECORD_INVALID'); };
const limited = (): never => { throw new CauseRecordingError('CAUSE_RECORD_LIMIT'); };
const LIMITS = Object.freeze({ fields: 200000, chars: 8 * 1024 * 1024, depth: 2048, scopes: 32, commits: 1024, treeNodes: 2048 });
type Data = Record<string, unknown>;
function object(value: unknown): Data {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Data;
  return invalid();
}
const name = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.length > 1024 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return invalid();
  return value;
};
const execution = (value: unknown): string => { const id = name(value); if (!isExecutionKey(id)) return invalid(); return id; };
const list = (value: unknown): unknown[] => { if (!Array.isArray(value)) return invalid(); return value; };
function same(left: unknown, right: unknown): boolean {
  const pairs: [unknown,unknown][] = [[left,right]];
  let fields = 0, scheduled = 1;
  while (pairs.length) {
    if (++fields > LIMITS.fields) limited();
    const [a,b] = pairs.pop()!;
    if (a === b) continue;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const aa = Object.keys(a), bb = Object.keys(b);
    if (aa.length !== bb.length || aa.some(key => !Object.hasOwn(b,key))) return false;
    if ((scheduled += aa.length) > LIMITS.fields) limited();
    for (const key of aa) pairs.push([(a as Data)[key],(b as Data)[key]]);
  }
  return true;
}

/** Admit and copy inert saved data iteratively. The raw linked native tree is
 * deeper than the public cause reader's flat-scope input; no dependency cap is
 * changed. All source records are retained, with explicit independent ceilings.
 */
function inert(input: unknown): unknown {
  const box: Data = {}, active = new Set<object>();
  type Frame = { value: unknown; parent: Data | unknown[]; key: string; depth: number; exit?: boolean };
  const stack: Frame[] = [{value: input, parent: box, key: 'value', depth: 0}];
  let fields = 0, chars = 0, scheduled = 1;
  try {
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.exit) { active.delete(frame.value as object); continue; }
      if (++fields > LIMITS.fields || frame.depth > LIMITS.depth) limited();
      const value = frame.value;
      if (value === undefined || value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) {
        (frame.parent as Data)[frame.key] = value; continue;
      }
      if (typeof value === 'string') {
        chars += value.length;
        if (value.length > 65536 || chars > LIMITS.chars) limited();
        (frame.parent as Data)[frame.key] = value; continue;
      }
      if (!value || typeof value !== 'object' || active.has(value)) invalid();
      const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
      if ((!array && prototype !== Object.prototype && prototype !== null) || (array && prototype !== Array.prototype)) invalid();
      const keys = Reflect.ownKeys(value);
      if (keys.length > LIMITS.fields) limited();
      const length = array ? Object.getOwnPropertyDescriptor(value,'length')?.value : undefined;
      if (array && (!Number.isSafeInteger(length) || length < 0 || length > 10000)) limited();
      const entries = keys.filter(key => !(array && key === 'length'));
      if (array && entries.length !== length) invalid();
      if ((scheduled += entries.length) > LIMITS.fields) limited();
      const copy: Data | unknown[] = array ? [] : Object.create(null);
      (frame.parent as Data)[frame.key] = copy;
      active.add(value); stack.push({...frame, exit: true});
      for (const rawKey of entries.reverse()) {
        const key = typeof rawKey === 'string' ? rawKey : invalid();
        if (key.length > 4096 || ['__proto__', 'prototype', 'constructor'].includes(key)) invalid();
        const descriptor = Object.getOwnPropertyDescriptor(value,key) ?? invalid();
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
        if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)) invalid();
        chars += key.length; if (chars > LIMITS.chars) limited();
        stack.push({value: descriptor.value, parent: copy, key, depth: frame.depth + 1});
      }
    }
    return box.value;
  } catch (error) {
    if (error instanceof CauseRecordingError) throw error;
    return invalid();
  }
}

type Address = RecordScope['address'];
function address(value: unknown, runId: string): Address {
  const raw = object(value);
  if (raw.logRunId !== runId) return invalid();
  const drillPath = list(raw.drillPath).map(execution);
  if (drillPath.length >= LIMITS.scopes) limited();
  return {logRunId: runId, drillPath};
}
type Entry = { address: Address; log: unknown[]; tree: unknown; initialState?: Data };
const addressKey = (value: Address) => JSON.stringify(value);

/** Project each actual native scope independently. This is a RecordScope view,
 * never a flattened/fabricated SDK snapshot. Sparse reads retain known stages
 * even when another frame did not collect reads; that gap remains incomplete.
 * The host still owns authenticity, authorization, redaction and stored values.
 */
export function recordedAfterSalesCauseScopes(input: unknown): RecordedCauseSource {
  const trace = object(inert(input));
  if (!['aftersales-request', 'aftersales-action'].includes(trace.flowId as string)) return invalid();
  const runId = name(trace.runId), snapshot = object(trace.nativeSnapshot);
  if (snapshot.runId !== runId) return invalid();
  const rootAddress = address(snapshot.logAddress, runId);
  if (rootAddress.drillPath.length) return invalid();
  const mounted = snapshot.subflowResults === undefined ? {} : object(snapshot.subflowResults);
  const mounts = new Map<string, Entry>();
  for (const [key, value] of Object.entries(mounted)) {
    const context = object(object(value).treeContext), child = address(context.logAddress, runId);
    const mountId = child.drillPath.at(-1);
    if (!mountId || isExecutionKey(key) && mountId !== key) return invalid();
    const entry = {address: child, log: list(context.history), tree: context.stageContexts,
      ...(context.initialState === undefined ? {} : {initialState: object(context.initialState)})};
    // Both readable aliases and execution-key slots must agree on the actual
    // address/history. The address owns identity, never a guessed label path.
    const previous = mounts.get(mountId);
    if (previous && !same(previous,entry)) return invalid();
    mounts.set(mountId,entry);
    if (mounts.size >= LIMITS.scopes) limited();
  }
  const capture = trace.causeCapture === undefined ? undefined : object(trace.causeCapture);
  if (capture && (capture.version !== 1 || capture.ruleVersion !== 'recorded-facts-v1' || capture.runId !== runId || typeof capture.complete !== 'boolean')) return invalid();
  const controls = capture ? object(capture.controlDeps) : undefined;
  const attention = capture ? object(capture.attention) : undefined;
  const facts = capture ? list(capture.facts) : [];
  if (facts.length > 1024 || Object.keys(controls ?? {}).length > 512 || Object.keys(attention ?? {}).length > 512) limited();
  const factMap = new Map<string, Data>();
  const reasons: Record<string,string> = {error:'ERROR_RECORDED', 'unknown-effect':'UNKNOWN_EFFECT_RECORDED', 'gave-up':'RETRY_STOP_RECORDED', timeout:'TIMEOUT_RECORDED', retried:'RETRY_RECORDED'};
  facts.forEach((raw, index) => {
    const fact = object(raw);
    if (fact.id !== `capture:${index}` || !Object.hasOwn(reasons, name(fact.kind))) invalid();
    execution(fact.runtimeStageId); factMap.set(fact.id as string, fact);
  });
  for (const [id, raw] of Object.entries(controls ?? {})) { execution(id); execution(object(raw).deciderId); }
  for (const [id, raw] of Object.entries(attention ?? {})) {
    execution(id); const marks = list(raw); if (marks.length > 32) limited();
    for (const item of marks) {
      const mark = object(item), evidence = list(mark.evidence), kind = name(mark.kind);
      if (!Object.hasOwn(reasons, kind) || mark.reason !== reasons[kind] || !evidence.length || evidence.length > 16) invalid();
      for (const ref of evidence) {
        const fact = factMap.get(name(ref));
        if (!fact || fact.kind !== kind || fact.runtimeStageId !== id) invalid();
      }
    }
  }
  let incomplete = !capture?.complete, commits = 0, treeNodes = 0;
  const queue: Entry[] = [{address: rootAddress, log: list(snapshot.commitLog), tree: snapshot.executionTree}];
  const scheduled = new Set([addressKey(rootAddress)]), scopes: RecordScope[] = [];
  const committed = new Set<string>(), owners = new Map<string,string>();
  const nativeNodes = new Map<string,Data>();
  const logOwners = new Map<string,string>(), nonSeedClaims: {id:string; scope:string}[] = [];
  while (queue.length) {
    const entry = queue.shift()!, scopeKey = addressKey(entry.address);
    if (scopes.length >= LIMITS.scopes || (commits += entry.log.length) > LIMITS.commits) limited();
    const nodes = new Map<string, Data>(), pending: unknown[] = entry.tree === undefined || entry.tree === null ? [] : [entry.tree];
    while (pending.length) {
      const node = object(pending.pop()); if (++treeNodes > LIMITS.treeNodes) limited();
      if (node.runtimeStageId !== undefined) {
        const id = execution(node.runtimeStageId), previous = owners.get(id);
        if (previous !== undefined && previous !== scopeKey) return invalid();
        owners.set(id, scopeKey);
        const existing = nodes.get(id);
        if (existing?.stageReads !== undefined && node.stageReads !== undefined && !same(existing.stageReads, node.stageReads)) return invalid();
        if (!existing || node.stageReads !== undefined) nodes.set(id, node);
        nativeNodes.set(id,node);
      }
      if (node.children !== undefined) pending.push(...list(node.children));
      if (node.next !== undefined && node.next !== null) pending.push(node.next);
    }
    for (const [id,node] of nodes) {
      const child = mounts.get(id);
      if (child) {
        if (node.subflowId === undefined) return invalid();
        name(node.subflowId);
        if (!same(child.address.drillPath,[...entry.address.drillPath,id])) return invalid();
        const key = addressKey(child.address);
        if (!scheduled.has(key)) { scheduled.add(key); queue.push(child); }
      } else if (node.subflowId !== undefined) incomplete = true;
    }
    const reads: Record<string,string[]> = Object.create(null), scopedControls: Record<string,{deciderId:string}> = Object.create(null);
    const marks: NonNullable<RecordScope['attention']> = Object.create(null);
    let readsComplete = pending.length === 0 && entry.tree !== undefined && entry.tree !== null;
    for (const raw of entry.log) {
      const bundle = object(raw), id = execution(bundle.runtimeStageId); committed.add(id);
      const node = nodes.get(id); list(bundle.trace);
      const child = mounts.get(id), childKey = child ? addressKey(child.address) : undefined;
      const ownSeed = childKey === scopeKey && raw === entry.log[0] && !nodes.has(id);
      if (!ownSeed) {
        const previous = logOwners.get(id), owner = owners.get(id);
        if (previous !== undefined && previous !== scopeKey || owner !== undefined && owner !== scopeKey) return invalid();
        logOwners.set(id,scopeKey); nonSeedClaims.push({id,scope:scopeKey});
      }
      if (node?.stageReads !== undefined) reads[id] = Object.keys(object(node.stageReads));
      else readsComplete = false;
      // Per-write read prefixes stay unchanged in commitLog. The canonical
      // graph uses them directly; they never become a complete stage-read map.
      if (!ownSeed && controls && Object.hasOwn(controls,id)) scopedControls[id] = {deciderId: execution(object(controls[id]).deciderId)};
      if (!ownSeed && attention && Object.hasOwn(attention,id)) (marks as Record<string,unknown>)[id] = attention[id];
      if (ownSeed) { incomplete = true; readsComplete = false; }
      if (child) {
        // A native seed may repeat its actual mount execution inside its own log.
        // Reuse that address; never append the same mount again or synthesize a scope.
        if (childKey === scopeKey) {
          // Only the native mount's first seed bundle can repeat itself here;
          // it is not another runtime execution in the child's stage tree.
          if (!ownSeed) return invalid();
        } else {
          if (!same(child.address.drillPath, [...entry.address.drillPath,id])) return invalid();
          if (!scheduled.has(childKey!)) {
            scheduled.add(childKey!); queue.push(child);
          }
        }
      } else if (node?.subflowId !== undefined) incomplete = true;
    }
    for (const [childId, dependency] of Object.entries(scopedControls)) {
      const parent = entry.log.findIndex(row => object(row).runtimeStageId === dependency.deciderId);
      const child = entry.log.findIndex(row => object(row).runtimeStageId === childId);
      if (parent >= child && parent >= 0) return invalid();
    }
    if (!readsComplete) incomplete = true;
    scopes.push({address: entry.address, commitLog: entry.log, reads,
      ...(entry.initialState ? {initialState: entry.initialState} : {}),
      ...(capture ? {controlDeps: scopedControls, attention: marks} : {}), complete: Boolean(capture?.complete && readsComplete)});
  }
  if (nonSeedClaims.some(claim => owners.has(claim.id) && owners.get(claim.id) !== claim.scope)) return invalid();
  for (const scope of scopes) {
    const retained = scope.controlDeps as Record<string,{deciderId:string}> | undefined;
    for (const [id,dependency] of Object.entries(retained ?? {})) {
      if (!scope.commitLog.some(raw => object(raw).runtimeStageId === dependency.deciderId)) {
        (scope as {complete:boolean}).complete = false; incomplete = true;
      }
      const parent = nativeNodes.get(dependency.deciderId);
      const messages = parent?.flowMessages === undefined ? [] : list(parent.flowMessages);
      const hasDecision = messages.some(raw => object(raw).type === 'branch');
      if (!hasDecision) {
        // The pinned SDK can report isDecider:false on real deciders, so a
        // retained native branch event is the execution evidence. A known
        // ordinary next-only frame contradicts a claimed control parent.
        if (parent?.isDecider === false && messages.some(raw => object(raw).type === 'next')) return invalid();
        delete retained![id]; (scope as {complete:boolean}).complete = false; incomplete = true;
      }
    }
  }
  // Missing retained scopes/commits never become fabricated capture owners.
  if ([...mounts.values()].some(entry => !scheduled.has(addressKey(entry.address))) ||
    facts.some(raw => !committed.has(object(raw).runtimeStageId as string)) ||
    Object.entries(controls ?? {}).some(([id, raw]) => !owners.has(id) || !owners.has(object(raw).deciderId as string))) incomplete = true;
  return {scopes, incomplete};
}

/** Query canonical public cause readers over admitted per-scope metadata. */
export function createAfterSalesCauseReader(input: unknown, limits?: CauseReaderLimits): ReturnType<typeof createRecordedCauseReader> {
  const supplied = limits === undefined ? {} : object(inert(limits));
  const admitted: {maxScopes?: number; maxCommits?: number; maxCatalogNodes?: number; timeoutMs?: number} = {};
  const bounds = {maxScopes: 32, maxCommits: 1024, maxCatalogNodes: 2048, timeoutMs: 5000};
  for (const key of Object.keys(supplied)) if (!Object.hasOwn(bounds,key)) return invalid();
  for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) {
    const value = supplied[key];
    if (value !== undefined) {
      if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > bounds[key]) limited();
      admitted[key] = value as number;
    }
  }
  return createRecordedCauseReader(recordedAfterSalesCauseScopes(input), {maxScopes: 32, maxCommits: 1024, maxCatalogNodes: 2048, ...admitted});
}
