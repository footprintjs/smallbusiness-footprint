# Bring your own shipping adapter

`smallbusiness-footprint/shipping` is a dependency-free entry point with shared shipping types, safe link handling and an explicit registry. It loads no React, Node, AWS, provider SDK or Footprint executor. Frontend code can import its public contracts without importing any server implementation.

The host application owns the quote, label-purchase and tracking flows. A shipping adapter owns vendor authentication, requests, response normalization and webhook authentication. Changing the registered vendor does not require rewriting the flow or the customer and owner interfaces. The registry does not load plugins from user input or turn configuration values into module paths.

## Server composition

```ts
import { createShippingAdapterRegistry } from 'smallbusiness-footprint/shipping';
import type { ShippingAdapterFactory } from 'smallbusiness-footprint/shipping';
import { MerchantCourierClient } from './merchant-courier-client.js';
import { EasyPostClient } from './easypost-client.js';

// These clients and verifiers are your implementations of the contract.
const merchantCourier: ShippingAdapterFactory = ({ mode, credentials }) => ({
  provider: new MerchantCourierClient({ mode, token: credentials.token }),
  verifyWebhook: request => verifyMerchantCourierWebhook(request, credentials.webhookSecret),
});

const adapters = createShippingAdapterRegistry({
  'merchant-courier': merchantCourier,
  easypost: ({ mode, credentials }) => ({
    provider: new EasyPostClient({ mode, apiKey: credentials.apiKey }),
    verifyWebhook: request => verifyEasyPostWebhook(request, credentials.webhookSecret),
  }),
});

// Resolve only allowlisted per-brand private configuration on the server.
if (!adapters.has(brand.shippingProvider)) throw new Error('Shipping is unavailable');
const adapter = adapters.create(brand.shippingProvider, {
  mode: brand.shippingMode,
  credentials: await privateCredentialsForBrand(brand.id),
});

// Inject the provider into the existing application flow, with no vendor switch.
const shipping = createShippingService({ repository, provider: adapter.provider });
const event = await adapter.verifyWebhook({ body: rawBytes, headers, method, path });
if (event) await shipping.handleTracking(event);
```

`MerchantCourierClient`, `EasyPostClient`, the verifier functions, secret resolution and `createShippingService` above are host code, not built-in adapters. Each client's `provider` property must match its registry key. Factories are synchronous, explicitly imported trusted code; asynchronous secret loading happens before `create`, and network requests happen in provider methods. Configuration can select only a registered provider. Keys are lowercase IDs of up to 64 characters, such as `merchant-courier`. Factories receive copied, frozen credential values. The registry does not log them and replaces constructor failures with a generic message without preserving their causes. Adapters must similarly redact operational errors before the host records them.

## Provider methods and normalization

Implement `ShippingProvider.createShipment`, `retrieveShipment`, `buyShipment` and `retrieveTracker`. Return the shared shipment, rate and tracking shapes, translating the vendor's names and statuses within the adapter. Shipment, rate, tracker and event identifiers are opaque strings: numeric strings, UUIDs, URNs and vendor-specific formats all work. Do not assume a particular prefix in shared flows. Provider IDs identify the API adapter; carriers and services are returned rate choices within that adapter.

This version uses integer USD cents and parcel dimensions in inches/weight in ounces, matching the current checkout contract. The address contract accepts a string country code so an adapter can support more destinations, but the host and vendor must explicitly validate supported countries. The type alone does not add international shipping or other currencies. Do not reinterpret a non-USD quote as USD.

Customer and owner UIs consume the same `ShippingRate`, `ShippingSelection` and `ShipmentSummary` contracts. The customer chooses from normalized price, carrier, service and transit estimates. Merchant preparation time is separate from carrier transit time. The owner creates the label through the same provider interface. The application must preserve the service and delivery expectation selected at checkout, and keep the amount charged to the customer separate from later postage cost.

## Webhook boundary

`verifyWebhook` receives the original `Uint8Array` body, headers, HTTP method and path. Authenticate the vendor's signature using its documented rules before returning a normalized `{ eventId, trackerId, shipmentId }`. Support timestamp/replay checks where required by that protocol. Do not reserialize a parsed JSON body before checking a signature. Invalid authentication must throw a safe error. Authenticated unrelated events may return `undefined` and be acknowledged without a tracking mutation. An unrelated standalone tracker without an order shipment must not be invented into an order-linked event.

The host then retrieves authoritative tracker state through the same adapter and checks store ownership, provider, shipment/tracker identity and test/production mode against the saved purchase. The shared flow remains responsible for event deduplication, monotonic tracking transitions and durable notification idempotency. A valid vendor signature alone does not prove that a shipment belongs to this store.

## Durable safety remains in the host

Retain the existing stock reservation and checkout transactions. Keep quotes bound to cart, address, store, adapter identity and settings; reject expired quotes. Persist the provider identifier with quotes and purchases, and use that saved identifier for label recovery and tracking after the brand changes its default. Do not route an existing shipment through the newly configured default vendor. Retain access to old adapter credentials until outstanding shipments have finished.

The label flow must atomically claim one purchase, treat uncertain responses as unknown, and reconcile the same provider shipment before retrying. Adapter registration provides extensibility; it does not supply database locks, exactly-once provider purchases, a security sandbox, or automatic credential migration. The host owns those existing guarantees and its Footprint tracing. Record safe identifiers and outcomes only, never credentials, address bodies, signature values or raw provider errors.

`safeShippingUrl` accepts HTTPS URLs without embedded credentials for rendering labels and tracking links. It is not an SSRF allowlist for fetching arbitrary URLs from a server.

## Consumer verification

The fixture suite runs the same quote → purchase → webhook → retrieve-tracker consumer workflow through two unrelated adapters with different ID formats and webhook payloads. It checks registration isolation, missing operations, mismatched provider IDs, authentication rejection, context isolation and secret-safe constructor errors. These are contract tests; each real adapter still needs provider sandbox tests before use.
