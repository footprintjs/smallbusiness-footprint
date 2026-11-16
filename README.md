# smallbusiness-footprint

Commerce configuration, scoped actions and recorded workflows for applications that supply their own storage, authorization and providers. Built on Blueprint and FootPrintJS, with seven modules, two example profiles, typed checkout/inventory/publication ports, shipping contracts, owner-approved after-sales and optional diagnostics.

**Start with [the quickstart](docs/QUICKSTART.md)** or choose a task in [the documentation index](docs/README.md). For source navigation and root-cause investigation, read [the agent guide](docs/AGENT-GUIDE.md) and [source map](docs/SOURCE-MAP.md).

<!-- BEGIN GENERATED FLOW INDEX -->
## Generated flow index

**14 built-in registered flows · 71 root/mount instances · 23 native topology views.**

| Open | Scope |
| --- | --- |
| [aftersales-action](docs/flows/views/validate-action-5acb262f04c9/README.md) | Actual decisions, loops and linked subflows |
| [aftersales-request](docs/flows/views/validate-request-d41e10cf73a7/README.md) | Actual decisions, loops and linked subflows |
| [12 default service wrappers](docs/flows/services/README.md) | Library envelopes; host operations opaque |

[Complete flow inventory](docs/flows/README.md). Run `npm run docs:flows` after source changes; `npm run check:flow-docs` fails on stale/missing views.

Input SHA-256: `0e120058e4b1c4edb368f3cb91abbea2f775ad545a0887b41d8eec057a831963`. Static build views, not execution or causal proof.
<!-- END GENERATED FLOW INDEX -->

## Install the current published API

```sh
npm install smallbusiness-footprint@1.1.0
```

Use Node **24.15–24.x**. The 1.1.0 manifest installs `footprint-blueprint@1.1.0`, `footprintjs@12.0.0`, `foottrace@1.15.0` and `zod@4.6.5`. Applications do not need the former six-package Blueprint layout. Registry 1.1.0 and this working source candidate are distinct: newly added developer/source-navigation APIs are checkout-only until separately released.

From a source checkout, the current local examples run with the declared pnpm version and included reviewed development dependency archive:

```sh
pnpm install
pnpm build
pnpm quickstart:booking
pnpm quickstart:publication
```

They execute real workflows with local sample data and in-memory storage; no model, payment vendor or cloud service is called. The [quickstart](docs/QUICKSTART.md) separates current execution from the archived 0.7.0 kit. A local build does not publish a release or deploy an application.

## Choose an entry point

| Need | Public entry | Boundary |
| --- | --- | --- |
| Profiles, modules, capabilities and actions | `/metadata` | Browser-safe declarations; no executor/provider |
| Scoped actions and composed services | Main package | Backend runtime; trusted scope, authorization and operations required |
| Shipping contracts and registry | `/shipping` | Browser-safe; host supplies provider implementations |
| After-sales policy and contracts | `/aftersales` | Browser-safe policy/types |
| Execute cancellation, return and refund flows | `/aftersales/runtime` | Backend; host owns atomic repository/payment ports |
| Safe failure normalization and wording | `/diagnostics` | No provider SDK or automatic repair |
| Record actual provider-boundary calls | `/diagnostics/runtime` | Explicit runtime opt-in at the real call site |
| Exercise local failure scenarios | `/testing` | Developer fixtures; do not expose as a public route |

Subpaths are prefixed with `smallbusiness-footprint`, for example `smallbusiness-footprint/shipping`. Static imports select entry graphs; dynamic `import()` defers loading. Neither changes dependency downloads during installation.

## Read configuration first

```js
import { createMemoryProfileStore } from 'footprint-blueprint/platform';
import { createBusinessPlatform } from 'smallbusiness-footprint';

const scope = { tenantId: 'demo-shop', unitId: 'demo-shop' };
const profileStore = createMemoryProfileStore([
  { ...scope, profileType: 'kids-boutique', revision: 1,
    createdAt: '2030-01-01T00:00:00Z' },
]);
const platform = createBusinessPlatform({ scope, profileStore });
console.log(await platform.getUnitBusinessConfig(scope));
```

This reads configuration; it does not authorize an operation. Execution defaults to deny without an authorizer. Missing providers remain unavailable. For a complete executable publication fixture with a trusted session and actual commit, use [the quickstart](docs/QUICKSTART.md).

## Integrate an authoritative operation

`executeAction(context, actionId, input)` uses Blueprint action preparation and can return shared execution evidence. `executeServiceFlow(context, actionId, input)` prepares the same action, then runs a native chart and returns its snapshot, manifest and narrative. These are separate recording paths; an option for one does not automatically instrument the other.

Supply a bound scope, trusted request context, profile store, authorizer and real operation. Exact `operations[actionId]` override default CRUD. Typed checkout, inventory and publication ports validate commands and receipts; the application implements the transaction behind each port. `pending` is not payment completion, and `accepted` is not delivery.

Omitted profile/module arrays use the built-ins; supplied arrays replace them. Spread `allBusinessModules` or `allBusinessProfiles` to extend. Registry configuration resolves dependencies, revisions, terminology and effective flags; it does not publish a storefront or migrate storage. See [integration contracts](docs/INTEGRATION.md), [shipping](docs/SHIPPING_ADAPTERS.md) and [after-sales](docs/AFTERSALES.md).

## Trace a failure backward

Start from the saved run and first failing or uncertain stage. Follow its native stage/attempt identity, recorded decisions and retained read/write links to the owning wrapper and operation. A wrapper calling a host function does not expose that function's transaction or provider internals.

- [Agent guide](docs/AGENT-GUIDE.md): find the edit surface and concrete source/evidence gaps.
- [Source map](docs/SOURCE-MAP.md): locate composition, after-sales, ports, adapters and readers.
- [Provider evidence](docs/PROVIDER-EVIDENCE.md): retain real observations and unknown effects.
- [Expected evidence](docs/EXPECTED-EVIDENCE.md): distinguish not observed from proved skipped or failed.

Descriptions and possible producer links help navigation. They do not prove runtime lineage, a provider outage or a root cause. Missing/partial capture stays unknown; an upgrade cannot fill an older record's gaps.

The working candidate adds separate optional `/developer` and `/developer/node` tooling, documented in [developer context](docs/DEVELOPER.md). It does not join the core runtime/metadata import graph. Its production source pack still occupies installation bytes; optional loading is not zero package cost. These new exports are unreleased, even while the compatibility version remains 1.1.0.

For actual saved after-sales mounted scopes and bounded item loops, the candidate also provides [the scoped cause reader](docs/AFTERSALES-CAUSE.md) at `/diagnostics/cause`. It preserves native histories and known read/control evidence without fabricating a flattened snapshot; missing evidence stays incomplete.

## Guarantees and host responsibilities

The library checks configured implementation, scope, profile modules, authorization and schema before invoking an operation. Authorizers use trusted identity and permissions; command bodies cannot choose them. Checkout email proof reaches the host port, which must validate its binding/expiry and business rules before reservation.

The host owns transactions, conditional writes, idempotency, reservations, reconciliation, durable scheduling, notifications and record storage. CRUD order/stock methods are not checkout or locking fallbacks. Shipping registration supplies no carrier or exactly-once label purchase. After-sales requires owner approval; return receipt and accepted inspection precede refund. An unknown write needs reconciliation with the original operation identity, not a new write key.

Private inputs, addresses, tokens, reasons and provider payloads stay request-local. Recorded state contains an opaque request reference and safe summaries. `includeResponse: true` is a private HTTP-response option; exclude that response from telemetry. Diagnostic failure cannot reverse an acknowledged business operation. An attached sink or completed drain alone is not a durable-storage receipt.

## Validate a change

```sh
pnpm typecheck
pnpm test
pnpm build
```

Use targeted tests while changing a component, then appropriate broader checks. Local fixtures do not establish live provider behavior. Historical changes remain in [CHANGELOG.md](CHANGELOG.md) and [the 1.0 migration record](docs/MIGRATION-1.0.md); they do not override the current manifest. Local verification does not publish a package.

Separate research lives in the [private draft development-benchmark repository](https://github.com/footprintjs/flow-development-benchmarks). It is optional, not needed for installation, and is not bundled in this library or evidence of a performance gain from these unreleased changes.
