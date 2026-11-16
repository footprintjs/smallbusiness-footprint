import { flowChart, type FlowChart, type TypedScope } from 'footprintjs';

/** Bounded non-identifying facts only; commands, cases and provider values stay private. */
export type AfterSalesFacts = {
  phase: string; decisions: string[]; branchResult?: string; policySatisfied?: boolean; action?: string; requestKind?: string;
  existingCase?: boolean; replayMatches?: boolean; orderStateEligible?: boolean;
  itemIndex?: number; itemCount?: number; lineEligible?: boolean; lineCheck?: { position: number; eligible: boolean };
  cancellationEligible?: boolean; returnEligible?: boolean; persistedRequestMatches?: boolean;
  versionCurrent?: boolean; ownerActionEligible?: boolean; inspectionAccepted?: boolean;
  hasExistingRefund?: boolean; refundCommandMatches?: boolean; refundEligible?: boolean;
  cancellationStillEligible?: boolean; paymentAvailable?: boolean; paymentMatchesOrder?: boolean; refundBudgetAvailable?: boolean;
  refundPrepared?: boolean; refundCallReturned?: boolean;
  reconciliationEligible?: boolean; terminalRefundFailure?: boolean; hasProviderRefundId?: boolean;
  reconciliationAvailable?: boolean; evidencePresent?: boolean; evidenceMatches?: boolean;
  priorRefundStatus?: string; evidenceStatus?: string; cancellationRefund?: boolean; fullCancellation?: boolean;
  restockPending?: boolean; restockEligible?: boolean; restockIndex?: number; restockCount?: number;
  restockLineEligible?: boolean; restockLineCheck?: { position: number; eligible: boolean }; outcome?: string;
};
export type AfterSalesStage = (scope: TypedScope<AfterSalesFacts>) => void | Promise<void>;
export type AfterSalesWrap = (id: string, handler: AfterSalesStage) => AfterSalesStage;
export type AfterSalesHooks = Readonly<Record<string, AfterSalesStage>>;
export type AfterSalesChart = FlowChart<unknown, TypedScope<AfterSalesFacts>>;
type Builder = ReturnType<typeof flowChart<AfterSalesFacts>>;
const isolated = { inputMapper: () => ({}), outputMapper: () => ({}) };
const empty: AfterSalesStage = () => {};
/** Retain the actual returned branch and its native read prefix in this same commit. */
function choose(scope: TypedScope<AfterSalesFacts>, branch: string | undefined): string | undefined { scope.branchResult = branch; return branch; }
function stage(hooks: AfterSalesHooks, wrap: AfterSalesWrap, id: string): AfterSalesStage {
  const handler = hooks[id];
  if (typeof handler !== 'function') throw new Error(`Missing after-sales stage: ${id}`);
  return wrap(id, handler);
}
function reject(hooks: AfterSalesHooks, wrap: AfterSalesWrap, id: string, kind = 'ineligible') {
  const handler = hooks[kind];
  if (typeof handler !== 'function') throw new Error(`Missing after-sales failure: ${kind}`);
  return wrap(id, handler);
}
/** Same-scope guards retain genuine fact reads without creating a scope for every gate. */
function guard(builder: Builder, hooks: AfterSalesHooks, wrap: AfterSalesWrap, id: string, fact: keyof AfterSalesFacts, denied = 'ineligible'): Builder {
  return builder.addDeciderFunction(id, scope => choose(scope, scope[fact] === true ? `${id}-allowed` : `${id}-denied`), id)
    .addFunctionBranch(`${id}-allowed`, `${id}-allowed`, wrap(`${id}-allowed`, empty))
    .addFunctionBranch(`${id}-denied`, `${id}-denied`, reject(hooks, wrap, `${id}-denied`, denied)).end();
}
/** An admitted effect stays INSIDE the guard branch, giving native control provenance. */
function guardedAction(builder: Builder, hooks: AfterSalesHooks, wrap: AfterSalesWrap, id: string,
  fact: keyof AfterSalesFacts, allowed: string, denied = 'ineligible'): Builder {
  return builder.addDeciderFunction(id, scope => choose(scope, scope[fact] === true ? `${id}-allowed` : `${id}-denied`), id)
    .addFunctionBranch(`${id}-allowed`, allowed, stage(hooks, wrap, allowed))
    .addFunctionBranch(`${id}-denied`, `${id}-denied`, reject(hooks, wrap, `${id}-denied`, denied)).end();
}
function start(hooks: AfterSalesHooks, wrap: AfterSalesWrap, id: string): Builder {
  return flowChart<AfterSalesFacts>(id, stage(hooks, wrap, id), id);
}
export function buildRequestChart(hooks: AfterSalesHooks, wrap: AfterSalesWrap): AfterSalesChart {
  const replay = guardedAction(start(hooks, wrap, 'read-replay-match'), hooks, wrap, 'request-replay-matches', 'replayMatches', 'reuse-request', 'conflict').build();
  let fresh = guardedAction(start(hooks, wrap, 'load-request-order'), hooks, wrap, 'request-order-eligible', 'orderStateEligible', 'initialize-request-items')
    // One native guard and one fact producer per item: max100 remains within
    // the pinned saved-record reader's256 commits/scope. No per-item scopes.
    .addDeciderFunction('request-item-loop', scope => choose(scope, (scope.itemIndex! > 0 && scope.lineCheck?.eligible !== true ? 'reject' : scope.itemIndex! >= scope.itemCount! ? 'complete' : scope.itemIndex! < 100 ? 'item' : 'invalid-bound')), 'request-item-loop')
      .addFunctionBranch('item', 'inspect-request-item', stage(hooks, wrap, 'inspect-request-item')).loopTo('request-item-loop')
      .addFunctionBranch('reject', 'reject-request-item', reject(hooks, wrap, 'reject-request-item'))
      .addFunctionBranch('complete', 'request-items-complete', wrap('request-items-complete', empty))
      .addFunctionBranch('invalid-bound', 'request-items-bound-exceeded', reject(hooks, wrap, 'request-items-bound-exceeded', 'invalid'))
    .end()
    .addDeciderFunction('request-kind', scope => choose(scope, (scope.requestKind)), 'request-kind')
      .addFunctionBranch('cancellation', 'read-cancellation-policy', stage(hooks, wrap, 'read-cancellation-policy'))
      .addFunctionBranch('return', 'read-return-policy', stage(hooks, wrap, 'read-return-policy'))
    .end();
  fresh = guardedAction(fresh, hooks, wrap, 'request-policy-eligible', 'policySatisfied', 'persist-request');
  const newRequest = guardedAction(fresh, hooks, wrap, 'persisted-request-matches', 'persistedRequestMatches', 'request-persisted', 'conflict').build();
  return start(hooks, wrap, 'validate-request')
    .addFunction('authorize-request', stage(hooks, wrap, 'authorize-request'), 'authorize-request')
    .addFunction('deduplicate-request', stage(hooks, wrap, 'deduplicate-request'), 'deduplicate-request')
    .addDeciderFunction('request-replay', scope => choose(scope, (scope.existingCase === true ? 'replay' : 'new')), 'request-replay')
      .addSubFlowChartBranch('replay', replay, 'replay-request', isolated)
      .addSubFlowChartBranch('new', newRequest, 'new-request', isolated)
    .end().build();
}
function restock(hooks: AfterSalesHooks, wrap: AfterSalesWrap): AfterSalesChart {
  let work = guard(start(hooks, wrap, 'read-restock-eligibility'), hooks, wrap, 'restock-eligible', 'restockEligible')
    .addFunction('initialize-restock-items', stage(hooks, wrap, 'initialize-restock-items'), 'initialize-restock-items')
    .addDeciderFunction('restock-item-loop', scope => choose(scope, (scope.restockIndex! > 0 && scope.restockLineCheck?.eligible !== true ? 'reject' : scope.restockIndex! >= scope.restockCount! ? 'complete' : scope.restockIndex! < 100 ? 'item' : 'invalid-bound')), 'restock-item-loop')
      .addFunctionBranch('item', 'inspect-restock-item', stage(hooks, wrap, 'inspect-restock-item')).loopTo('restock-item-loop')
      .addFunctionBranch('reject', 'reject-restock-item', reject(hooks, wrap, 'reject-restock-item'))
      .addFunctionBranch('complete', 'commit-restock', stage(hooks, wrap, 'commit-restock'))
      .addFunctionBranch('invalid-bound', 'restock-bound-exceeded', reject(hooks, wrap, 'restock-bound-exceeded', 'invalid'))
    .end();
  return start(hooks, wrap, 'read-restock-status')
    .addDeciderFunction('restock-needed', scope => choose(scope, (scope.restockPending === true ? 'needed' : 'complete')), 'restock-needed')
      .addSubFlowChartBranch('needed', work.build(), 'apply-restock', isolated)
      .addFunctionBranch('complete', 'keep-settled-result', stage(hooks, wrap, 'keep-settled-result'))
    .end().build();
}
function settlement(hooks: AfterSalesHooks, wrap: AfterSalesWrap, fromLookup = false): AfterSalesChart {
  const cancellation = start(hooks, wrap, 'read-full-cancellation')
    .addDeciderFunction('full-cancellation', scope => choose(scope, (scope.fullCancellation === true ? 'full' : 'partial')), 'full-cancellation')
      .addFunctionBranch('full', 'settle-cancelled', stage(hooks, wrap, 'settle-cancelled'))
      .addFunctionBranch('partial', 'settle-partial-cancellation', stage(hooks, wrap, 'settle-partial-cancellation'))
    .end().build();
  const succeeded = start(hooks, wrap, 'read-cancellation-disposition')
    .addDeciderFunction('refund-is-cancellation', scope => choose(scope, (scope.cancellationRefund === true ? 'cancellation' : 'return')), 'refund-is-cancellation')
      .addSubFlowChartBranch('cancellation', cancellation, 'cancellation-disposition', isolated)
      .addFunctionBranch('return', 'settle-return', stage(hooks, wrap, 'settle-return'))
    .end().addSubFlowChartNext('restock-successful-refund', restock(hooks, wrap), 'restock-successful-refund', isolated).build();
  const apply = start(hooks, wrap, 'read-settlement-status')
    .addDeciderFunction('refund-evidence-status', scope => choose(scope, (scope.evidenceStatus)), 'refund-evidence-status')
      .addSubFlowChartBranch('succeeded', succeeded, 'settle-succeeded-refund', isolated)
      .addFunctionBranch('pending', 'settle-pending-refund', stage(hooks, wrap, 'settle-pending-refund'))
      .addFunctionBranch('failed', 'settle-failed-refund', stage(hooks, wrap, 'settle-failed-refund'))
    .end().build();
  const repeated = start(hooks, wrap, 'read-settlement-status')
    .addDeciderFunction('repeated-refund-status', scope => choose(scope, (scope.evidenceStatus)), 'repeated-refund-status')
      .addSubFlowChartBranch('succeeded', restock(hooks, wrap), 'resume-restock', isolated)
      .addFunctionBranch('pending', 'reject-regressed-pending-evidence', reject(hooks, wrap, 'reject-regressed-pending-evidence', 'provider-unknown'))
      .addSubFlowChartBranch('failed', apply, 'record-late-refund-failure', isolated)
    .end().build();
  const validation = fromLookup
    ? start(hooks, wrap, 'record-authoritative-reconciliation').addFunction('validate-refund-evidence', stage(hooks, wrap, 'validate-refund-evidence'), 'validate-refund-evidence')
    : start(hooks, wrap, 'validate-refund-evidence');
  return guard(validation, hooks, wrap, 'refund-evidence-matches', 'evidenceMatches', 'provider-unknown')
    .addFunction('read-prior-refund-status', stage(hooks, wrap, 'read-prior-refund-status'), 'read-prior-refund-status')
    .addDeciderFunction('prior-refund-status', scope => choose(scope, (scope.priorRefundStatus)), 'prior-refund-status')
      .addFunctionBranch('FAILED', 'keep-terminal-refund-failure', stage(hooks, wrap, 'keep-settled-result'))
      .addSubFlowChartBranch('SUCCEEDED', repeated, 'check-repeated-refund-evidence', isolated)
      .addSubFlowChartBranch('unsettled', apply, 'record-refund-evidence', isolated).setDefault('unsettled')
    .end().build();
}
function reconciliation(hooks: AfterSalesHooks, wrap: AfterSalesWrap): AfterSalesChart {
  const presence = start(hooks, wrap, 'read-refund-evidence-presence')
    .addDeciderFunction('refund-evidence-present', scope => choose(scope, (scope.evidencePresent === true ? 'found' : 'unknown')), 'refund-evidence-present')
      .addSubFlowChartBranch('found', settlement(hooks, wrap, true), 'settle-reconciled-refund', isolated)
      .addFunctionBranch('unknown', 'keep-unknown-refund', stage(hooks, wrap, 'keep-unknown-refund'))
    .end().build();
  const lookup = start(hooks, wrap, 'load-reconciliation-order')
    .addDeciderFunction('refund-lookup-kind', scope => choose(scope, (scope.hasProviderRefundId === true ? 'retrieve' : 'find')), 'refund-lookup-kind')
      .addFunctionBranch('retrieve', 'retrieve-existing-refund', stage(hooks, wrap, 'retrieve-existing-refund'))
      .addFunctionBranch('find', 'find-existing-refund', stage(hooks, wrap, 'find-existing-refund'))
    .end().addDeciderFunction('refund-lookup-available', scope => choose(scope, (scope.reconciliationAvailable === true ? 'available' : 'unavailable')), 'refund-lookup-available')
      .addSubFlowChartBranch('available', presence, 'reconcile-evidence', isolated)
      .addFunctionBranch('unavailable', 'keep-unavailable-reconciliation', stage(hooks, wrap, 'keep-unavailable-reconciliation'))
    .end().build();
  return guard(start(hooks, wrap, 'read-reconciliation-eligibility'), hooks, wrap, 'refund-reconciliation-eligible', 'reconciliationEligible')
    .addFunction('read-terminal-refund-status', stage(hooks, wrap, 'read-terminal-refund-status'), 'read-terminal-refund-status')
    .addDeciderFunction('refund-terminal-failure', scope => choose(scope, (scope.terminalRefundFailure === true ? 'failed' : 'lookup')), 'refund-terminal-failure')
      .addFunctionBranch('failed', 'manual-review-terminal-refund', stage(hooks, wrap, 'manual-review-terminal-refund'))
      .addSubFlowChartBranch('lookup', lookup, 'lookup-refund-evidence', isolated)
    .end().build();
}
function refund(hooks: AfterSalesHooks, wrap: AfterSalesWrap): AfterSalesChart {
  let fresh = guardedAction(start(hooks, wrap, 'read-refund-eligibility'), hooks, wrap, 'refund-eligible', 'refundEligible', 'load-refund-order');
  fresh = guardedAction(fresh, hooks, wrap, 'cancellation-still-eligible', 'cancellationStillEligible', 'get-current-payment');
  fresh = guardedAction(fresh, hooks, wrap, 'current-payment-available', 'paymentAvailable', 'read-payment-identity', 'provider-unknown');
  fresh = guardedAction(fresh, hooks, wrap, 'payment-matches-order', 'paymentMatchesOrder', 'read-refund-budget');
  fresh = guardedAction(fresh, hooks, wrap, 'refund-budget-available', 'refundBudgetAvailable', 'prepare-refund-intent');
  fresh = guardedAction(fresh, hooks, wrap, 'refund-intent-ready', 'refundPrepared', 'send-refund', 'conflict')
    .addDeciderFunction('refund-call-result', scope => choose(scope, (scope.refundCallReturned === true ? 'returned' : 'unknown')), 'refund-call-result')
      .addSubFlowChartBranch('returned', settlement(hooks, wrap), 'settle-new-refund', isolated)
      .addFunctionBranch('unknown', 'record-unknown-refund', stage(hooks, wrap, 'record-unknown-refund'))
    .end();
  const existing = guard(start(hooks, wrap, 'read-existing-refund-command'), hooks, wrap, 'refund-command-matches', 'refundCommandMatches', 'conflict')
    .addFunction('existing-refund-matched', stage(hooks, wrap, 'existing-refund-matched'), 'existing-refund-matched')
    .addSubFlowChartNext('matching-refund-reconciliation', reconciliation(hooks, wrap), 'matching-refund-reconciliation', isolated).build();
  return start(hooks, wrap, 'owner-refund')
    .addDeciderFunction('existing-refund-intent', scope => choose(scope, (scope.hasExistingRefund === true ? 'existing' : 'new')), 'existing-refund-intent')
      .addSubFlowChartBranch('existing', existing, 'existing-refund', isolated)
      .addSubFlowChartBranch('new', fresh.build(), 'new-refund', isolated)
    .end().build();
}
export function buildActionChart(hooks: AfterSalesHooks, wrap: AfterSalesWrap): AfterSalesChart {
  const approve = guardedAction(start(hooks, wrap, 'owner-approve'), hooks, wrap, 'approval-eligible', 'ownerActionEligible', 'save-owner-approval').build();
  const rejection = guardedAction(start(hooks, wrap, 'owner-reject'), hooks, wrap, 'rejection-eligible', 'ownerActionEligible', 'save-owner-rejection').build();
  const receive = guardedAction(start(hooks, wrap, 'owner-receive'), hooks, wrap, 'inspection-eligible', 'ownerActionEligible', 'read-inspection-result')
    .addDeciderFunction('inspection-result', scope => choose(scope, (scope.inspectionAccepted === true ? 'accepted' : 'rejected')), 'inspection-result')
      .addFunctionBranch('accepted', 'save-accepted-inspection', stage(hooks, wrap, 'save-accepted-inspection'))
      .addFunctionBranch('rejected', 'save-rejected-inspection', stage(hooks, wrap, 'save-rejected-inspection'))
    .end().build();
  const reconcile = start(hooks, wrap, 'owner-reconcile')
    .addSubFlowChartNext('owner-reconciliation', reconciliation(hooks, wrap), 'owner-reconciliation', isolated).build();
  return guard(start(hooks, wrap, 'validate-action')
    .addFunction('authorize-owner', stage(hooks, wrap, 'authorize-owner'), 'authorize-owner')
    .addFunction('load-current-case', stage(hooks, wrap, 'load-current-case'), 'load-current-case'), hooks, wrap, 'case-version-current', 'versionCurrent', 'conflict')
    .addDeciderFunction('route-owner-action', scope => choose(scope, (scope.action)), 'route-owner-action')
      .addSubFlowChartBranch('approve', approve, 'owner-approve-flow', isolated)
      .addSubFlowChartBranch('reject', rejection, 'owner-reject-flow', isolated)
      .addSubFlowChartBranch('receive', receive, 'owner-receive-flow', isolated)
      .addSubFlowChartBranch('refund', refund(hooks, wrap), 'owner-refund-flow', isolated)
      .addSubFlowChartBranch('reconcile', reconcile, 'owner-reconcile-flow', isolated)
    .end().build();
}
