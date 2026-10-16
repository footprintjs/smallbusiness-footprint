import { flowChart, FlowChartExecutor, decide, type TypedScope } from 'footprintjs';
import { footprintRuntimeVersion } from '../runtimeVersion.js';
import { captureExecutionRunOptions, type ExecutionRunOptions } from 'footprint-blueprint/actions';
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
function matchingPayment(a: AfterSalesPayment, b: AfterSalesPayment) {
  payment(a); payment(b);
  if (['provider', 'paymentId', 'currency', 'mode', 'capturedCents'].some(key => a[key as keyof AfterSalesPayment] !== b[key as keyof AfterSalesPayment])) ineligible();
}
const sameRequest = (record: AfterSalesCase, command: AfterSalesRequest) => record.orderId === command.orderId && record.requestId === command.requestId && record.kind === command.kind
  && JSON.stringify([...record.items].sort((a, b) => a.lineId.localeCompare(b.lineId))) === JSON.stringify(command.items)
  && record.reason === command.reason && (command.kind !== 'return' || record.condition?.unworn === !!command.unworn && record.condition.tagsAttached === !!command.tagsAttached);

export type AfterSalesDependencies = {
  storeId: string; repository: AfterSalesRepository; payments: AfterSalesPayments; policy?: AfterSalesPolicy;
  authorizer: (action: 'request' | AfterSalesAction['action'], context: AfterSalesContext, resource: { orderId?: string; caseId?: string }) => boolean | Promise<boolean>;
  now?: () => string; generateId?: () => string; onTrace?: (trace: AfterSalesTrace) => void | Promise<void>;
  /** Trusted host controls. No budget or retry policy is invented by this domain library. */
  executionOptions?: (request: Readonly<{ flowId: AfterSalesTrace['flowId'] }>) => ExecutionRunOptions | undefined;
};

/** Real FootprintJS charts; all private command, provider and repository data stays in request-local closures. */
export function createAfterSalesService(deps: AfterSalesDependencies) {
  const { repository, payments } = deps;
  if (!identifier(deps.storeId) || typeof deps.authorizer !== 'function' || !repository || !payments) invalid();
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
  async function execute(flowId: AfterSalesTrace['flowId'], handlers: { name: string; run: () => Promise<void> }[], decisions: string[], route?: () => AfterSalesAction['action']) {
    const stages: string[] = [];
    type SafeTraceState = { phase: string; decisions: string[]; action?: string };
    const wrap = (name: string, handler: () => Promise<void>) => async (scope: TypedScope<SafeTraceState>) => {
      scope.phase = name;
      try { await handler(); } catch (error) { throw safeFailure(error); }
      finally { scope.decisions = [...decisions]; }
    };
    let builder = flowChart<SafeTraceState>(handlers[0].name, wrap(handlers[0].name, handlers[0].run), handlers[0].name);
    const sequential = route ? handlers.slice(1, -1) : handlers.slice(1);
    sequential.forEach(handler => { builder = builder.addFunction(handler.name, wrap(handler.name, handler.run), handler.name); });
    if (route) {
      const branch = builder.addDeciderFunction('route-owner-action', scope => {
        scope.action = route();
        return decide(scope, ['approve', 'reject', 'receive', 'refund'].map(name => ({ when: { action: { eq: name } }, then: name, label: `Owner action: ${name}` })), 'reconcile');
      }, 'route-owner-action');
      for (const which of ['approve', 'reject', 'receive', 'refund', 'reconcile']) branch.addFunctionBranch(which, `owner-${which}`, wrap(`owner-${which}`, handlers[handlers.length - 1].run));
      builder = branch.end();
    }
    const chart = builder.build();
    const executor = new FlowChartExecutor(chart);
    executor.enableNarrative();
    executor.attachFlowRecorder({ id: 'aftersales-metadata', onStageExecuted(event) { stages.push(event.stageName); } });
    let failure: AfterSalesError | undefined;
    const startedAt = new Date().toISOString();
    try { await executor.run(captureExecutionRunOptions(deps.executionOptions?.(Object.freeze({ flowId })))); } catch (error) { failure = safeFailure(error); }
    const finishedAt = new Date().toISOString();
    const trace: AfterSalesTrace = { flowId, runId: executor.getSnapshot({ redact: true }).runId, startedAt, finishedAt, outcome: failure ? 'error' : 'ok',
      stages: [...stages], decisions: [...decisions], ...(failure ? { code: failure.code } : {}),
      nativeSnapshot: executor.getSnapshot({ redact: true }), flowSpec: chart.buildTimeStructure!, narrative: executor.getNarrativeEntries(),
      runtime: { library: 'footprintjs', version: footprintRuntimeVersion } };
    try { await deps.onTrace?.(trace); } catch { /* A diagnostic failure cannot reverse a refund or durable case. */ }
    if (failure) throw failure;
  }
  function eligible(record: AfterSalesOrder, command: AfterSalesRequest) {
    if (!['paid', 'preparing', 'shipped', 'delivered'].includes(record.status)) ineligible();
    for (const selected of command.items) {
      const line = record.items.find(line => line.lineId === selected.lineId);
      const allocated = record.allocatedQuantities[selected.lineId] ?? 0;
      if (!line || !integer(line.quantity) || !integer(allocated) || selected.quantity > line.quantity - allocated) ineligible();
    }
    if (command.kind === 'cancellation') {
      if (!policy.cancellationEnabled) ineligible();
      if (!['paid', 'preparing'].includes(record.status) || record.shippedAt || record.fulfillmentLocked) ineligible();
    } else {
      if (!policy.returnsEnabled) ineligible();
      if (record.status !== 'delivered' || !record.deliveredAt || !Number.isFinite(Date.parse(record.deliveredAt))) ineligible();
      const age = Date.parse(now()) - Date.parse(record.deliveredAt);
      if (age < 0 || age > policy.returnWindowDays * 86_400_000 || policy.requireUnworn && command.unworn !== true || policy.requireTags && command.tagsAttached !== true) ineligible();
    }
  }
  function next(record: AfterSalesCase, update: Partial<AfterSalesCase>): AfterSalesCase {
    if (!Number.isSafeInteger(record.version + 1)) conflict();
    return { ...record, ...update, version: record.version + 1, updatedAt: now() };
  }
  async function restock(record: AfterSalesCase) {
    if (!record.restock?.requested || record.restock.completedAt) return record;
    if (record.state !== 'REFUNDED' || record.refund?.status !== 'SUCCEEDED' || record.kind === 'return' && !record.inspection?.accepted) ineligible();
    const snapshot = await order(record.orderId);
    const selected = record.items.map(item => {
      const line = snapshot.items.find(line => line.lineId === item.lineId);
      if (!line || item.quantity > line.quantity) ineligible();
      return { ...line, quantity: item.quantity };
    });
    return checkedCase(await repository.restock({ record: next(record, { restock: { requested: true, completedAt: now() } }), expectedVersion: record.version, items: selected }), record.caseId);
  }
  async function settle(record: AfterSalesCase, evidence: AfterSalesRefundEvidence, snapshot: AfterSalesOrder) {
    const intent = record.refund!;
    if (!evidence || evidence.provider !== intent.payment.provider || evidence.paymentId !== intent.payment.paymentId
      || evidence.idempotencyKey !== intent.idempotencyKey || evidence.amountCents !== intent.amountCents
      || evidence.currency !== intent.payment.currency || evidence.mode !== intent.payment.mode || !identifier(evidence.refundId)
      || !['pending', 'succeeded', 'failed'].includes(evidence.status)) fail('AFTERSALES_PROVIDER_UNKNOWN', 'The provider outcome requires reconciliation');
    if (intent.providerRefundId && intent.providerRefundId !== evidence.refundId) fail('AFTERSALES_PROVIDER_UNKNOWN', 'The provider outcome requires reconciliation');
    if (intent.status === 'FAILED') return record; // A terminal failed refund never reopens automatically.
    if (intent.status === 'SUCCEEDED' && evidence.status === 'succeeded') return restock(record);
    if (intent.status === 'SUCCEEDED' && evidence.status === 'pending') fail('AFTERSALES_PROVIDER_UNKNOWN', 'The provider outcome requires reconciliation');
    const succeeded = evidence.status === 'succeeded';
    const full = record.items.length === snapshot.items.length && snapshot.items.every(line => record.items.some(item => item.lineId === line.lineId && item.quantity === line.quantity));
    const saved = checkedCase(await repository.completeRefund({ expectedVersion: record.version,
      record: next(record, { state: succeeded ? 'REFUNDED' : evidence.status === 'failed' ? 'REFUND_FAILED' : 'REFUND_PENDING',
        refund: { ...intent, status: succeeded ? 'SUCCEEDED' : evidence.status === 'failed' ? 'FAILED' : 'PENDING', providerRefundId: evidence.refundId } }),
      orderDisposition: succeeded && record.kind === 'cancellation' ? full ? 'cancelled' : 'hold-for-review' : 'unchanged' }), record.caseId);
    return succeeded ? restock(saved) : saved;
  }
  async function reconcile(record: AfterSalesCase, decisions: string[]) {
    if (!record.refund || !['REFUND_PENDING', 'REFUND_UNKNOWN', 'REFUND_FAILED', 'REFUNDED'].includes(record.state)) ineligible();
    if (record.refund.status === 'FAILED') { decisions.push('refund.confirmed-failure-manual-review'); return record; }
    const snapshot = await order(record.orderId), intent = record.refund;
    let evidence: AfterSalesRefundEvidence | undefined;
    try {
      evidence = intent.providerRefundId
        ? await payments.retrieveRefund({ orderId: record.orderId, paymentId: intent.payment.paymentId, refundId: intent.providerRefundId, idempotencyKey: intent.idempotencyKey })
        : await payments.findRefund({ orderId: record.orderId, paymentId: intent.payment.paymentId, idempotencyKey: intent.idempotencyKey });
    } catch { decisions.push('refund.reconciliation-unavailable'); return record; }
    if (!evidence) { decisions.push('refund.outcome-still-unknown'); return record; }
    decisions.push('refund.authoritative-reconciliation'); return settle(record, evidence, snapshot);
  }
  return Object.freeze({
    async request(input: AfterSalesRequest, context: AfterSalesContext): Promise<AfterSalesCase> {
      let command: AfterSalesRequest, snapshot: AfterSalesOrder, result: AfterSalesCase | undefined;
      const decisions: string[] = [];
      await execute('aftersales-request', [
        { name: 'validate-request', async run() { command = request(input); } },
        { name: 'authorize-request', async run() { await authorize('request', context, { orderId: command.orderId }); } },
        { name: 'deduplicate-request', async run() {
          const existing = await repository.findCase(command.orderId, command.requestId);
          if (existing) { checkedCase(existing); if (!sameRequest(existing, command)) conflict(); result = existing; decisions.push('request.idempotent-replay'); }
        } },
        { name: 'check-eligibility', async run() { if (!result) { snapshot = await order(command.orderId); eligible(snapshot, command); decisions.push(command.kind === 'return' ? 'return.policy-satisfied' : 'cancellation.before-shipping-claim'); } } },
        { name: 'persist-request', async run() {
          if (result) return;
          const caseId = generateId(); if (!identifier(caseId)) invalid(); const at = now();
          const record: AfterSalesCase = { caseId, storeId: deps.storeId, orderId: command.orderId, requestId: command.requestId,
            kind: command.kind, state: 'REQUESTED', version: 1, items: command.items, policy: structuredClone(policy), createdAt: at, updatedAt: at,
            ...(command.reason ? { reason: command.reason } : {}), ...(command.kind === 'return' ? { condition: { unworn: !!command.unworn, tagsAttached: !!command.tagsAttached } } : {}) };
          result = checkedCase(await repository.createCase({ record, expectedOrderVersion: snapshot.version }));
          if (!sameRequest(result, command)) conflict(); decisions.push('request.persisted-owner-approval-required');
        } },
      ], decisions);
      return structuredClone(result!);
    },
    async action(input: AfterSalesAction, context: AfterSalesContext): Promise<AfterSalesCase> {
      let command: AfterSalesAction, record: AfterSalesCase, result: AfterSalesCase;
      const decisions: string[] = [];
      await execute('aftersales-action', [
        { name: 'validate-action', async run() { command = action(input); } },
        { name: 'authorize-owner', async run() { await authorize(command.action, context, { caseId: command.caseId }); } },
        { name: 'load-current-case', async run() { record = await getCase(command.caseId); if (record.version !== command.expectedVersion) conflict(); } },
        { name: 'apply-owner-action', async run() {
          if (command.action === 'approve' || command.action === 'reject') {
            if (record.state !== 'REQUESTED') ineligible();
            result = checkedCase(await repository.saveCase({ expectedVersion: record.version, record: next(record,
              command.action === 'approve' ? { state: 'APPROVED', approvedAt: now(), approvedBy: context.actorId, ...(text(command.reason) ? { ownerReason: text(command.reason) } : {}) }
                : { state: 'REJECTED', ...(text(command.reason) ? { ownerReason: text(command.reason) } : {}) }) }));
            decisions.push(command.action === 'approve' ? 'owner.approved' : 'owner.rejected'); return;
          }
          if (command.action === 'receive') {
            if (record.kind !== 'return' || record.state !== 'APPROVED' || !record.approvedAt) ineligible();
            result = checkedCase(await repository.saveCase({ expectedVersion: record.version, record: next(record, {
              state: command.accepted ? 'RETURN_RECEIVED' : 'INSPECTION_FAILED', inspection: { accepted: command.accepted, receivedAt: now(), receivedBy: context.actorId },
              ...(text(command.reason) ? { ownerReason: text(command.reason) } : {}) }) }));
            decisions.push(command.accepted ? 'return.inspection-accepted' : 'return.inspection-rejected'); return;
          }
          if (command.action === 'reconcile') { result = await reconcile(record, decisions); return; }
          if (command.action !== 'refund') invalid();
          if (record.refund) {
            if (record.refund.amountCents !== command.amountCents || record.restock?.requested !== !!command.restock) conflict();
            decisions.push('refund.existing-intent-reconcile-only'); result = await reconcile(record, decisions); return;
          }
          if (!record.approvedAt || record.kind === 'cancellation' && record.state !== 'APPROVED'
            || record.kind === 'return' && (record.state !== 'RETURN_RECEIVED' || !record.inspection?.accepted)) ineligible();
          const snapshot = await order(record.orderId);
          if (record.kind === 'cancellation' && (snapshot.shippedAt || !['paid', 'preparing'].includes(snapshot.status))) ineligible();
          let currentPayment: AfterSalesPayment;
          try { currentPayment = await payments.getPayment({ orderId: record.orderId, paymentId: snapshot.payment.paymentId }); }
          catch { fail('AFTERSALES_PROVIDER_UNKNOWN', 'The provider outcome requires reconciliation'); }
          matchingPayment(snapshot.payment, currentPayment!);
          if (command.amountCents > currentPayment!.capturedCents - Math.max(currentPayment!.refundedCents, snapshot.payment.refundedCents) - snapshot.refundReservedCents) ineligible();
          const intentId = generateId(); if (!identifier(intentId)) invalid();
          const prepared = checkedCase(await repository.prepareRefund({ expectedVersion: record.version, expectedOrderVersion: snapshot.version,
            record: next(record, { state: 'REFUND_PENDING', restock: { requested: !!command.restock }, refund: { intentId,
              idempotencyKey: `aftersales:${record.caseId}:refund-v1`, payment: structuredClone(currentPayment!), amountCents: command.amountCents, status: 'PREPARED', preparedAt: now() } }) }));
          decisions.push('refund.intent-persisted-and-budget-reserved');
          let evidence: AfterSalesRefundEvidence;
          try { evidence = await payments.refund({ orderId: record.orderId, caseId: record.caseId, paymentId: currentPayment!.paymentId,
            amountCents: command.amountCents, currency: currentPayment!.currency, idempotencyKey: prepared.refund!.idempotencyKey, preparedAt: prepared.refund!.preparedAt }); }
          catch {
            decisions.push('refund.provider-outcome-unknown');
            result = checkedCase(await repository.completeRefund({ expectedVersion: prepared.version, orderDisposition: 'unchanged', record: next(prepared, { state: 'REFUND_UNKNOWN', refund: { ...prepared.refund!, status: 'UNKNOWN' } }) })); return;
          }
          result = await settle(prepared, evidence!, snapshot); decisions.push('refund.provider-result-recorded');
        } },
      ], decisions, () => command.action);
      return structuredClone(result!);
    },
  });
}
