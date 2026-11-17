import { FlowChartExecutor, type TypedScope, type RecordFlushResult } from 'footprintjs';
import { AFTER_SALES_CHARTS, type AfterSalesFacts, type AfterSalesHooks, type AfterSalesStage } from './flowCharts.js';
import type { RecordSink } from 'foottrace/write';
import { createCauseCapture } from 'footprint-blueprint/diagnostics/cause';
import { footprintRuntimeVersion } from '../runtimeVersion.js';
import { captureExecutionRunOptions, type ExecutionRunOptions } from 'footprint-blueprint/actions';
import type { BoundaryOperation, BoundaryCallContext } from 'footprint-blueprint/diagnostics/runtime';
import { createCommerceBoundaryRecorder } from '../diagnostics/runtime.js';
import {
  AfterSalesError, DEFAULT_AFTER_SALES_POLICY, validateAfterSalesPolicy,
  type AfterSalesAction, type AfterSalesCase, type AfterSalesContext, type AfterSalesItems, type AfterSalesOrder,
  type AfterSalesPayment, type AfterSalesPayments, type AfterSalesPolicy, type AfterSalesRefundEvidence,
  type AfterSalesRepository, type AfterSalesRequest, type AfterSalesTrace,
} from '../aftersales.js';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
function fail(code: AfterSalesError['code'], message: string): never { throw new AfterSalesError(code, message); }
function invalid(): never { return fail('AFTERSALES_INVALID', 'The after-sales command is invalid'); }
function conflict(): never { return fail('AFTERSALES_CONFLICT', 'The case changed; reload it before continuing'); }
function ineligible(): never { return fail('AFTERSALES_INELIGIBLE', 'This order or case is not eligible for this action'); }
const safeFailure = (error: unknown) => error instanceof AfterSalesError ? new AfterSalesError(error.code, {
  AFTERSALES_INVALID: 'The after-sales command is invalid', AFTERSALES_UNAUTHORIZED: 'This action is not authorized',
  AFTERSALES_NOT_FOUND: 'The order or case was not found', AFTERSALES_INELIGIBLE: 'This order or case is not eligible for this action',
  AFTERSALES_CONFLICT: 'The case changed; reload it before continuing', AFTERSALES_PROVIDER_UNKNOWN: 'The provider outcome requires reconciliation',
  AFTERSALES_STORAGE_UNAVAILABLE: 'After-sales storage is unavailable',
}[error.code]) : new AfterSalesError('AFTERSALES_STORAGE_UNAVAILABLE', 'After-sales storage is unavailable');
const text = (value: unknown) => value === undefined ? undefined : typeof value === 'string' && value.trim().length <= 1000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ? value.trim() || undefined : invalid();
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!object(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
  }
}
function items(value: unknown): AfterSalesItems {
  if (!Array.isArray(value) || !value.length || value.length > 100) invalid();
  const seen = new Set<string>();
  return value.map(item => {
    exact(item, ['lineId', 'quantity']);
    if (!identifier(item.lineId) || !integer(item.quantity) || !item.quantity || item.quantity > 1000 || seen.has(item.lineId)) invalid();
    seen.add(item.lineId); return { lineId: item.lineId, quantity: item.quantity };
  }).sort((a, b) => a.lineId.localeCompare(b.lineId));
}
function request(value: unknown): AfterSalesRequest {
  exact(value, ['orderId', 'requestId', 'kind', 'items', 'reason', 'unworn', 'tagsAttached']);
  if (!identifier(value.orderId) || !identifier(value.requestId) || !['cancellation', 'return'].includes(String(value.kind))
    || ['unworn', 'tagsAttached'].some(key => value[key] !== undefined && typeof value[key] !== 'boolean')) invalid();
  return { orderId: value.orderId, requestId: value.requestId, kind: value.kind as AfterSalesRequest['kind'], items: items(value.items),
    ...(text(value.reason) ? { reason: text(value.reason) } : {}),
    ...(value.unworn !== undefined ? { unworn: value.unworn as boolean } : {}), ...(value.tagsAttached !== undefined ? { tagsAttached: value.tagsAttached as boolean } : {}) };
}
function action(value: unknown): AfterSalesAction {
  exact(value, ['action', 'caseId', 'expectedVersion', 'reason', 'accepted', 'amountCents', 'restock']);
  if (!identifier(value.caseId) || !integer(value.expectedVersion) || !['approve', 'reject', 'receive', 'refund', 'reconcile'].includes(String(value.action))) invalid();
  const allowed = value.action === 'refund' ? ['action', 'caseId', 'expectedVersion', 'amountCents', 'restock']
    : value.action === 'receive' ? ['action', 'caseId', 'expectedVersion', 'accepted', 'reason']
      : value.action === 'reconcile' ? ['action', 'caseId', 'expectedVersion'] : ['action', 'caseId', 'expectedVersion', 'reason'];
  exact(value, allowed);
  if (value.action === 'refund' && (!integer(value.amountCents) || !value.amountCents || value.restock !== undefined && typeof value.restock !== 'boolean')
    || value.action === 'receive' && typeof value.accepted !== 'boolean') invalid();
  return structuredClone(value) as AfterSalesAction;
}
function payment(value: AfterSalesPayment): AfterSalesPayment {
  if (!value || !identifier(value.provider) || !identifier(value.paymentId) || !/^[A-Z]{3}$/.test(value.currency)
    || !['test', 'production'].includes(value.mode) || !integer(value.capturedCents) || !integer(value.refundedCents)
    || value.refundedCents > value.capturedCents) ineligible();
  return value;
}
function matchingPayment(a: AfterSalesPayment, b: AfterSalesPayment): boolean {
  payment(a); payment(b);
  return ['provider', 'paymentId', 'currency', 'mode', 'capturedCents'].every(key => a[key as keyof AfterSalesPayment] === b[key as keyof AfterSalesPayment]);
}
const sameRequest = (record: AfterSalesCase, command: AfterSalesRequest) => record.orderId === command.orderId && record.requestId === command.requestId && record.kind === command.kind
  && JSON.stringify([...record.items].sort((a, b) => a.lineId.localeCompare(b.lineId))) === JSON.stringify(command.items)
  && record.reason === command.reason && (command.kind !== 'return' || record.condition?.unworn === !!command.unworn && record.condition.tagsAttached === !!command.tagsAttached);

export interface AfterSalesBoundaryPort {
  run<T>(operation: BoundaryOperation, work: (context: BoundaryCallContext) => Promise<T>): Promise<T>;
}
export type AfterSalesDependencies = {
  storeId: string; repository: AfterSalesRepository; payments: AfterSalesPayments; policy?: AfterSalesPolicy;
  authorizer: (action: 'request' | AfterSalesAction['action'], context: AfterSalesContext, resource: { orderId?: string; caseId?: string }) => boolean | Promise<boolean>;
  now?: () => string; generateId?: () => string; onTrace?: (trace: AfterSalesTrace) => void | Promise<void>;
  /** Trusted host controls. No budget or retry policy is invented by this domain library. */
  executionOptions?: (request: Readonly<{ flowId: AfterSalesTrace['flowId'] }>) => ExecutionRunOptions | undefined;
  /** Optional host-owned request context; each stage gets a port bound to its real native executor scope. */
  withBoundaryScope?: (port: AfterSalesBoundaryPort, work: () => Promise<void>) => Promise<void>;
  /** Optional host storage port. The fresh diagnostic recordId is independent of all business identifiers.
   * Undefined disables recording for this execution. Factory/adapter failures never change a business result.
   * After-sales always uses report/manual mode and a bounded final flush; the host owns durable acknowledgements.
   */
  recordSink?: (request: Readonly<{ flowId: AfterSalesTrace['flowId']; recordId: string }>) => RecordSink | undefined;
  /** Final diagnostic drain only, 0–2000 ms (default 250). It does not cap or cancel a provider/business call. */
  recordSinkFlushTimeoutMs?: number;
};

/** Consume an accidentally asynchronous trusted factory without reading arbitrary thenable properties. */
function consumeNativePromise(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  try { Promise.prototype.then.call(value, () => undefined, () => undefined); return true; }
  catch { return false; }
}

/** Real FootprintJS charts; all private command, provider and repository data stays in request-local closures. */
export function createAfterSalesService(deps: AfterSalesDependencies) {
  const { repository, payments } = deps;
  if (!identifier(deps.storeId) || typeof deps.authorizer !== 'function' || !repository || !payments
    || deps.withBoundaryScope !== undefined && typeof deps.withBoundaryScope !== 'function'
    || deps.recordSink !== undefined && typeof deps.recordSink !== 'function'
    || deps.recordSinkFlushTimeoutMs !== undefined && (!integer(deps.recordSinkFlushTimeoutMs) || deps.recordSinkFlushTimeoutMs > 2000)) invalid();
  const recordSink = deps.recordSink, recordSinkFlushTimeoutMs = deps.recordSinkFlushTimeoutMs ?? 250;
  const policy = validateAfterSalesPolicy(deps.policy ?? DEFAULT_AFTER_SALES_POLICY);
  const now = () => { const value = (deps.now ?? (() => new Date().toISOString()))(); if (!Number.isFinite(Date.parse(value))) invalid(); return value; };
  const generateId = deps.generateId ?? (() => globalThis.crypto.randomUUID());
  async function authorize(which: 'request' | AfterSalesAction['action'], context: AfterSalesContext, resource: { orderId?: string; caseId?: string }) {
    if (!context || !identifier(context.actorId) || !['owner', 'customer'].includes(context.role) || which !== 'request' && context.role !== 'owner') fail('AFTERSALES_UNAUTHORIZED', 'This action is not authorized');
    let allowed = false; try { allowed = await deps.authorizer(which, context, resource); } catch { /* Fail closed without echoing the private exception. */ }
    if (allowed !== true) fail('AFTERSALES_UNAUTHORIZED', 'This action is not authorized');
  }
  const order = async (orderId: string) => {
    const value = await repository.getOrder(orderId);
    if (!value) fail('AFTERSALES_NOT_FOUND', 'The order or case was not found');
    if (value.storeId !== deps.storeId || value.orderId !== orderId || !integer(value.version) || !Array.isArray(value.items) || !value.items.length
      || !integer(value.refundReservedCents) || !object(value.allocatedQuantities)) ineligible();
    payment(value.payment);
    return value;
  };
  const checkedCase = (record: AfterSalesCase, caseId?: string) => {
    if (!record || record.storeId !== deps.storeId || caseId && record.caseId !== caseId || !identifier(record.caseId) || !identifier(record.orderId) || !integer(record.version)) ineligible();
    return record;
  };
  const getCase = async (caseId: string) => {
    const value = await repository.getCase(caseId);
    if (!value) fail('AFTERSALES_NOT_FOUND', 'The order or case was not found');
    return checkedCase(value, caseId);
  };
  async function execute(flowId: AfterSalesTrace['flowId'], hooks: AfterSalesHooks, decisions: string[]) {
    const stages: string[] = [];
    const boundaries = deps.withBoundaryScope ? createCommerceBoundaryRecorder() : undefined;
    const wrap = (name: string, handler: AfterSalesStage) => async (scope: TypedScope<AfterSalesFacts>) => {
      scope.phase = name;
      try {
        if (boundaries && deps.withBoundaryScope) {
          const port: AfterSalesBoundaryPort = Object.freeze({
            run: <T>(operation: BoundaryOperation, work: (context: BoundaryCallContext) => Promise<T>) => boundaries.run(scope, operation, work),
          });
          await deps.withBoundaryScope(port, async () => { await handler(scope); });
        } else await handler(scope);
      } catch (error) { throw safeFailure(error); }
      finally { scope.decisions = [...decisions]; }
    };
    const chart = AFTER_SALES_CHARTS[flowId](hooks, wrap);
    const capture = { readTracking: 'full', writeTracking: 'full', commitValues: 'full', writeProvenance: 'reads-prefix' } as const;
    const causeCapture = createCauseCapture();
    // A diagnostic factory gets no command, case, payment or customer data. A separate UUID also prevents
    // retries of the same business command from accidentally overwriting an earlier execution's prefix.
    let recording: AfterSalesTrace['recording'];
    let executor: FlowChartExecutor;
    if (recordSink) {
      const recordId = globalThis.crypto.randomUUID();
      try {
        const adapter = recordSink(Object.freeze({ flowId, recordId }));
        if (consumeNativePromise(adapter)) throw new TypeError('recordSink must return a native sink synchronously');
        executor = new FlowChartExecutor(chart, { ...capture,
          ...(adapter === undefined ? {} : { sink: { adapter, onFailure: 'report', flush: 'manual' } as const }),
        });
        if (adapter !== undefined) recording = { recordId, status: 'attached' };
      } catch {
        // Optional observability must not turn a durable refund acknowledgement into a retryable failure.
        executor = new FlowChartExecutor(chart, capture);
        recording = { recordId, status: 'unavailable' };
      }
    } else executor = new FlowChartExecutor(chart, capture);
    executor.setRedactionPolicy({ keys: ['idempotencyKey', 'authorization', 'token', 'secret', 'password', 'recordSinkError'],
      diagnostics: { keys: ['errors.recordSinkError'] } });
    executor.enableNarrative();
    executor.attachFlowRecorder(causeCapture.recorder);
    executor.attachFlowRecorder({ id: 'aftersales-metadata', onStageExecuted(event) { stages.push(event.stageName); } });
    if (boundaries) executor.attachFlowRecorder(boundaries.flowRecorder);
    let failure: AfterSalesError | undefined;
    const startedAt = new Date().toISOString();
    try { await executor.run(captureExecutionRunOptions(deps.executionOptions?.(Object.freeze({ flowId })))); } catch (error) { failure = safeFailure(error); }
    const finishedAt = new Date().toISOString();
    if (recording?.status === 'attached') {
      let flush: RecordFlushResult;
      try { flush = await executor.flushRecord({ timeoutMs: recordSinkFlushTimeoutMs }); }
      catch { flush = { done: false, failed: true, pending: false }; }
      recording = { ...recording, flush };
    }
    const nativeSnapshot = executor.getSnapshot({ redact: true });
    let recordedCause: AfterSalesTrace['causeCapture'];
    try { recordedCause = causeCapture.snapshot(nativeSnapshot); } catch { /* Missing diagnostic coverage stays unknown; never retry acknowledged commerce. */ }
    const trace: AfterSalesTrace = { flowId, runId: executor.getSnapshot({ redact: true }).runId, startedAt, finishedAt, outcome: failure ? 'error' : 'ok',
      stages: [...stages], decisions: [...decisions], ...(failure ? { code: failure.code } : {}),
      nativeSnapshot, ...(recordedCause ? { causeCapture: recordedCause } : {}), flowSpec: chart.buildTimeStructure!, narrative: executor.getNarrativeEntries(),
      runtime: { library: 'footprintjs', version: footprintRuntimeVersion },
      ...(boundaries ? { boundaryDiagnostics: boundaries.snapshot() } : {}), ...(recording ? { recording } : {}) };
    try { await deps.onTrace?.(trace); } catch { /* A diagnostic failure cannot reverse a refund or durable case. */ }
    if (failure) throw failure;
  }
  const failures: AfterSalesHooks = {
    ineligible: () => ineligible(), conflict: () => conflict(), invalid: () => invalid(),
    'provider-unknown': () => fail('AFTERSALES_PROVIDER_UNKNOWN', 'The provider outcome requires reconciliation'),
  };
  function next(record: AfterSalesCase, update: Partial<AfterSalesCase>): AfterSalesCase {
    if (!Number.isSafeInteger(record.version + 1)) conflict();
    return { ...record, ...update, version: record.version + 1, updatedAt: now() };
  }
  return Object.freeze({
    async request(input: AfterSalesRequest, context: AfterSalesContext): Promise<AfterSalesCase> {
      let command!: AfterSalesRequest, snapshot!: AfterSalesOrder;
      let existing: AfterSalesCase | undefined, result: AfterSalesCase | undefined;
      const decisions: string[] = [];
      const hooks: AfterSalesHooks = {
        ...failures,
        'validate-request'(scope) { command = request(input); scope.requestKind = command.kind; },
        async 'authorize-request'() { await authorize('request', context, { orderId: command.orderId }); },
        async 'deduplicate-request'(scope) {
          existing = await repository.findCase(command.orderId, command.requestId);
          scope.existingCase = Boolean(existing);
        },
        'read-replay-match'(scope) { checkedCase(existing!); scope.replayMatches = sameRequest(existing!, command); },
        'reuse-request'(scope) { result = existing; scope.outcome = 'REPLAY'; decisions.push('request.idempotent-replay'); },
        async 'load-request-order'(scope) {
          snapshot = await order(command.orderId); scope.requestKind = command.kind;
          scope.orderStateEligible = ['paid', 'preparing', 'shipped', 'delivered'].includes(snapshot.status);
        },
        'initialize-request-items'(scope) { scope.itemIndex = 0; scope.itemCount = command.items.length; },
        'inspect-request-item'(scope) {
          const selected = command.items[scope.itemIndex!], line = snapshot.items.find(line => line.lineId === selected.lineId);
          const allocated = snapshot.allocatedQuantities[selected.lineId] ?? 0;
          scope.lineEligible = Boolean(line && integer(line.quantity) && integer(allocated) && selected.quantity <= line.quantity - allocated);
          scope.lineCheck = { position: scope.itemIndex!, eligible: scope.lineEligible };
          scope.itemIndex = scope.itemIndex! + 1;
        },
        'read-cancellation-policy'(scope) {
          scope.cancellationEligible = Boolean(policy.cancellationEnabled && ['paid', 'preparing'].includes(snapshot.status) && !snapshot.shippedAt && !snapshot.fulfillmentLocked);
          scope.policySatisfied = scope.cancellationEligible;
        },
        'read-return-policy'(scope) {
          const delivered = policy.returnsEnabled && snapshot.status === 'delivered' && snapshot.deliveredAt && Number.isFinite(Date.parse(snapshot.deliveredAt));
          const age = delivered ? Date.parse(now()) - Date.parse(snapshot.deliveredAt!) : NaN;
          scope.returnEligible = Boolean(delivered && age >= 0 && age <= policy.returnWindowDays * 86_400_000 && (!policy.requireUnworn || command.unworn === true) && (!policy.requireTags || command.tagsAttached === true));
          scope.policySatisfied = scope.returnEligible;
        },
        async 'persist-request'(scope) {
          decisions.push(command.kind === 'return' ? 'return.policy-satisfied' : 'cancellation.before-shipping-claim');
          const caseId = generateId(); if (!identifier(caseId)) invalid(); const at = now();
          const record: AfterSalesCase = { caseId, storeId: deps.storeId, orderId: command.orderId, requestId: command.requestId,
            kind: command.kind, state: 'REQUESTED', version: 1, items: command.items, policy: structuredClone(policy), createdAt: at, updatedAt: at,
            ...(command.reason ? { reason: command.reason } : {}), ...(command.kind === 'return' ? { condition: { unworn: !!command.unworn, tagsAttached: !!command.tagsAttached } } : {}) };
          result = checkedCase(await repository.createCase({ record, expectedOrderVersion: snapshot.version }));
          scope.persistedRequestMatches = sameRequest(result, command);
        },
        'request-persisted'(scope) { scope.outcome = 'REQUESTED'; decisions.push('request.persisted-owner-approval-required'); },
      };
      await execute('aftersales-request', hooks, decisions);
      return structuredClone(result!);
    },
    async action(input: AfterSalesAction, context: AfterSalesContext): Promise<AfterSalesCase> {
      let command!: AfterSalesAction, record!: AfterSalesCase, snapshot!: AfterSalesOrder;
      let result: AfterSalesCase | undefined, currentPayment!: AfterSalesPayment, prepared!: AfterSalesCase;
      let settling!: AfterSalesCase, evidence: AfterSalesRefundEvidence | undefined;
      let restocking!: AfterSalesCase, restockOrder!: AfterSalesOrder;
      let selectedRestock: AfterSalesOrder['items'][number][] = [];
      const decisions: string[] = [];
      const saveInspection = async (scope: TypedScope<AfterSalesFacts>, accepted: boolean) => {
        const reason = command as Extract<AfterSalesAction, { action: 'receive' }>;
        result = checkedCase(await repository.saveCase({ expectedVersion: record.version, record: next(record, {
          state: accepted ? 'RETURN_RECEIVED' : 'INSPECTION_FAILED', inspection: { accepted, receivedAt: now(), receivedBy: context.actorId },
          ...(text(reason.reason) ? { ownerReason: text(reason.reason) } : {}) }) }));
        scope.outcome = accepted ? 'RETURN_RECEIVED' : 'INSPECTION_FAILED';
        decisions.push(accepted ? 'return.inspection-accepted' : 'return.inspection-rejected');
      };
      const saveSettlement = async (scope: TypedScope<AfterSalesFacts>, status: AfterSalesRefundEvidence['status'], disposition: 'cancelled' | 'hold-for-review' | 'unchanged') => {
        const state = { succeeded: 'REFUNDED', failed: 'REFUND_FAILED', pending: 'REFUND_PENDING' } as const;
        const refundStatus = { succeeded: 'SUCCEEDED', failed: 'FAILED', pending: 'PENDING' } as const;
        result = checkedCase(await repository.completeRefund({ expectedVersion: settling.version,
          record: next(settling, { state: state[status], refund: { ...settling.refund!, status: refundStatus[status], providerRefundId: evidence!.refundId } }),
          orderDisposition: disposition }), settling.caseId);
        scope.outcome = state[status]; decisions.push('refund.provider-result-recorded');
      };
      const hooks: AfterSalesHooks = {
        ...failures,
        'validate-action'(scope) { command = action(input); scope.action = command.action; },
        async 'authorize-owner'() { await authorize(command.action, context, { caseId: command.caseId }); },
        async 'load-current-case'(scope) { record = await getCase(command.caseId); scope.versionCurrent = record.version === command.expectedVersion; },
        'owner-approve'(scope) { scope.ownerActionEligible = record.state === 'REQUESTED'; },
        async 'save-owner-approval'(scope) {
          const reason = command as Extract<AfterSalesAction, { action: 'approve' | 'reject' }>;
          result = checkedCase(await repository.saveCase({ expectedVersion: record.version, record: next(record, { state: 'APPROVED', approvedAt: now(), approvedBy: context.actorId,
            ...(text(reason.reason) ? { ownerReason: text(reason.reason) } : {}) }) }));
          scope.outcome = 'APPROVED'; decisions.push('owner.approved');
        },
        'owner-reject'(scope) { scope.ownerActionEligible = record.state === 'REQUESTED'; },
        async 'save-owner-rejection'(scope) {
          const reason = command as Extract<AfterSalesAction, { action: 'approve' | 'reject' }>;
          result = checkedCase(await repository.saveCase({ expectedVersion: record.version, record: next(record, { state: 'REJECTED', ...(text(reason.reason) ? { ownerReason: text(reason.reason) } : {}) }) }));
          scope.outcome = 'REJECTED'; decisions.push('owner.rejected');
        },
        'owner-receive'(scope) { scope.ownerActionEligible = Boolean(record.kind === 'return' && record.state === 'APPROVED' && record.approvedAt); },
        'read-inspection-result'(scope) { scope.inspectionAccepted = (command as Extract<AfterSalesAction, { action: 'receive' }>).accepted; },
        'save-accepted-inspection': scope => saveInspection(scope, true),
        'save-rejected-inspection': scope => saveInspection(scope, false),
        'owner-refund'(scope) { scope.hasExistingRefund = Boolean(record.refund); },
        'owner-reconcile'() {},
        'read-existing-refund-command'(scope) {
          const refund = command as Extract<AfterSalesAction, { action: 'refund' }>;
          scope.refundCommandMatches = record.refund!.amountCents === refund.amountCents && record.restock?.requested === !!refund.restock;
        },
        'existing-refund-matched'() { decisions.push('refund.existing-intent-reconcile-only'); },
        'read-refund-eligibility'(scope) {
          scope.refundEligible = Boolean(record.approvedAt && (record.kind === 'cancellation' && record.state === 'APPROVED' || record.kind === 'return' && record.state === 'RETURN_RECEIVED' && record.inspection?.accepted));
        },
        async 'load-refund-order'(scope) { snapshot = await order(record.orderId); scope.cancellationStillEligible = record.kind !== 'cancellation' || !snapshot.shippedAt && ['paid', 'preparing'].includes(snapshot.status); },
        async 'get-current-payment'(scope) {
          try { currentPayment = structuredClone(await payments.getPayment({ orderId: record.orderId, paymentId: snapshot.payment.paymentId })); scope.paymentAvailable = true; }
          catch { scope.paymentAvailable = false; }
        },
        'read-payment-identity'(scope) { scope.paymentMatchesOrder = matchingPayment(snapshot.payment, currentPayment); },
        'read-refund-budget'(scope) {
          scope.refundBudgetAvailable = (command as Extract<AfterSalesAction, { action: 'refund' }>).amountCents <= currentPayment.capturedCents - Math.max(currentPayment.refundedCents, snapshot.payment.refundedCents) - snapshot.refundReservedCents;
        },
        async 'prepare-refund-intent'(scope) {
          const refund = command as Extract<AfterSalesAction, { action: 'refund' }>;
          const intentId = generateId(); if (!identifier(intentId)) invalid();
          prepared = checkedCase(await repository.prepareRefund({ expectedVersion: record.version, expectedOrderVersion: snapshot.version,
            record: next(record, { state: 'REFUND_PENDING', restock: { requested: !!refund.restock }, refund: { intentId,
              idempotencyKey: `aftersales:${record.caseId}:refund-v1`, payment: structuredClone(currentPayment), amountCents: refund.amountCents, status: 'PREPARED', preparedAt: now() } }) }));
          settling = prepared; scope.refundPrepared = true; decisions.push('refund.intent-persisted-and-budget-reserved');
        },
        async 'send-refund'(scope) {
          const refund = command as Extract<AfterSalesAction, { action: 'refund' }>;
          try { evidence = structuredClone(await payments.refund({ orderId: record.orderId, caseId: record.caseId, paymentId: currentPayment.paymentId,
            amountCents: refund.amountCents, currency: currentPayment.currency, idempotencyKey: prepared.refund!.idempotencyKey, preparedAt: prepared.refund!.preparedAt })); scope.refundCallReturned = true; }
          catch { scope.refundCallReturned = false; }
        },
        async 'record-unknown-refund'(scope) {
          decisions.push('refund.provider-outcome-unknown');
          result = checkedCase(await repository.completeRefund({ expectedVersion: prepared.version, orderDisposition: 'unchanged', record: next(prepared, { state: 'REFUND_UNKNOWN', refund: { ...prepared.refund!, status: 'UNKNOWN' } }) }));
          scope.outcome = 'REFUND_UNKNOWN';
        },
        'read-reconciliation-eligibility'(scope) { scope.reconciliationEligible = Boolean(record.refund && ['REFUND_PENDING', 'REFUND_UNKNOWN', 'REFUND_FAILED', 'REFUNDED'].includes(record.state)); },
        'read-terminal-refund-status'(scope) { scope.terminalRefundFailure = record.refund!.status === 'FAILED'; },
        'manual-review-terminal-refund'(scope) { result = record; scope.outcome = 'UNCHANGED'; decisions.push('refund.confirmed-failure-manual-review'); },
        async 'load-reconciliation-order'(scope) { snapshot = await order(record.orderId); settling = record; scope.hasProviderRefundId = Boolean(record.refund!.providerRefundId); },
        async 'retrieve-existing-refund'(scope) {
          const intent = record.refund!;
          try { evidence = structuredClone(await payments.retrieveRefund({ orderId: record.orderId, paymentId: intent.payment.paymentId, refundId: intent.providerRefundId!, idempotencyKey: intent.idempotencyKey })); scope.reconciliationAvailable = true; }
          catch { scope.reconciliationAvailable = false; }
        },
        async 'find-existing-refund'(scope) {
          const intent = record.refund!;
          try { evidence = structuredClone(await payments.findRefund({ orderId: record.orderId, paymentId: intent.payment.paymentId, idempotencyKey: intent.idempotencyKey })); scope.reconciliationAvailable = true; }
          catch { scope.reconciliationAvailable = false; }
        },
        'read-refund-evidence-presence'(scope) { scope.evidencePresent = Boolean(evidence); },
        'record-authoritative-reconciliation'() { decisions.push('refund.authoritative-reconciliation'); },
        'keep-unknown-refund'(scope) { result = record; scope.outcome = 'UNCHANGED'; decisions.push('refund.outcome-still-unknown'); },
        'keep-unavailable-reconciliation'(scope) { result = record; scope.outcome = 'UNCHANGED'; decisions.push('refund.reconciliation-unavailable'); },
        'validate-refund-evidence'(scope) {
          const intent = settling.refund!;
          scope.evidenceMatches = Boolean(evidence && evidence.provider === intent.payment.provider && evidence.paymentId === intent.payment.paymentId
            && evidence.idempotencyKey === intent.idempotencyKey && evidence.amountCents === intent.amountCents && evidence.currency === intent.payment.currency
            && evidence.mode === intent.payment.mode && identifier(evidence.refundId) && ['pending', 'succeeded', 'failed'].includes(evidence.status)
            && (!intent.providerRefundId || intent.providerRefundId === evidence.refundId));
        },
        'read-prior-refund-status'(scope) { scope.priorRefundStatus = settling.refund!.status === 'FAILED' ? 'FAILED' : settling.refund!.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'unsettled'; },
        'read-settlement-status'(scope) { scope.evidenceStatus = evidence!.status; },
        'read-cancellation-disposition'(scope) { scope.cancellationRefund = settling.kind === 'cancellation'; },
        'read-full-cancellation'(scope) { scope.fullCancellation = settling.items.length === snapshot.items.length && snapshot.items.every(line => settling.items.some(item => item.lineId === line.lineId && item.quantity === line.quantity)); },
        'settle-cancelled': scope => saveSettlement(scope, 'succeeded', 'cancelled'),
        'settle-partial-cancellation': scope => saveSettlement(scope, 'succeeded', 'hold-for-review'),
        'settle-return': scope => saveSettlement(scope, 'succeeded', 'unchanged'),
        'settle-pending-refund': scope => saveSettlement(scope, 'pending', 'unchanged'),
        'settle-failed-refund': scope => saveSettlement(scope, 'failed', 'unchanged'),
        'read-restock-status'(scope) { restocking = result ?? settling; scope.restockPending = Boolean(restocking.restock?.requested && !restocking.restock.completedAt); },
        'keep-settled-result'(scope) { result = result ?? settling; scope.outcome = 'UNCHANGED'; },
        'read-restock-eligibility'(scope) { scope.restockEligible = Boolean(restocking.state === 'REFUNDED' && restocking.refund?.status === 'SUCCEEDED' && (restocking.kind !== 'return' || restocking.inspection?.accepted)); },
        async 'initialize-restock-items'(scope) { restockOrder = await order(restocking.orderId); selectedRestock = []; scope.restockIndex = 0; scope.restockCount = restocking.items.length; },
        'inspect-restock-item'(scope) {
          const item = restocking.items[scope.restockIndex!], line = restockOrder.items.find(line => line.lineId === item.lineId);
          scope.restockLineEligible = Boolean(line && item.quantity <= line.quantity);
          scope.restockLineCheck = { position: scope.restockIndex!, eligible: scope.restockLineEligible };
          selectedRestock.push({ ...line!, quantity: item.quantity }); scope.restockIndex = scope.restockIndex! + 1;
        },
        async 'commit-restock'(scope) { result = checkedCase(await repository.restock({ record: next(restocking, { restock: { requested: true, completedAt: now() } }), expectedVersion: restocking.version, items: selectedRestock }), restocking.caseId); scope.outcome = 'RESTOCKED'; },
      };
      await execute('aftersales-action', hooks, decisions);
      return structuredClone(result!);
    },
  });
}
