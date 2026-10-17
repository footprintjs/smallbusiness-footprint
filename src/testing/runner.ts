import { flowChart, FlowChartExecutor, errorCategory, timeBudget, type AttemptContext, type FlowAttemptEvent, type TypedScope } from 'footprintjs';
import { normalizeCommerceBoundaryError } from '../diagnostics.js';
import { diagnoseFailureRecording, type FailureRecording, type BoundaryEvidence, type FailureNativeSnapshot } from 'footprint-blueprint/diagnostics';
import { failureScenarioPlan, listFailureScenarios, SCENARIOS } from './scenarios.js';
import type { FailureTarget } from './scenarios.js';

export { listFailureScenarios, SCENARIOS };
type Scope = TypedScope<Record<string, unknown>>;
type Counters = Record<FailureTarget, number>;
type Normalized = ReturnType<typeof normalizeCommerceBoundaryError>;
interface BoundaryMeta {
  target: FailureTarget; operation: string; write: boolean;
  blocked?: boolean; causedBy?: string; normalized?: Normalized; confirmed?: boolean; unknown?: boolean;
}
export interface FailureRecordingKey { readonly storeId: string; readonly runId: string; readonly flowId: string }
export interface FailureScenarioStorage {
  persist: (record: FailureRecording) => void | Promise<void>;
  load: (key: FailureRecordingKey) => unknown | Promise<unknown>;
}
export type FailureScenarioOptions = Readonly<{ storeId?: string }> & (
  | FailureScenarioStorage
  | { persist?: never; load?: never }
);
export interface FailureScenarioObserved {
  /** Local sends that reached the simulated provider, including authoritative reconciliation reads. */
  physicalCalls: Counters;
  /** Attempted local write sends, never a claim that the effect committed. */
  physicalWriteAttempts: Counters;
  /** Attempts to enter a local port, including circuit refusals and reconciliation reads. */
  admittedCalls: Counters;
  businessResult: 'pending' | 'ok' | 'failed' | 'unknown' | 'blocked'; observerCalls: number;
  mode: 'independent-read-only-diagnostics' | 'local-order-workflow'; writeCounterMeaning: string;
  budgetPreflight?: { knownMs: number; budgetMs: number; over: boolean; buildRefused: boolean; physicalCalls: number };
  executionFailure?: { name: string; category: ReturnType<typeof errorCategory> };
  networkCalls: 0; modelCalls: 0; cloudCalls: 0;
}
export interface FailureScenarioResult { record: FailureRecording; observed: FailureScenarioObserved }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const own = (value: unknown, key: string): unknown => {
  try { const d = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : undefined;
    return d && 'value' in d ? d.value : undefined; } catch { return undefined; }
};
const quiet = { info() {}, log() {}, debug() {}, error() {}, warn() {} };
const error = (code: string, fields: Record<string, unknown> = {}) => Object.assign(new Error('Synthetic local boundary failure'), { code, ...fields });
const canRetry = (failure: unknown) => ['server', 'network', 'rate-limited'].includes(errorCategory(failure));
const waitForAbort = (signal: AbortSignal) => new Promise<never>((_, reject) => {
  if (signal.aborted) return reject(signal.reason);
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

/** Runs only local ports. Neither a diagnosis nor a provider response is manufactured from the scenario id. */
export async function runFailureScenario(id: string, options: FailureScenarioOptions = {}): Promise<FailureScenarioResult> {
  const { storeId = 'local-failure-lab', persist, load } = options;
  if (typeof storeId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(storeId)) throw error('FAILURE_LAB_STORE_ID_INVALID');
  if ((persist !== undefined || load !== undefined) && (typeof persist !== 'function' || typeof load !== 'function')) {
    throw error('FAILURE_LAB_STORAGE_PAIR_REQUIRED');
  }
  const plan = failureScenarioPlan(id), boundaryEvidence: BoundaryEvidence[] = [], pending = new Map<string, BoundaryMeta>(), descriptions = new Map<string, BoundaryMeta>();
  const physicalCalls = { database: 0, payment: 0, shipping: 0 }, admittedCalls = { database: 0, payment: 0, shipping: 0 };
  // Sends to a write port, not a claim that any outside effect committed.
  const physicalWriteAttempts = { database: 0, payment: 0, shipping: 0 };
  const controller = new AbortController(), timers = new Set<ReturnType<typeof setTimeout>>(), diagnostics: { persistence: 'stored' | 'failed'; observer: 'ok' | 'failed'; code?: string } = { persistence: 'stored', observer: 'ok' };
  const ledger = new Map<string | undefined, 'applied'>(); // Private authoritative double; it never crosses the record boundary.
  let firstFailure: string | undefined, paymentUnknown: 'unknown' | 'applied' | undefined;
  let businessResult: FailureScenarioObserved['businessResult'] = 'pending', sequence = 0, observerCalls = 0, circuitFailures = 0;
  let budgetPreflight: FailureScenarioObserved['budgetPreflight'];
  const flowId = plan.independentProbes ? 'local-failure-lab-independent-read-probes' : 'local-failure-lab-order';
  const normalize = (failure: unknown, target: FailureTarget, operation: string, write = false) => normalizeCommerceBoundaryError(failure,
    { system: target, operation, effect: write ? 'write' : 'read' });
  function noteCall(attempt: AttemptContext, meta: BoundaryMeta) {
    const attemptId = `${attempt.series}@${attempt.attempt}`;
    pending.set(attemptId, meta);
    return attemptId;
  }
  function completeBoundary(event: FlowAttemptEvent) {
    const native = event.record, attemptId = `${native.series}@${native.attempt}`;
    const meta = pending.get(attemptId) ?? (native.kind === 'call' && native.target ? descriptions.get(native.target) : undefined);
    if (!meta || !event.traversalContext || native.outcome === 'paused') return;
    const classification = meta.normalized ?? normalize(native.error ?? {}, meta.target, meta.operation, meta.write);
    const row: BoundaryEvidence = { id: `boundary-${++sequence}`, sequence, runtimeStageId: event.traversalContext!.runtimeStageId,
      target: meta.target, operation: meta.operation, outcome: meta.blocked ? 'blocked' : native.outcome,
      category: native.outcome === 'ok' && !meta.blocked ? 'ok'
        : native.outcome === 'timeout' ? (native.category ?? 'timeout') : classification.category,
      ...(native.outcome !== 'ok' && classification.code ? { code: classification.code } : {}),
      ...(native.outcome !== 'ok' && classification.httpStatus !== undefined ? { httpStatus: classification.httpStatus } : {}),
      effect: meta.confirmed ? 'confirmed' : meta.unknown ? 'unknown' : native.effect === 'applied' ? 'confirmed'
        : native.effect === 'unknown' ? 'unknown' : meta.write ? classification.effect : 'none',
      ...(meta.causedBy ? { causedBy: meta.causedBy } : {}), attemptId,
      decision: { next: native.next, reason: native.reason } };
    boundaryEvidence.push(row);
    if (!firstFailure && ((native.next === 'stop' && row.outcome !== 'ok')
      || (meta.blocked && !meta.causedBy))) firstFailure = row.id;
    pending.delete(attemptId);
  }
  function observe(event: FlowAttemptEvent) {
    completeBoundary(event);
    try {
      observerCalls++;
      if (plan.failObserver) throw error('LOCAL_OBSERVER_FAILED');
    } catch {
      diagnostics.observer = 'failed'; diagnostics.code = 'LOCAL_OBSERVER_FAILED';
    }
  }
  async function localPort(target: FailureTarget, operation: string, attempt: AttemptContext, write: boolean) {
    admittedCalls[target]++;
    if (target === 'shipping' && plan.circuitThreshold && circuitFailures >= plan.circuitThreshold) {
      const failure = error('CIRCUIT_OPEN', { retryable: false, effect: 'none' });
      noteCall(attempt, { target, operation, write, blocked: true,
        causedBy: boundaryEvidence.findLast(row => row.target === target && row.outcome === 'failed')?.id ?? firstFailure,
        normalized: normalize(failure, target, operation, write) });
      throw failure;
    }
    const call = physicalCalls[target]++;
    if (write) physicalWriteAttempts[target]++;
    const script = plan[target] ?? ['ok'], action = script[Math.min(call, script.length - 1)];
    const meta: BoundaryMeta = { target, operation, write }; noteCall(attempt, meta);
    try {
      if (action === 'connection') throw error('ECONNREFUSED');
      if (action === 'db-auth') throw error('AccessDeniedException', { name: 'AccessDeniedException', $metadata: { httpStatusCode: 400 } });
      if (action === 'db-throttle') throw error('ProvisionedThroughputExceededException', { name: 'ProvisionedThroughputExceededException', $metadata: { httpStatusCode: 400 } });
      if (action.startsWith('http-')) {
        const status = Number(action.slice(5));
        throw error('PROVIDER_HTTP_ERROR', { status, ...((status === 400 || status === 401) ? { effect: 'none' } : {}) });
      }
      if (action === 'nonstandard') throw error('NONSTANDARD_PROVIDER_ERROR', { status: '500' });
      if (action === 'malformed') {
        const response: { status: number; body: Record<string, unknown> } = { status: 200, body: { unexpected: true } };
        if (typeof response.body.rate !== 'number') throw error('MALFORMED_RESPONSE', { status: response.status, retryable: false });
      }
      if (action === 'apply-then-wait') ledger.set(attempt.idempotencyKey, 'applied');
      if (action === 'wait' || action === 'apply-then-wait') {
        if (plan.abortAfterMs) {
          const timer = setTimeout(() => controller.abort(error('LOCAL_CALLER_ABORT')), plan.abortAfterMs); timers.add(timer);
        }
        await waitForAbort(attempt.signal);
      }
      if (write) ledger.set(attempt.idempotencyKey, 'applied');
      return { ok: true };
    } catch (failure) {
      if (target === 'shipping' && canRetry(failure)) circuitFailures++;
      meta.normalized = normalize(failure, target, operation, write);
      throw failure;
    }
  }
  async function blocked(scope: Scope, target: FailureTarget) {
    const operation = 'admission', name = `${target}.local-admission`;
    const meta: BoundaryMeta = { target, operation, write: false, blocked: true, causedBy: firstFailure };
    descriptions.set(name, meta);
    try {
      await scope.$call(name, attempt => {
        const failure = error('LOCAL_DEPENDENCY_BLOCKED', { retryable: false, effect: 'none' });
        noteCall(attempt, { ...meta, normalized: normalize(failure, target, operation) }); throw failure;
      }, { attempts: 1 });
    } catch { /* A local admission decision sends nothing to the provider. */ }
  }
  async function execute(scope: Scope, target: FailureTarget, operation: string, write = false, independent = false) {
    if (firstFailure && !independent && !(target === 'payment' && paymentUnknown === 'applied')) return blocked(scope, target);
    const name = `${target}.${operation}`, meta = { target, operation, write };
    descriptions.set(name, meta);
    const attempts = plan[`${target}Attempts` as 'databaseAttempts' | 'paymentAttempts' | 'shippingAttempts'] ?? 1;
    const policy = { attempts, timeoutMs: target === 'payment' ? (plan.paymentTimeoutMs ?? 100) : (plan.callTimeoutMs ?? 100),
      backoffMs: plan.backoffMs ?? 0,
      retryOn: (failure: unknown) => {
        if (write && own(failure, 'effect') !== 'none') return false;
        return canRetry(failure) || (target === 'database' && normalize(failure, target, operation).category === 'rate-limited');
      } };
    try {
      await scope.$call(name, attempt => localPort(target, operation, attempt, write), policy,
        write ? { touches: target, ...(plan.keylessPayment ? {} : { idempotencyKey: 'synthetic-order-payment' }) } : undefined);
      scope[`${target}Result`] = 'ok';
    } catch (failure) {
      if (plan.keylessPayment && target === 'payment') {
        const t = scope.$attempt();
        noteCall(t, { ...meta, blocked: true, normalized: normalize(error('IDEMPOTENCY_KEY_REQUIRED', { retryable: false, effect: 'none' }), target, operation, write) });
        throw failure; // The actual native stage fails; no successful attempt is relabeled blocked.
      }
      if (write && own(failure, 'name') === 'UnknownEffectError') paymentUnknown = 'unknown';
      scope[`${target}Result`] = paymentUnknown === 'unknown' ? 'unknown' : 'failed';
    }
  }
  const input = (scope: Scope) => {
    scope.secret = 'LOCAL_SECRET_CANARY_NEVER_EXPORT'; scope.$debug('secret', 'LOCAL_SECRET_CANARY_NEVER_EXPORT');
  };
  const builder = plan.independentProbes
    ? flowChart<Record<string, unknown>>('Independent local diagnostic probes', input, 'probe-input').setLogger(quiet)
      .addFunction('Independent database diagnostic read', scope => execute(scope, 'database', 'diagnostic-read', false, true),
        'database-probe').retry({ attempts: 1, timeoutMs: 500 })
      .addFunction('Independent shipping diagnostic read', async scope => {
        await execute(scope, 'shipping', 'diagnostic-read', false, true);
        businessResult = firstFailure ? 'failed' : 'ok';
      }, 'shipping-probe').retry({ attempts: 1, timeoutMs: 500 })
    : flowChart<Record<string, unknown>>('Local order input', input, 'local-input').setLogger(quiet)
    .addFunction('Database read', async scope => {
      if (plan.preflight) {
        let calls = 0;
        const candidate = flowChart('Oversubscribed database read', () => { calls++; }, 'database-declared')
          .retry({ attempts: 4, timeoutMs: 40000, backoffMs: 0 }).setLogger(quiet).build();
        const report = timeBudget(candidate, { budgetMs: 120000 });
        let refused = false;
        try { flowChart('Oversubscribed database read', () => { calls++; }, 'database-declared')
          .retry({ attempts: 4, timeoutMs: 40000, backoffMs: 0 }).budget(120000).setLogger(quiet).build(); } catch { refused = true; }
        budgetPreflight = { knownMs: report.knownMs, budgetMs: report.budgetMs ?? 120000, over: report.over, buildRefused: refused, physicalCalls: calls };
        scope.$debug('budgetPreflight', budgetPreflight);
        const failure = error('BUDGET_PREFLIGHT_REJECTED', { retryable: false, effect: 'none' });
        noteCall(scope.$attempt(), { target: 'database', operation: 'budget-preflight', blocked: true, write: false,
          normalized: normalize(failure, 'database', 'budget-preflight') });
        businessResult = 'blocked';
        throw failure; // Preserve the real failed stage attempt behind this admission refusal.
      }
      await execute(scope, 'database', 'read-order');
    }, 'database-read').retry({ attempts: 1, timeoutMs: 500 })
    .addFunction('Payment admission and charge', async scope => {
      if (plan.preflight) return;
      await execute(scope, 'payment', 'charge', true);
    }, 'payment-charge').retry({ attempts: 1, timeoutMs: 500 })
    .addFunction('Payment reconciliation', async scope => {
      if (!plan.reconcile || paymentUnknown !== 'unknown') return;
      const name = 'payment.reconcile', target = 'payment', operation = 'reconcile';
      descriptions.set(name, { target, operation, write: false });
      paymentUnknown = await scope.$call(name, attempt => {
        admittedCalls.payment++; physicalCalls.payment++;
        const found = ledger.get('synthetic-order-payment') === 'applied';
        noteCall(attempt, { target, operation, write: false, confirmed: found, unknown: !found,
          causedBy: boundaryEvidence.findLast(row => row.target === 'payment' && row.operation === 'charge')?.id });
        return found ? 'applied' : 'unknown';
      }, { attempts: 1, timeoutMs: 100 });
      scope.reconciliation = paymentUnknown;
    }, 'payment-reconcile').retry({ attempts: 1, timeoutMs: 500 })
    .addFunction('Shipping quote', async scope => {
      if (plan.preflight) return;
      if (paymentUnknown === 'applied') {
        // The independent read confirmed the write; a second write is never needed.
        const saved = firstFailure; firstFailure = undefined;
        await execute(scope, 'shipping', 'quote');
        const shippingFailed = Boolean(firstFailure); firstFailure ??= saved;
        businessResult = shippingFailed ? 'failed' : 'ok';
        return;
      } else await execute(scope, 'shipping', 'quote');
      businessResult = paymentUnknown === 'unknown' ? 'unknown' : firstFailure && paymentUnknown !== 'applied' ? 'failed' : 'ok';
    }, 'shipping-quote').retry({ attempts: 1, timeoutMs: 1000 });
  const executor = new FlowChartExecutor(builder.build());
  executor.setRedactionPolicy({ keys: ['secret', 'authorization', 'idempotencyKey', 'customer', 'payload', 'token'] });
  executor.attachFlowRecorder({ id: 'local-failure-lab-boundaries', onAttempt: observe });
  let executionFailure;
  try { await executor.run({ signal: controller.signal, ...(plan.runTimeoutMs ? { timeoutMs: plan.runTimeoutMs } : {}) }); }
  catch (failure) { executionFailure = failure; if (businessResult === 'pending') businessResult = 'failed'; }
  finally { for (const timer of timers) clearTimeout(timer); }
  // A completed real executor supplies runtime stage IDs; the public snapshot type also covers unstarted trees.
  // The exact stage/attempt identity and native shape are verified independently by the diagnostic reader.
  const nativeSnapshot = clone(executor.getSnapshot({ redact: true })) as FailureNativeSnapshot;
  const draft: FailureRecording = { schemaVersion: 1, storeId, runId: nativeSnapshot.runId, flowId, nativeSnapshot,
    boundaryEvidence: clone(boundaryEvidence), diagnostics: { ...diagnostics } };
  let record: FailureRecording;
  const local = new Map<string, FailureRecording>();
  const writer = persist ?? (async (value: FailureRecording) => { local.set(value.runId, clone(value)); });
  const reader = load ?? (async (key: FailureRecordingKey) => clone(local.get(key.runId)));
  try {
    if (plan.failPersistence) throw error('LOCAL_TRACE_STORE_FAILED');
    await writer(clone(draft));
    const loaded = await reader({ storeId, runId: draft.runId, flowId });
    // Treat host storage as an untrusted JSON boundary before reading properties or serializing it.
    // Reuse Blueprint validation; do not duplicate its bounded/getter-safe recording contract here.
    diagnoseFailureRecording(loaded);
    record = loaded as FailureRecording;
    if (!record || record.runId !== draft.runId || record.storeId !== storeId || record.flowId !== flowId
      || record.nativeSnapshot?.runId !== draft.runId || JSON.stringify(record) !== JSON.stringify(draft)) throw error('LOCAL_TRACE_READBACK_MISMATCH');
    record = clone(record);
  } catch {
    // This is a separate local fallback diagnostic, not a claim that a trace was saved.
    record = { ...draft, nativeSnapshot: null, boundaryEvidence: [],
      diagnostics: { ...diagnostics, persistence: 'failed', code: 'LOCAL_TRACE_STORE_FAILED' } };
  }
  return { record, observed: { physicalCalls, physicalWriteAttempts, admittedCalls, businessResult, observerCalls,
    mode: plan.independentProbes ? 'independent-read-only-diagnostics' : 'local-order-workflow',
    writeCounterMeaning: 'Attempted local write-port sends; committed effects require authoritative evidence.',
    ...(budgetPreflight ? { budgetPreflight } : {}),
    ...(executionFailure ? { executionFailure: { name: typeof own(executionFailure, 'name') === 'string' ? own(executionFailure, 'name') as string : 'Error', category: errorCategory(executionFailure) } } : {}),
    networkCalls: 0, modelCalls: 0, cloudCalls: 0 } };
}
