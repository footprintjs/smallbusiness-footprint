import { flowChart, FlowChartExecutor } from 'footprintjs';
import { diagnoseFailureRecording, type FailureRecording, type FailureNativeSnapshot } from 'footprint-blueprint/diagnostics';
import type { BoundaryCallContext } from 'footprint-blueprint/diagnostics/runtime';
import { createCommerceBoundaryRecorder } from '../diagnostics/runtime.js';
import type { FailureScenarioOptions } from './runner.js';

const definitions = [
  ['boundary-success', 'Successful read through the native commerce recorder'],
  ['boundary-db-auth', 'Recorded database authorization rejection'],
  ['boundary-db-throttled', 'Three SDK transport throttles inside one logical call'],
  ['boundary-db-server', 'Recorded database server error'],
  ['boundary-db-recovered', 'SDK throttle and server errors followed by a successful read'],
  ['boundary-payment-unknown', 'Payment transport failure leaves the write outcome unknown'],
  ['boundary-payment-reconcile-applied', 'A separate domain read confirms the local payment ledger'],
  ['boundary-payment-reconcile-unknown', 'A separate domain read cannot confirm the payment'],
  ['boundary-caller-cancelled', 'Caller cancellation is distinct from a dependency timeout'],
  ['boundary-read-timeout', 'A real native call timeout caps a local read'],
  ['boundary-late-report', 'A late SDK callback cannot alter completed native evidence'],
  ['boundary-partial-recording', 'The shared evidence cap discloses a partial recording'],
] as const;
export const BOUNDARY_EVIDENCE_SCENARIOS = Object.freeze(definitions.map(([id, title]) => Object.freeze({ id, title })));
export type BoundaryEvidenceScenarioId = typeof definitions[number][0];
export interface BoundaryEvidenceScenarioResult {
  readonly record: FailureRecording;
  /** Independent test counters/domain acknowledgements are never passed to deterministic diagnosis. */
  readonly observed: {
    readonly mode: 'local-sdk-double';
    readonly logicalInvocations: number;
    readonly physicalDispatches: number;
    readonly paymentWriteAttempts: number;
    readonly reconciliation: 'not-requested' | 'applied' | 'unknown';
    readonly businessResult: 'ok' | 'failed' | 'unknown' | 'aborted';
    readonly earlierSnapshotUnchanged: boolean;
    readonly modelCalls: 0; readonly networkCalls: 0; readonly cloudCalls: 0;
  };
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const quiet = { log() {}, info() {}, debug() {}, warn() {}, error() {} };
const failure = (kind: 'auth' | 'throttle' | 'server' | 'payment') => {
  if (kind === 'payment') return Object.assign(new Error('PRIVATE payment SDK response'), {
    type: 'StripeConnectionError', cause: { code: 'ETIMEDOUT', message: 'PRIVATE transport details' }, requestId: 'PRIVATE',
  });
  const name = kind === 'auth' ? 'AccessDeniedException' : kind === 'throttle' ? 'ProvisionedThroughputExceededException' : 'InternalServerError';
  return Object.assign(new Error('PRIVATE database SDK response'), { name, $metadata: { httpStatusCode: kind === 'server' ? 503 : 400 } });
};
const waitForAbort = (signal: AbortSignal) => new Promise<never>((_, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

/**
 * Executes actual Blueprint/FootprintJS recording against injected-in-process SDK doubles.
 * It does not contact a provider, infer a provider outage, authorize retries or perform durable reconciliation.
 * Existing 27 fault scenarios remain separate; this catalog exercises the public runtime collector itself.
 */
export async function runBoundaryEvidenceScenario(id: string, options: FailureScenarioOptions = {}): Promise<BoundaryEvidenceScenarioResult> {
  if (!BOUNDARY_EVIDENCE_SCENARIOS.some(row => row.id === id)) throw new TypeError('Unknown commerce boundary scenario');
  const storeId = options.storeId ?? 'local-commerce-boundaries';
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(storeId)) throw new TypeError('Invalid local store identity');
  if ((options.persist !== undefined || options.load !== undefined) && (typeof options.persist !== 'function' || typeof options.load !== 'function')) {
    throw new TypeError('Both persistence ports are required');
  }
  const recorder = createCommerceBoundaryRecorder(id === 'boundary-partial-recording' ? { maxEvents: 1 } : {});
  const controller = new AbortController();
  let logicalInvocations = 0, physicalDispatches = 0, paymentWriteAttempts = 0;
  let businessResult: BoundaryEvidenceScenarioResult['observed']['businessResult'] = 'ok';
  let reconciliation: BoundaryEvidenceScenarioResult['observed']['reconciliation'] = 'not-requested';
  let timer: ReturnType<typeof setTimeout> | undefined, late: (() => void) | undefined;
  const payment = id.startsWith('boundary-payment-');
  const timed = id === 'boundary-read-timeout' || id === 'boundary-caller-cancelled';
  const transport = async (context: BoundaryCallContext, actions: readonly ('auth' | 'throttle' | 'server' | 'payment' | 'ok')[]) => {
    for (const [index, action] of actions.entries()) {
      const startedAt = Date.now(); physicalDispatches++; if (payment) paymentWriteAttempts++;
      const error = action === 'ok' ? undefined : failure(action);
      context.observePhysical({ source: 'sdk-double', phase: 'response-complete', outcome: error ? 'failed' : 'ok', startedAt,
        durationMs: Date.now() - startedAt, attempt: index + 1, of: actions.length,
        ...(error ? { error } : { httpStatus: 200 }) });
      if (!error) return { accepted: true };
      if (index === actions.length - 1) throw error;
    }
    return undefined;
  };
  const builder = flowChart('Commerce boundary call', async scope => {
    logicalInvocations++;
    try {
      await recorder.run(scope, { system: payment ? 'payment' : 'database', operation: payment ? 'charge' : 'read-order',
        target: payment ? 'payment.charge' : 'database.read', effect: payment ? 'write' : 'read',
        ...(payment ? { idempotencyKey: 'existing-local-operation-key' } : {}), ...(timed ? { timeoutMs: id === 'boundary-read-timeout' ? 15 : 1000 } : {}) }, async context => {
        if (timed) { physicalDispatches++; if (id === 'boundary-caller-cancelled') timer = setTimeout(() => controller.abort(), 5); return waitForAbort(context.signal); }
        if (id === 'boundary-late-report') {
          physicalDispatches++;
          late = () => context.observePhysical({ source: 'sdk-double', phase: 'response-complete', outcome: 'ok', startedAt: Date.now(), durationMs: 0 });
          return { accepted: true };
        }
        const actions = id === 'boundary-db-auth' ? ['auth'] as const
          : id === 'boundary-db-throttled' ? ['throttle', 'throttle', 'throttle'] as const
          : id === 'boundary-db-server' ? ['server'] as const
          : id === 'boundary-db-recovered' || id === 'boundary-partial-recording' ? ['throttle', 'server', 'ok'] as const
          : payment ? ['payment'] as const : ['ok'] as const;
        return transport(context, actions);
      });
    } catch {
      // The host catches/maps private read errors before they can escape into a parent stage's native error record.
      businessResult = payment ? 'unknown' : id === 'boundary-caller-cancelled' ? 'aborted' : 'failed';
    }
  }, 'commerce-boundary').retry({ attempts: 1, timeoutMs: 2000 })
    .addFunction('Independent payment reconciliation read', async scope => {
      if (!id.startsWith('boundary-payment-reconcile-')) return;
      logicalInvocations++;
      await recorder.run(scope, { system: 'payment', operation: 'reconcile-payment', target: 'payment.reconcile', effect: 'read' }, context => {
        const startedAt = Date.now(); physicalDispatches++;
        context.observePhysical({ source: 'sdk-double', phase: 'response-complete', outcome: 'ok', startedAt, durationMs: Date.now() - startedAt, httpStatus: 200 });
        reconciliation = id === 'boundary-payment-reconcile-applied' ? 'applied' : 'unknown';
        return { found: reconciliation === 'applied' }; // Private domain receipt, never a rewrite of the unknown physical write.
      });
    }, 'payment-reconciliation').retry({ attempts: 1, timeoutMs: 2000 }).setLogger(quiet);
  const executor = new FlowChartExecutor(builder.build());
  executor.attachFlowRecorder(recorder.flowRecorder);
  executor.setRedactionPolicy({ keys: ['secret', 'customer', 'payload', 'idempotencyKey', 'token', 'authorization'] });
  try { await executor.run({ signal: controller.signal }); }
  catch { businessResult = id === 'boundary-caller-cancelled' ? 'aborted' : businessResult === 'ok' ? 'failed' : businessResult; }
  finally { if (timer !== undefined) clearTimeout(timer); }
  const beforeLate = recorder.snapshot(), beforeBytes = JSON.stringify(beforeLate);
  late?.();
  const earlierSnapshotUnchanged = JSON.stringify(beforeLate) === beforeBytes;
  const collected = recorder.snapshot();
  const nativeSnapshot = clone(executor.getSnapshot({ redact: true })) as FailureNativeSnapshot;
  const flowId = 'local-commerce-boundary-runtime';
  const draft: FailureRecording = { schemaVersion: 1, storeId, runId: nativeSnapshot.runId, flowId, nativeSnapshot,
    boundaryEvidence: collected.boundaryEvidence, physicalEvidence: collected.physicalEvidence, coverage: collected.coverage,
    diagnostics: { persistence: 'stored', ...collected.diagnostics } };
  let record: FailureRecording;
  let stored: FailureRecording | undefined;
  const persist = options.persist ?? (async (value: FailureRecording) => { stored = clone(value); });
  const load = options.load ?? (async () => clone(stored));
  try {
    await persist(clone(draft));
    const loaded = await load({ storeId, runId: draft.runId, flowId });
    diagnoseFailureRecording(loaded);
    if (JSON.stringify(loaded) !== JSON.stringify(draft)) throw new TypeError('Local recording changed after storage');
    record = clone(loaded) as FailureRecording;
  } catch {
    record = { schemaVersion: 1, storeId, runId: draft.runId, flowId, nativeSnapshot: null, boundaryEvidence: [],
      diagnostics: { persistence: 'failed', observer: collected.diagnostics.observer, code: 'LOCAL_TRACE_STORE_FAILED' } };
  }
  return { record, observed: { mode: 'local-sdk-double', logicalInvocations, physicalDispatches, paymentWriteAttempts,
    reconciliation, businessResult, earlierSnapshotUnchanged, modelCalls: 0, networkCalls: 0, cloudCalls: 0 } };
}
