# Generate charts for your own application

The candidate library's `npm run docs:flows` and `npm run check:flow-docs` cover its built-in after-sales and default-service registries. They do not discover a consuming application's operations, custom builders or host callbacks. The unreleased Node-only application context builder now accepts an explicit application index/admitted source list and writes/checks its source/test packet: see [Application source and test context](APPLICATION-CONTEXT.md). It does not automatically discover host modules or expand every native mount. The library-registry chart-page generator below remains separate; the optional source reader accepts an explicitly supplied compatible application manifest rather than automatically admitting arbitrary application files.

An application can own the same build-time pattern: one runtime chart factory, an explicit construction-only index, and a deterministic documentation writer/checker. The example below uses the pinned FootPrintJS 12 API. It is a small wiring example, not an authorization, transaction or retry implementation.

## Use the runtime factory in the index

```js
// src/workflow.mjs
import { flowChart, FlowChartExecutor } from 'footprintjs';

export function buildWorkflow(session) {
  return flowChart('Check request', scope => {
    scope.allowed = session.input?.enabled === true;
  }, 'check-request')
    .addDeciderFunction('Request allowed', scope =>
      scope.allowed ? 'allowed' : 'denied', 'request-allowed')
    .addFunctionBranch('allowed', 'Call host operation', async () => {
      session.result = await session.ports.perform(session.input);
    })
    .addFunctionBranch('denied', 'Decline request', () => {
      session.result = { status: 'rejected' };
    })
    .end()
    .build();
}

export async function run(input, ports) {
  const session = { input, ports, result: undefined };
  const executor = new FlowChartExecutor(buildWorkflow(session));
  await executor.run({ maxIterations: 20 });
  return session.result;
}

export function buildChartIndex() {
  const inertPorts = new Proxy({}, {
    get() { throw new Error('Chart construction accessed a host port'); },
  });
  return [{
    id: 'request-workflow',
    chart: buildWorkflow({ input: undefined, ports: inertPorts }),
    source: { file: 'src/workflow.mjs', export: 'buildWorkflow' },
  }];
}
```

`buildChartIndex()` calls the exact factory used by `run()`. It constructs callbacks without invoking them. The undefined input and throwing ports expose accidental construction-time dependencies. Keep module imports free of business effects too. Add a test that index construction calls no provider and that every registered application workflow appears once. If a chart needs a resolver or a host value that cannot be obtained safely during construction, report that portion as unknown; do not execute it to complete the picture.

## Implement a host-owned writer/checker

For a full hierarchy of application-owned chart pages, `scripts/application-flow-docs.mjs` remains a **host-owned integration**, rather than an existing SMB command. Use the exported application context builder/writer for the supported index/source/test packet and opt-in README/AGENTS links. A richer chart-page integration should follow this contract:

1. Load the trusted application index in a fresh process after compilation, without running an executor or stage callbacks. Enumerate every actual indexed chart and retained mounted root. Refuse duplicate/missing registry membership.
2. Obtain each real root topology with the SDK exporter. In FootPrintJS 12, `chart.toMermaid()` is a root overview: mounted internals are collapsed, and its raw renderer uses rectangles and unlabeled arrows. Link separate retained subflow views. If adding diamonds, branch labels, mount boxes or loop labels from native metadata, verify original node identities and the complete edge multiset; annotations must not invent execution edges. A native `next` after branches is continuation after branch completion, not an unconditional bypass.
3. Produce a small main README index, relevant folder overviews, and linked full root/subflow pages. Add exact checkout source links and module hashes. Keep helper bodies, dynamic resolvers, exceptions and host/provider semantics explicitly unknown unless separately supplied. Set budgets that fail clearly rather than silently omitting nodes.
4. Hash production inputs, the index, generator code and relevant dependency versions. Exclude generated documents from their own input hash. Preserve handwritten README content outside uniquely marked generated regions. Declare and verify all owned output paths, including obsolete-page removal.
5. Compute expected bytes before mutation. `--write` writes those exact managed outputs; `--check` compares bytes and membership without rewriting anything, and exits unsuccessfully for stale, missing or extra owned outputs. Test a real factory edit: check fails, write updates the correct view, and a second write changes no bytes.

For TypeScript, compile the application before loading its index; bind source links and hashes to the original source and the build that produced the loaded module. JavaScript applications can use syntax checks directly. Static chart construction proves neither a business effect nor an observed runtime cause.

## Wire the application build and CI

Once the host-owned script exists, an application can use scripts like these; adapt `compile` to its actual build:

```json
{
  "scripts": {
    "build": "npm run compile && node scripts/application-flow-docs.mjs --write",
    "docs:flows": "npm run compile && node scripts/application-flow-docs.mjs --write",
    "check:flow-docs": "npm run compile && node scripts/application-flow-docs.mjs --check"
  }
}
```

CI must run `npm run check:flow-docs` **before** a build that writes diagrams, then run the normal build and tests. Otherwise regeneration could hide stale committed documentation. Alternatively compare the expected generated output with committed bytes in a clean checkout. A release should retain the generated source/version manifest alongside the documentation. These checks establish freshness and navigability, not reduced model tokens or automatically complete application semantics.
