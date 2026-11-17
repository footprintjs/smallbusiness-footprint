# Application-owned native business flows

The unreleased optional `smallbusiness-footprint/native` entry composes an application's actual business decisions, bounded loops, parallel stages and subflows into the existing business service registry. It exports `createNativeBusinessFlow`, `getNativeBusinessPolicy`, `safeNativeStage`, `flowChart`, and the underlying `ScopeFacade`/chart types. The main runtime and metadata entries do not import this optional module. Existing operation-backed flows remain unchanged.

Use this when an application needs its policy graph to be visible and executable. Putting a whole imperative business operation inside one function stage still leaves that operation opaque. Native composition does not infer hidden policies from descriptions or prove that a provider performed an effect.

## Private requests and explicit receipts

Configure the usual trusted `prepare` and scope boundary on `createBusinessServiceRegistry`. A custom flow registration calls `createNativeBusinessFlow(actionId, dependencies, options)`. Its `build(request)` callback constructs a real native child chart without executing stage callbacks. Inside a stage, `request(scope)` resolves the current registry-private request and returns a private view:

- `input`: the prepared request data.
- `context`: the prepared, scope-bound business context.
- `acknowledge(receipt)`: a request-bound method retaining an explicit authoritative receipt before later observation can fail.

Keep that view, its input, provider ports and mutable application session in a per-built-chart private closure. Never put them or their methods into recorded scope. Put only bounded safe facts needed by the next stage into scope, using `getValue`/`setValue`. Do not share a mutable application session between executions or cache a chart whose callbacks close over another request's session. The registry invokes its builder for each execution; the SDK's request accessor itself resolves the correct private reference on every call.

The native child receives only an opaque request reference. Nested application subflows can pass their own bounded safe facts; capture the private acknowledgement method once at the child's root if nested stages need it. That method is bound to the request, not to an old stage facade. It refuses duplicate acknowledgement and use after request cleanup. The first validated acknowledgement and a sanitized, frozen output copy are retained; the optional private response keeps the caller's object identity and is not a recording or immutable snapshot.

Call `acknowledge` at the point a valid business result/receipt is known, before a terminal break or any later observational work. A receipt's acknowledgement must describe the authoritative application outcome. For example, `accepted` can mean a request handler returned; it must not be presented as a provider's successful business write. The existing registry preserves a valid acknowledgement if later execution/observation fails and reports the incomplete observation separately.

Alternatively, `options.receipt(scope, request)` can explicitly return a receipt after the child finishes. This fallback is skipped when the child already acknowledged. It cannot recover a result from a child that failed before reaching it; use stage-local acknowledgement when the business outcome is already known. A child finishing or breaking without either an explicit receipt or a valid fallback fails closed with `BUSINESS_RECEIPT_INVALID`. Chart completion never invents an acknowledgement.

## A real decision and bounded loop

The following factory assumes the registry's trusted prepare boundary has admitted a bounded numeric `items` array. Its enabled decision and item loop are actual native stages, not annotations around a host operation:

```js
import {
  createNativeBusinessFlow, flowChart, safeNativeStage,
} from 'smallbusiness-footprint/native';

function createSumFlow(dependencies) {
  const actionId = 'sum-items';
  const guarded = fn => safeNativeStage(actionId, fn);
  let request, items, total = 0;

  return createNativeBusinessFlow(actionId, dependencies, {
    description: 'Authorize and sum a bounded admitted item list',
    build: access => flowChart('Read private admitted facts', guarded(scope => {
      request = access(scope);
      items = request.input.items;
      scope.setValue('enabled', request.input.enabled === true);
      scope.setValue('position', 0);
    }), 'read-private-facts')
      .addDeciderFunction('May this request proceed?', guarded(scope =>
        scope.getValue('enabled') ? 'allowed' : 'denied'), 'enabled')
        .addFunctionBranch('denied', 'Return denied business outcome', guarded((_scope, stop) => {
          request.acknowledge({
            acknowledgement: 'accepted', output: { status: 'rejected' },
            response: { status: 'rejected' },
          });
          stop();
        }))
        .addFunctionBranch('allowed', 'Continue admitted request', guarded(() => {})).end()
      .addDeciderFunction('Any remaining items?', guarded(scope =>
        scope.getValue('position') < items.length ? 'item' : 'done'), 'items-loop')
        .addFunctionBranch('item', 'Add one item', guarded(scope => {
          const position = scope.getValue('position');
          total += items[position];
          scope.setValue('position', position + 1);
        })).loopTo('items-loop')
        .addFunctionBranch('done', 'Retain the business result', guarded((_scope, stop) => {
          request.acknowledge({
            acknowledgement: 'accepted', output: { quantity: total },
            response: { quantity: total },
          });
          stop();
        })).end().build(),
  });
}

// Supply this factory in the normal, scope-bound service registration:
// flowRegistry: { 'sum-items': { default: createSumFlow } }
```

Stage callbacks receive a `ScopeFacade` and a second `stop` callback. Use that callback for an early native exit; a raw `ScopeFacade` has no `$break()` method. Footprint input/output mappers receive a tracked plain root-key view, not a stage facade. Keep mapper fields bounded, and do not call `getValue` on the mapper's plain view. The SDK wrapper handles its own opaque-reference mapping.

## Failures and observation

`safeNativeStage(actionId, callback)` preserves synchronous values and branches and awaits actual Promise results using the same Promise-only contract as the engine. It replaces thrown failures with the SDK's fixed safe business error before the executor records them. Wrap application callbacks that could throw private errors, including async port handling; alternatively catch provider failures inside their actual stage and transport only fixed safe availability/outcome facts to native deciders. It does not create retries or translate an uncertain write into success. The SDK wrapper sanitizes its own request, acknowledgement and fallback-receipt failures.

Application callbacks remain trusted code. The helper is not a privacy sandbox: it cannot prevent a callback from explicitly recording private values, using customer data as stage IDs/descriptions, or leaking errors from an unwrapped callback. Keep real business predicates in native deciders, branch destinations in the graph, ports and sensitive data private, and unknown effects unknown. A later recorder/export failure does not authorize resending an acknowledged request.

## Export the actual policy hierarchy

`getNativeBusinessPolicy(chart)` returns the exact child chart mounted by this helper, without rerunning its builder or invoking stage callbacks. Unrelated charts return `undefined`. The weak lookup stores only the chart relationship, not a separate request-data registry.

Footprint's `chart.toMermaid()` exports one chart's root graph. The wrapper's graph shows its native-policy mount, while `getNativeBusinessPolicy(chart).toMermaid()` shows the mounted policy root's actual decisions/loops. Export each nested application subflow from its same factory object as a separate indexed view. Do not call a three-node wrapper export a complete business blueprint, flatten unshown descendants into an invented chart, or treat static topology as proof of a runtime branch or provider effect.

Use the explicit [application context builder](APPLICATION-CONTEXT.md) to connect those views to current source, public test setup and declared opaque boundaries. Keep omitted source and caller-declared contracts labeled. Correctness tests should exercise both branch outcomes, repeated loop visits, scope refusal, no-resend recovery and receipt/observation failure, and inspect actual execution snapshots. A descriptive stage name alone is not evidence that a business decision ran.
