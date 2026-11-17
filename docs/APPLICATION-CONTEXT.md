# Application source and test context

The unreleased candidate exports `smallbusiness-footprint/developer/application` and the explicit `smallbusiness-context` build/check command. These are Node/build tools. They are not imported by the main runtime or browser metadata entry and do not run automatically when the package is installed.

An application owns its index: explicitly admitted production files, configured workflow/source references and an approved public test example. The builder reads current source without importing application modules or executing test/build commands. It prepares a compact index and a goal-scoped packet containing complete selected modules, package facts, the public entry contract, commands and the approved smoke example. A complete small module often gives an agent more useful context than several fragment lookups.

## Configure the application

For example, put this JSON in `application-context.json`, adapting every path and contract to your application:

```json
{
  "goal": "change the dispatch stock policy",
  "characterBudget": 16000,
  "index": {
    "applicationName": "Small dispatch app",
    "sourceFiles": ["src/app.mjs", "src/rules.mjs"],
    "flows": [{
      "id": "dispatch",
      "description": "Validate a dispatch request and invoke the configured operation",
      "sources": [{"file": "src/app.mjs"}],
      "relatedSources": [{"file": "src/rules.mjs"}],
      "opaqueBoundaries": ["Provider internals are not supplied"]
    }],
    "development": {
      "entry": {"file": "src/app.mjs", "exportName": "run", "signature": "run(input, ports)"},
      "commands": {"test": "npm test", "build": "npm run build"},
      "smokeTest": {"file": "test/smoke.test.mjs"},
      "regressionTestDirectory": "test",
      "protectedFiles": ["package.json", "test/smoke.test.mjs"]
    }
  },
  "outputDir": "docs/application-context",
  "readmeFile": "README.md",
  "agentFile": "AGENTS.md"
}
```

`sourceFiles` is an admission list, not an automatic whole-disk scan. Private fixtures/tests are not production source. The separately approved smoke file is read and hash-bound; literal smoke text can instead be explicitly supplied by the caller. Entry signatures and commands are caller-declared contracts; package facts are read from the current package file. Commands are documented, never executed by this tool.

The first version packs **complete selected modules**, including their local imports/helpers. Optional canonical source manifests validate symbol/role selectors but do not change this into a clipped unit extractor. Imports into unselected files or packages are not automatically followed. Use `relatedSources`/`relatedFlowIds` for admitted dependencies and explicit opaque boundaries for anything unavailable. Goal selection uses public goal/index terms, not an evaluator or expected patch. With no matching terms, every configured flow is selected. Oversized complete packets fail clearly; narrow the index/goal or deliberately set a suitable budget. Nothing is silently truncated.

## Build and check

After installing the candidate in the application:

```sh
pnpm exec smallbusiness-context build --config application-context.json
pnpm exec smallbusiness-context check --config application-context.json
```

The library checkout can use `node dist/developer/application-cli.js` after `pnpm build`. Add equivalent commands to the application's build/CI. `check` rebuilds expected context in memory, compares managed bytes and membership, exits unsuccessfully when stale, and never rewrites output. Run it before a build that writes context so regeneration cannot hide outdated committed files.

The writer owns `index.md`, `packet.md`, `manifest.json` and an ownership file under the configured output directory. It refuses unowned files, source/test directories and unsafe/symlink paths. Root README/AGENTS changes require explicit paths and preserve text outside one marked section. No postinstall hook edits consumer files. A dedicated `.work-tmp` output directory is supported for ephemeral context; generated research artifacts do not belong in the library package.

## Use actual chart exports when available

The programmatic API accepts an explicitly trusted construction-time chart object on a flow:

```js
import {
  buildApplicationDeveloperContext,
  writeApplicationDeveloperContext,
  checkApplicationDeveloperContext,
} from 'smallbusiness-footprint/developer/application';

const context = await buildApplicationDeveloperContext({
  root: process.cwd(),
  index: applicationIndex,
  goal: publicDevelopmentGoal,
  characterBudget: 16000,
});
await writeApplicationDeveloperContext({root: process.cwd(), context,
  outputDir: 'docs/application-context', agentFile: 'AGENTS.md'});
const check = await checkApplicationDeveloperContext({root: process.cwd(), context,
  outputDir: 'docs/application-context', agentFile: 'AGENTS.md'});
if (!check.valid) throw new Error('Application context is stale');
```

Set `applicationIndex.flows[i].chart` to a chart produced by the same trusted factory used at runtime. Only its `toMermaid()` exporter is called, never an executor or stage callback. The index/exporter is caller-trusted; the tool cannot prove that an arbitrary caller-supplied object is the runtime factory. A plain `diagram` string is labeled caller-declared instead. Native exporters can collapse mounted internals: register the relevant child views explicitly rather than claiming an omitted child is covered. See [the application flow-build contract](APPLICATION-FLOW-BUILD.md).

The packet proves physical source correspondence and bounded static coverage, not provider effects, runtime lineage or complete application semantics. Host operations stay opaque until their implementation is explicitly admitted. The manifest keeps `completeApplication:false` even when all admitted source is supplied.

## Deliver source once, then fill named gaps

An agent integration can supply `packetText` directly as initial context. Generated README/AGENTS links make it discoverable; installing a package alone does not inject a packet into an agent prompt. Supplied current source counts as the initial read. Patch directly when it is sufficient, and inspect missing/changed details or verify behavior when needed. No read-avoidance rule is a correctness gate.

For explicit follow-up, `developer/node.inspectBatch` can validate several selectors together, share file metadata and omit a current body identified by a physically verified prior span. Packet spans translate to reader evidence as:

```js
const knownSpans = context.manifest.sources.map(s => ({
  file: s.file, moduleSha256: s.moduleSha256,
  start: s.start, end: s.end, textSha256: s.sourceSha256,
}));
```

Pass these with `includeSource:true` to `inspectBatch`; use `reread:true` when the body is needed again. This checks current bytes against caller-declared prior spans; it does not prove prior delivery or the model's memory. The reader's default 4,000-character cumulative JSON allowance is separate from the application packet budget; configure it deliberately. Batch metadata/source admission is atomic and refuses overflow rather than returning a prefix.
