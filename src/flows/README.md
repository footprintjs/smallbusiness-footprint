# Composed commerce flow wrappers

Repository guide. Start with `businessServiceComposer.ts`: it selects the action/profile factory, retains the private request, creates the executor/capture and verifies acknowledgement. `shared/businessFlow.ts` owns the common validate-command → execute-operation → build-output envelope. Catalog, order, subscriber and campaign factories select that envelope; they do not implement the host's transaction internals.

For a change, inspect the actual caller, selected branch, request mapping and configured `BusinessOperation`. Raw private input stays outside recorded scope. A complete wrapper body is not complete checkout/payment/publication semantics. Custom `flowRegistry` builders are trusted executable server code; describing them may build the chart.

Test with `src/__tests__/scenario/serviceComposer.test.ts`, `actionTracing.test.ts`, `providerPorts.test.ts` and the relevant action scenario. For recorded cause, continue into real host/provider evidence as described in [the agent guide](../../docs/AGENT-GUIDE.md).
