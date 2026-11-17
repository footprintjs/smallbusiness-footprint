# Capability and action adapters

Repository guide. Start at `adapterMappings.ts` for capability selection and `operationAdapter.ts` for scoped execution. The catalog/payment/fulfillment/marketing/inventory files declare mappings and factories. `checkout-payment` is the default payment mapping; `stripe-checkout` remains an explicit legacy ID, not a built-in Stripe client.

A bound adapter checks scope, configured profile and action schema, then invokes the configured authoritative operation and validates its receipt. It does not authenticate the caller; put it behind Blueprint action preparation or an equivalent trusted boundary. Factories accept configured profiles through the documented options. Missing implementations fail closed.

Use `src/__tests__/unit/adapterFactories.test.ts`, `adapters.test.ts` and `src/__tests__/scenario/providerPorts.test.ts`. Shipping vendor contracts live separately in `../shipping.ts`; see [shipping adapters](../../docs/SHIPPING_ADAPTERS.md).
