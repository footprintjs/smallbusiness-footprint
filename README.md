# smallbusiness-footprint 0.2.4

This is a prepared local release candidate, not a published npm release. It uses Actions / Platform 0.3.2 and Features / Tenancy / Seed / Adapters 0.2.1 with `footprintjs@10.0.0`, on Node 24.15–24.x. Runtime source is unchanged from local 0.2.3; this patch prepares documentation, package metadata and build-before-pack behavior.

Use the [release-kit quickstart](docs/QUICKSTART.md) to run reduced booking and Charming Cherubs publication examples from included tarballs. See the [changelog](CHANGELOG.md) for the prepared version matrix.

A commerce configuration and operation library built on footprint-blueprint and FootprintJS 10. It supplies seven modules, two example business profiles, terminology, strict action schemas, scoped execution and recorded operation charts. Applications supply storage and authoritative business implementations.

Use `smallbusiness-footprint/metadata` in a browser to consume profiles, modules, capabilities and action declarations without importing the Node runtime or Footprint executor. Use the main entry point for backend execution.

## Safe execution

```ts
import { createMemoryProfileStore } from '@footprint/platform';
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

For migration and provider contracts, see [docs/INTEGRATION.md](docs/INTEGRATION.md). Build with `pnpm build` and run the fixture-only suite with `pnpm test` on Node 24.

## Shared receipt boundary

Direct `executeAction` calls use Blueprint and can return shared execution evidence. Recorded `executeServiceFlow` calls retain their own SDK snapshot/manifest/narrative path and do not automatically supply common observation/effect receipts. Charming Cherubs reports explicit shared facts at its application `createPlatform` publication boundary while keeping its original publication workflow recording. Applications choose safe reported fields and remain responsible for authoritative transactions and receipt storage.
