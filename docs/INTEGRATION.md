# Integrating version 0.2

## Configuration and brands

A `BusinessPlatform` instance binds its repository and providers to one immutable `BusinessScope` (`tenantId`, `unitId`, optional `campusId`). Trusted request context must match every part. For separate deployments, use each brand's store ID for both tenant and unit. For shared storage, adapters must use the full trusted scope in every key or query; the library cannot isolate a repository used directly outside its boundary.

Profile bindings require a nonnegative monotonic `revision` and full scope. ProfileStore strongly reads the binding on each resolution; only derived configuration is cached. Independent unit overrides also require a monotonic revision. The platform composes binding and override revisions by addition and removes transitive dependents when a module is explicitly disabled. Keep a higher-revision tombstone when deleting overrides; revision regression or changed modules under an unchanged revision fails closed.

`getUnitBusinessConfig(ctx)` applies effective module flags and theme metadata overrides. These are configuration defaults, not publication: they must not mutate an application's immutable published storefront snapshot. `getBusinessTypeConfig(type)` returns a copied profile default. Profiles are examples, not hardcoded deployments; a host can use profile/module metadata with its own brand presentation layer.

## Execution boundary

`createBusinessPlatform` accepts exact `operations[actionId]` overrides and/or `providers`. Exact operations override default repository CRUD. It registers only implementations that are actually configured. Authorization defaults to deny. The authorizer receives action declarations and trusted actor context; command input cannot supply permissions, modules or a different actor identity.

`executeAction` uses Blueprint preparation and a trusted handler. `executeServiceFlow` uses the same `prepareAction` implementation, then invokes the captured operation through real FootprintJS10 stages. Input is captured and validated before asynchronous execution. Supported actions have strict schemas and reject unknown top-level fields. Update Product routes to its own operation, never Create Product.

A custom `flowRegistry` can supply per-profile charts. It is trusted server code: preserve the private request-store contract, do not copy private input into scope, and obtain a validated authoritative receipt. A chart that merely finishes without a receipt fails. A committed/held/pending/scheduled/accepted receipt survives a later observational stage failure, with `observationError` describing the recording limitation. Successful acknowledgement means exactly what the adapter says; `pending` is not proof of payment and `accepted` is not proof of delivery.

The exported adapter factories are low-level application adapters. They enforce bound scope, configured profile and action schema, but do not authenticate callers; use them behind Blueprint preparation or an equivalent trusted authorization boundary. Pass `{ profiles }` as the fourth factory argument for additional profiles; omitted configuration admits the two built-in presets. Static adapter exports are metadata and fail closed when executed without configured scope/operations. Default payment routing uses `checkout-payment`. The legacy `stripeCheckoutAdapter` keeps the explicit `stripe-checkout` ID for hosts that register it, and neither adapter contacts Stripe directly.

Checkout action validation accepts optional `emailVerificationToken` and uppercase two-letter `shipping.country`. `createCheckoutOperation` forwards both unchanged to the authoritative port. When a deployment requires verified email, that port must validate and bind the proof before reserving stock. Neither action preparation nor the library's generic schema claims that a proof is valid; payloads and proof values remain outside recorded charts. Provider-specific cart, address and payment rules belong to the application adapter.

## Authoritative ports

`createCheckoutOperation({reserve})` accepts a stable idempotency key, product identities/positive whole quantities and private shipping. The host must obtain server prices, atomically reserve the entire cart, deduplicate the customer command, preserve held stock on unknown provider outcomes, and own payment settlement/recovery. The receipt identifies a durable order and attempt. This bridge does not call CRUD `createOrder`, acquire a process-local lock or decrement inventory a second time.

`createInventoryOperation({adjust})` requires product/SKU identity, expected inventory revision and stable command key. The adapter must atomically compare the revision, deduplicate the command and preserve outstanding reservations. Its receipt must match product/SKU and the acknowledged next revision and contain nonnegative available/reserved quantities. An idempotent replay returns the original receipt, rather than adjusting stock again.

`createPublicationOperation({publish})` accepts activate, archive-hero, patch and rollback commands with captured config version and source revision where needed. The adapter must atomically commit config CAS, source CAS, history and an immutable public snapshot. It returns authoritative config/publication/source receipt plus its own trace ID. The bridge verifies version increments and store identity; it does not refetch a fresh version to authorize stale commands and has no seed/repository fallback. Wrap an existing publisher rather than replacing its strong transaction or caching contract. Initialization/seeding stays a separate host operation.

Payment start and campaign schedule/send are explicit operation ports in `BusinessProviders`. Their application implementations own provider authentication, exact immutable requests, delivery acknowledgements, batch claims/continuation and durable schedules. Counting subscribers or setting a status is insufficient to implement these ports. Provider exceptions are replaced with safe errors before SDK recording; no delivery/payment success is synthesized by this library.

## Trace and response privacy

Each SDK run has its own executor and private request reference. Shipping, emails, tokens, full source payloads and provider responses are absent from default scope, snapshots, manifests and narratives. The safe summary whitelist includes public IDs, state, counts and revisions. Custom trusted charts must obey the same rule.

`includeResponse: true` is an explicit HTTP integration option. `result.response` can carry an authoritative HTTP receipt or checkout URL/capability, and must be excluded from telemetry. `executionSnapshot`, `manifest`, `narrative` and `flowMeta.snapshot` remain the recordable fields. Persist them through an authenticated, store-scoped host adapter with retention limits. `BusinessPlatformConfig.traceRecorder` and `onTraceError` forward to Blueprint direct-action execution; recorder/observer failure cannot reverse an acknowledged operation. Recorded business service flows return their SDK evidence for a host-managed sink. Existing application Footprint publication/checkout traces remain authoritative; the wrapping business chart can link them through safe `traceRunId` output.

SDK checkpoint APIs do not by themselves create a queue, cross-process lock or durable recovery worker. Persist checkpoints and continuation claims only when a host has implemented those mechanisms; the default service runtime is per-request memory.

## Breaking changes from 0.1

- FootprintJS10, ESM/NodeNext and Node24 replace the old SDK4 demo runtime.
- Profile/override stores require full scope and monotonic revisions. Overrides are `{scope, overrides}` records, not unit-ID-only dictionaries.
- Execution requires a bound scope, explicit authorizer and actual operation implementation. Default authorization is denied.
- Individual chart factories receive `BusinessFlowDependencies` (private request store and operation), not a repository. Public runtime execution goes through `executeServiceFlow`. `buildServiceFlow` and dispatch exports expose topology for review; raw input cannot execute an unregistered private request.
- Success returns safe IDs and acknowledgement, rather than full customer/order/source objects. Explicit private HTTP response is opt-in.
- Fake Stripe, scheduler, campaign-send and weak inventory fallback implementations have been removed. Configure authoritative application ports or leave those actions unavailable.

All library tests use local fixtures and real SDK execution. They perform no real payment, email, cloud deployment or database migration. Atomicity and crash/retry guarantees require the host adapter's own integration tests.
