# Generate charts for your own application

The candidate library's `npm run docs:flows` and `npm run check:flow-docs` cover its built-in after-sales and default-service registries. They do not discover a consuming application's operations, custom builders or host callbacks. The unreleased Node-only application context builder now accepts an explicit application index/admitted source list and writes/checks its source/test packet: see [Application source and test context](APPLICATION-CONTEXT.md). It does not automatically discover host modules or expand every native mount. The optional application flow-documentation API generates algorithm pages from explicitly registered runtime charts, independently of goal-scoped source packets. The optional source reader still requires an explicitly supplied compatible application manifest.

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

## Generate application algorithm pages

The unreleased candidate exports `buildApplicationFlowDocumentation`, `writeApplicationFlowDocumentation` and `checkApplicationFlowDocumentation` from `smallbusiness-footprint/developer/application`. The application owns a small integration script that freshly constructs its exact runtime charts. The writer generates a compact root catalog, individual flow READMEs with parent/child links, and a hash-bound manifest. It is independent of the source/test packet and does not append every diagram to agent prompts.

```js
// scripts/application-flow-docs.mjs
import {
  buildApplicationFlowDocumentation,
  writeApplicationFlowDocumentation,
  checkApplicationFlowDocumentation,
} from 'smallbusiness-footprint/developer/application';
import { buildChartIndex } from '../src/workflow.mjs';

const root = process.cwd();
const documentation = await buildApplicationFlowDocumentation({
  root,
  index: {
    applicationName: 'Request application',
    sourceFiles: ['src/workflow.mjs'],
    flows: buildChartIndex().map(({ id, chart, source }) => ({
      id, chart, sources: [{ file: source.file, symbol: source.export }],
    })),
  },
});
const options = { root, documentation, readmeFile: 'README.md' };
if (process.argv.includes('--write')) await writeApplicationFlowDocumentation(options);
const checked = await checkApplicationFlowDocumentation(options);
if (!checked.valid) throw new Error('Stale flow documentation: ' + checked.differences.join(', '));
```

The default output directory is `docs/application-flows`. Supply the same `outputDir` to the builder and writer/checker when choosing a different location. Register each retained child chart explicitly with `parentId` and `mountId`; the API does not discover hidden, dynamic or lazy builders. The relationships are caller-declared construction metadata. Each root diagram can collapse child internals, so child pages contain their own actual chart views.

Algorithm text reuses `chart.description` / `toMCPTool().description`, with exact native node/control labels as a fallback. Declared stage descriptions and input/output schemas remain attributed metadata. Tool-schema export is formatting at build time; it requires no running MCP server or agent navigation. Business callbacks and providers are not executed. Chart exporters and module imports are trusted application code; keep construction free of business effects.

Every admitted production source is read and hashed before and after export. Missing, extra, edited or obsolete managed pages fail the read-only check. Writes preserve prose outside the README marker block, refuse unowned files and symlinks, and preserve manually modified obsolete pages for review. Source links and current hashes support inspection; selectors are navigation declarations, not inferred predicates or proof of effects.

Generation keeps documents synchronized with chart metadata and topology. If a callback changes while its manually supplied description remains unchanged, generation cannot prove that prose is still correct. Inspect exact predicates/mappers for that question; keep unsupported semantics unknown. A source hash is an identity check, not a semantic validator.

For TypeScript, compile the application before loading its index; bind source links and hashes to the original source and the build that produced the loaded module. JavaScript applications can use syntax checks directly. Static chart construction proves neither a business effect nor an observed runtime cause.

## Wire the application build and CI

With the integration above, an application can use scripts like these; adapt `compile` to its actual build:

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

## Tell coding agents where to start

Add the following section to the application's existing `AGENTS.md`, preserving other project instructions. The paths and commands below match the example above; adapt them to the application's actual generated index and package scripts. The library's root instruction files are repository guidance, not files installed into every consuming app.

```md
## Workflow development

Start at [the generated application flow index](docs/application-flows/README.md).
Choose the relevant flow, follow its child links, and inspect owning source for
missing predicate, mapping or effect details. Reuse supplied current source when
sufficient; read any additional code needed for correctness.

Edit the runtime flow factories/callbacks and accurate stage descriptions together.
Regenerate with `npm run docs:flows` or `npm run build`, then verify with
`npm run check:flow-docs`. Review and commit source and generated documentation
changes together. Keep handwritten edits outside generated regions.

CI checks freshness before a writing build. Do not assume a documentation watcher
exists unless this project explicitly configures one. Static metadata and source
hashes do not prove runtime effects or complete callback semantics.
```

For a root `CLAUDE.md`, add a short pointer to the same instructions:

```md
# Project instructions

Follow [AGENTS.md](AGENTS.md), including its workflow-development instructions.
Start with the generated application flow index and the relevant child/source links.
```

The chart-page writer updates its explicitly configured README marker block; it does not create or overwrite either agent instruction file. The source/test context writer's optional `agentFile` block is a separate integration. Agent instructions guide compatible tools; they do not guarantee that every client loads these files or follows the navigation strategy. Verify actual reader behavior in development benchmarks.
