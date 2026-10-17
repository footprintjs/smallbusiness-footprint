# smallbusiness-footprint 0.5.0

This local `smallbusiness-footprint@0.5.0` candidate depends on `footprint-blueprint@0.5.0`, `footprintjs@10.1.0` and Zod. It uses Node 24.15–24.x. It adds opt-in commerce diagnostics and testing entries and has not been published. Existing commerce, shipping, after-sales, privacy and authoritative-provider boundaries remain in place.

SMB is optional. Framework-only applications use Blueprint directly; commerce consumers can install SMB and its declared dependencies are installed automatically. Within Blueprint, focused subpaths select runtime entry graphs and dynamic `import()` provides loading on demand. Ordinary dependency downloads still occur at package installation.

Use the [release-kit quickstart](docs/QUICKSTART.md) to run reduced booking and Charming Cherubs publication examples from included tarballs. See the [changelog](CHANGELOG.md) for the packaging migration.

A commerce configuration and operation library built on footprint-blueprint and FootprintJS 10. It supplies seven modules, two example business profiles, terminology, strict action schemas, scoped execution and recorded operation charts. Applications supply storage and authoritative business implementations.

Use `smallbusiness-footprint/metadata` in a browser to consume profiles, modules, capabilities and action declarations without importing the Node runtime or Footprint executor. Use the main entry point for backend execution.

## Safe execution

```ts
import { createMemoryProfileStore } from 'footprint-blueprint/platform';
import { createBusinessPlatform, createPublicationOperation } from 'smallbusiness-footprint';

const scope = { tenantId: 'brand-a', unitId: 'brand-a' };
const profileStore = createMemoryProfileStore([
  { ...scope, profileType: 'kids-boutique', revision: 1, createdAt: '2030-01-01T00:00:00Z' },
]);
const platform = createBusinessPlatform({
  scope,
  profileStore,
  authorizer: ({ action, context }) => authorizeTrustedActor(context, action.requiredPermissions),
  providers: {
    publication: { publish: createPublicationOperation({
      publish: (command, context) => existingAtomicPublisher(command, context),
    }) },
  },
});
const result = await platform.executeServiceFlow(
  { ...scope, userId: authenticatedActorId },
  'publish-storefront',
  { kind: 'activate', source: { kind: 'theme', id: 'theme-1' }, expectedVersion: 4, expectedRevision: 2 },
);
```

The example's authorization and publisher functions are application ports, not library implementations. An omitted authorizer denies all actions. An absent provider is unavailable, rather than reporting a successful payment, send, schedule or stock change. The publication bridge preserves captured guards and verifies the actual committed receipt; it does not replace the application's atomic publication flow.

Customer input, shipping, email, unsubscribe/payment tokens and private response values stay in request-local storage. Recorded charts contain an opaque request reference and whitelisted outcome summaries. HTTP hosts may explicitly opt into `includeResponse: true`; that private response must not be persisted as telemetry. Application authorizers are responsible for authentication, ownership and permission checks using trusted context.

Checkout accepts an optional `emailVerificationToken` (at most 4096 characters) and an optional uppercase two-letter `shipping.country`. The proof reaches `BusinessCheckoutPort.reserve` unchanged through schema validation and dispatch. The application port must enforce required verification, proof binding and expiry before reserving stock. The library deliberately accepts generic cart variants/quantities and does not replace a brand's stricter cart, phone or address policies.

## Additional business profiles and modules

`createBusinessPlatform({ modules, profiles, ... })` accepts Blueprint definitions. Omitted arrays retain the two existing profiles and seven modules; supplied arrays replace the defaults. Extend with `[...allBusinessModules, customModule]` and `[...allBusinessProfiles, customProfile]`. Definitions are copied into an immutable registry, dependencies are validated, and unregistered profiles fail closed. Profile `meta.services` and `meta.theme` can supply commerce metadata; otherwise services follow its modules and the theme uses a neutral accent. A custom fulfillment hint is allowed in `schedulingPattern`.

Put custom terminology on the module that owns the term using Blueprint's `{ term: { default: 'Product', 'flower-shop': 'Bouquet' } }` format. To customize a built-in module, replace its definition in the supplied array while retaining its ID and dependencies. Blueprint resolves duplicate terms in module dependency order, with the first definition taking precedence. Config resolution, service charts and action dispatch use the configured registry. Custom modules also participate in unit overrides and transitive disabling. Registry helpers accept the same definitions/profile arrays; their no-argument forms still return the built-in defaults.

Adapter factories accept a fourth `{ profiles }` argument to admit configured profiles without admitting arbitrary profile strings. Default payment metadata uses `checkout-payment`, delegating to the configured `process-payment` operation without choosing a provider. The exported `stripeCheckoutAdapter` keeps its legacy explicit ID; migrate persisted mappings to `checkout-payment`, or register that legacy export explicitly.

A supplied repository is low-level, already bound to the declared store. `createOrder` and `updateStock` CRUD methods are not payment or stock-lock implementations and are never used as checkout/inventory fallbacks. Repositories without a store binding cannot execute through the platform.

## Guarantees and ownership

- Both direct actions and recorded service flows check configured implementation, profile modules, authorization and JSON schema before calling a port.
- Full tenant/campus/unit scope is captured at construction and checked at every context entry point. Explicit module disabling removes dependent modules.
- Typed checkout, inventory and publication bridges validate command and receipt contracts. Their adapters own transactions, idempotency, reservations, recovery, immutable snapshots and durable concurrency.
- A real provider acknowledgement is required for success. A later observational failure preserves that acknowledgement, so it cannot be mistaken for an unperformed operation.
- Footprint records the execution. The library does not provision distributed locks, payment providers, queues, durable checkpoints, scheduler jobs or email delivery.

For migration and provider contracts, see [docs/INTEGRATION.md](docs/INTEGRATION.md). Build the sibling Blueprint root first, then run `pnpm build`, `pnpm typecheck` and `pnpm test` from the SMB repository root on Node 24.15–24.x. The inherited suite contains 217 fixture-only tests; the release validation record captures the actual candidate results.

## Shared receipt boundary

Direct `executeAction` calls use Blueprint and can return shared execution evidence. Recorded `executeServiceFlow` calls retain their own SDK snapshot/manifest/narrative path and do not automatically supply common observation/effect receipts. Charming Cherubs reports explicit shared facts at its application `createPlatform` publication boundary while keeping its original publication workflow recording. Applications choose safe reported fields and remain responsible for authoritative transactions and receipt storage.

## Shipping adapter extension candidate

Version 0.4.0 adds a browser-safe `smallbusiness-footprint/shipping` API. See [bring-your-own shipping adapters](docs/SHIPPING_ADAPTERS.md).

## Owner-approved after-sales

`smallbusiness-footprint/aftersales` is a browser-safe contract/policy entry. `smallbusiness-footprint/aftersales/runtime` exports `createAfterSalesService` for backend execution. It uses real FootprintJS 10 charts, without a payment vendor or application import.

The default policy allows cancellation before a shipping/label claim wins, and returns within 30 days of recorded delivery with unworn condition and tags confirmed. `validateAfterSalesPolicy()` validates configurable per-store windows, requirements and enabled flags. Every case snapshots its policy; changing shop settings does not rewrite existing cases. Owner approval is always required. Return approval authorizes return shipment only: receipt and accepted inspection must precede a refund.

Inject `repository`, `payments`, a trusted `authorizer`, `storeId`, optional `policy`, `now`, `generateId`, and `onTrace`. Call `request(command, context)` or `action(command, context)`. Customer identity/order ownership and owner authentication come from the HTTP host, never the request body. Amounts are positive integer cents; selection uses stable saved-order line IDs and quantities.

The repository adapter must atomically deduplicate requests, allocate quantities, race cancellation holds against shipping claims, CAS case/order versions, and reserve refund amounts against captured money minus previous refunds and every pending reservation. A durable refund intent and stable key are saved **before** a provider call. An unknown result retains its reservation and reconciles by the same provider key or refund ID; absence is not permission to create another refund. Provider adapters must refuse replay after their idempotency-retention window. Confirmed failure is separate from pending/unknown; no fresh key is automatically generated.

Restock is a separate, exactly-once host transaction after confirmed refund and accepted return inspection. A full cancellation may mark the order cancelled. A partial cancellation retains a fulfillment hold for owner review: existing shipping snapshots must never send cancelled quantities. No hold is automatically released after cancellation refund/restock. Already-created labels require manual carrier review; the library does not claim it can atomically void one.

`onTrace` receives real native snapshot, chart structure, narrative, fixed stage/decision metadata and safe errors. Customer reasons, owner notes, identity, addresses, tokens, provider payloads and payment IDs stay in request-local closures. Diagnostic failures cannot reverse a saved case or provider acknowledgement. Hosts own private trace persistence, retention, notifications, payment credentials and any return-label cost policy. No emails, network calls or cloud services are installed by the library.

## Caller execution controls

`BusinessPlatformConfig.executionOptions` forwards the trusted Blueprint callback for direct actions. `createAfterSalesService` accepts `executionOptions: ({flowId}) => controls` with the same payload-free engine options. A caller may supply a signal, timeout or absolute deadline and trace correlation; omitting the callback preserves existing behavior. The engine owns their validation and enforcement. This does not add retry rules or authorize refunds, restocking, labels or background work. After-sales native traces retain the caller correlation and report the actual running engine version. Recorded service-flow execution remains a separate API.

### Local commerce failure testing (0.5 candidate)

Use the explicit `smallbusiness-footprint/testing` entry in developer tooling to exercise 27 local commerce scenarios. It runs real FootprintJS attempts with local database, payment and shipping doubles: request rejection, authorization, throttling, retry recovery/exhaustion, timeout/cancellation, circuit admission, budget admission, idempotency protection, unknown payment effects, independent reconciliation reads and separate trace-storage/observer failures. It has no vendor SDK, cloud, model, email or filesystem dependency.

```js
import { listFailureScenarios, runFailureScenario } from 'smallbusiness-footprint/testing';
import { diagnoseFailureRecording } from 'footprint-blueprint/diagnostics';

const { record, observed } = await runFailureScenario('payment-timeout-unknown');
const diagnosis = diagnoseFailureRecording(record);
// The recorded payment outcome is unknown. Reconcile; do not blindly resend a charge.
```

`record` is the stored/reloaded evidence envelope. `observed` contains separate test counters; it is never an input to diagnosis. The scenario plan and simulated provider ledger stay private. No scenario name or expected answer appears in the record. The catalog is immutable.

The default recording store is private in-memory JSON. Hosts can provide **both** `persist(record)` and `load({storeId, runId, flowId})`; exact read-back identity/content is checked. Storage failure returns a visibly missing native record and no unsaved sidecar evidence. Host storage implementations own tenant isolation, durable writes and retention. Importing this entry does not enable fault injection anywhere: do not mount it as a production or public HTTP route.

`smallbusiness-footprint/diagnostics` exports `normalizeCommerceBoundaryError`. It recognizes AWS-shaped **database** auth/throttle names with actual numeric HTTP metadata without importing an AWS SDK or changing the status. Other vendor classifications can use Blueprint's bounded `classify(fields)` callback. An explicit valid host classification takes priority over the optional database compatibility map; undefined, invalid or throwing classifiers retain safe built-in/default behavior. Classification is evidence, not a retry policy or proof that a provider is down. Public findings never expose provider messages or private payloads. Customer wording, translations and admin previews belong to the consuming application.

These are reusable test workflows, not a generic production circuit breaker, payment reconciler or shipping provider implementation. Runtime commerce continues to use the existing provider interfaces and authoritative receipts.

The commerce normalizer is opt-in. A host that uses a different provider can import Blueprint's `normalizeBoundaryError` directly and supply its own classifier; choosing this testing entry does not register or replace any production provider adapter.

The separate test counters distinguish `admittedCalls` (all local-port admission attempts, including circuit refusals and authoritative reconciliation reads), `physicalCalls` (local sends that reached the provider double), and `physicalWriteAttempts` (attempted write sends, never proof of commitment). Host-loaded records undergo Blueprint's bounded getter-safe validation before identity checks or serialization.
