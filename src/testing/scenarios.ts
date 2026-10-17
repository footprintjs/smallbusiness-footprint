// Fault plans are local test inputs. Only the public catalog is passed to the CLI.
export type FailureTarget = 'database' | 'payment' | 'shipping';
export type FailureAction = 'connection' | 'db-auth' | 'db-throttle' | 'http-400' | 'http-401' | 'http-429' | 'http-500' | 'nonstandard' | 'malformed' | 'apply-then-wait' | 'wait' | 'ok';
export interface FailureScenarioPlan {
  database?: FailureAction[]; payment?: FailureAction[]; shipping?: FailureAction[];
  databaseAttempts?: number; paymentAttempts?: number; shippingAttempts?: number;
  callTimeoutMs?: number; abortAfterMs?: number; circuitThreshold?: number;
  preflight?: boolean; runTimeoutMs?: number; backoffMs?: number;
  paymentTimeoutMs?: number; reconcile?: boolean; keylessPayment?: boolean;
  failPersistence?: boolean; failObserver?: boolean; independentProbes?: boolean;
}
export interface FailureScenario { readonly id: string; readonly title: string }
const plans: ReadonlyArray<readonly [string, string, FailureScenarioPlan]> = [
  ['success', 'Successful local order', {}],
  ['db-connection-refused', 'Database connection refused', { database: ['connection'] }],
  ['db-auth-denied', 'Database access denied', { database: ['db-auth'] }],
  ['db-throttled', 'Database throttling', { database: ['db-throttle'], databaseAttempts: 2 }],
  ['provider-bad-request', 'Provider rejects the request', { payment: ['http-400'] }],
  ['provider-unauthorized', 'Provider credentials rejected', { payment: ['http-401'] }],
  ['provider-rate-limited', 'Shipping provider rate limited', { shipping: ['http-429'], shippingAttempts: 3 }],
  ['provider-server-error', 'Payment server error with unknown effect', { payment: ['http-500'], paymentAttempts: 3 }],
  ['provider-nonstandard-error', 'Nonstandard provider error', { shipping: ['nonstandard'] }],
  ['malformed-success', 'Malformed successful provider response', { shipping: ['malformed'] }],
  ['server-error-then-success', 'Shipping server error recovers', { shipping: ['http-500', 'ok'], shippingAttempts: 2 }],
  ['rate-limit-then-success', 'Shipping rate limit recovers', { shipping: ['http-429', 'ok'], shippingAttempts: 2 }],
  ['own-timeout', 'Local call timer expires', { shipping: ['wait'], callTimeoutMs: 12 }],
  ['caller-abort', 'Caller cancels a local call', { shipping: ['wait'], abortAfterMs: 8 }],
  ['local-circuit-open', 'Injected local circuit stops further sends', { shipping: ['http-500'], shippingAttempts: 4, circuitThreshold: 2 }],
  ['budget-preflight', 'Declared attempts exceed the caller budget', { preflight: true }],
  ['runtime-budget-cap', 'Runtime caps a call by remaining time', { shipping: ['wait'], runTimeoutMs: 25, callTimeoutMs: 1000 }],
  ['runtime-budget-no-retry', 'Remaining budget cannot fit retry wait', { shipping: ['http-500'], shippingAttempts: 4, runTimeoutMs: 100, backoffMs: 1000 }],
  ['payment-timeout-unknown', 'Payment times out without an authoritative answer', { payment: ['wait'], paymentTimeoutMs: 12, paymentAttempts: 3 }],
  ['payment-timeout-reconcile-applied', 'Reconciliation confirms the payment was applied', { payment: ['apply-then-wait'], paymentTimeoutMs: 12, paymentAttempts: 3, reconcile: true }],
  ['payment-timeout-reconcile-unknown', 'Reconciliation still cannot establish the payment result', { payment: ['wait'], paymentTimeoutMs: 12, paymentAttempts: 3, reconcile: true }],
  ['payment-idempotency-guard', 'Engine refuses a retrying write without an idempotency key', { keylessPayment: true, paymentAttempts: 2 }],
  ['primary-and-trace-store-fail', 'Business failure and trace persistence failure', { database: ['connection'], failPersistence: true }],
  ['primary-and-observer-fail', 'Business failure and local observer failure', { database: ['connection'], failObserver: true }],
  ['business-success-trace-store-fail', 'Successful business operation and trace persistence failure', { failPersistence: true }],
  ['independent-db-shipping-failures', 'Independent diagnostic reads: database and shipping both fail',
    { independentProbes: true, database: ['connection'], shipping: ['http-500'] }],
  ['independent-db-shipping-observer-failure', 'Independent diagnostic reads: two failures and a separate observer failure',
    { independentProbes: true, database: ['connection'], shipping: ['http-500'], failObserver: true }],
];

export const SCENARIOS = Object.freeze(plans.map(([id, title]) => Object.freeze({ id, title })));
export function listFailureScenarios(): readonly FailureScenario[] { return Object.freeze(SCENARIOS.map(row => Object.freeze({ ...row }))); }

// Never include this plan or the mutable provider ledger in a record/report.
export function failureScenarioPlan(id: string): FailureScenarioPlan {
  const row = plans.find(([key]) => key === id);
  if (!row) throw Object.assign(new Error('Unknown local failure scenario'), { code: 'FAILURE_LAB_SCENARIO_UNKNOWN' });
  return structuredClone(row[2]);
}
