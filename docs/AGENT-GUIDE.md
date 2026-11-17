# Find the change and follow the evidence

Use this guide when an application task or saved run points to SMB code. The goal is a correct change supported by current source and actual execution facts. Reusing supplied source can save reconstruction, but reading additional code is always appropriate when a gap remains.

## Read the chart and keep its documentation current

Start at the [generated flow index](flows/README.md), select the action/flow, and open its algorithm/contract page. Follow only the relevant child-flow links, then inspect actual predicates, mappers, callers and writers for concrete implementation gaps. Supplied current source can already satisfy an initial read; use it directly when sufficient. The index is a navigation aid, not a requirement to read every chart or a ban on broader inspection needed for correctness.

Maintain the runtime chart factory, callback logic and accurate stage descriptions/contracts together. Generate README algorithms from those definitions; do not maintain a second handwritten algorithm inside generated regions. After a chart/source/metadata edit, run `npm run docs:flows` or the normal `npm run build`, then `npm run check:flow-docs`. Review and commit generated changes with the source. The read-only check can identify uncertain freshness before a change. When it fails, reconstruct charts from current source, regenerate, review the source/documentation diff and check again.

Build regeneration and freshness checks are implemented. File-change watching and a Vitest documentation plugin are not implemented yet; agents must not assume that saving a file updates its README. CI runs the read-only check before any build that writes docs. The generated text follows chart metadata/topology and source identities; manually supplied descriptions still need review against callback semantics.

These root instructions cover this repository. An npm installation does not create `AGENTS.md` or `CLAUDE.md` in a host project. Add the [application templates](APPLICATION-FLOW-BUILD.md#tell-coding-agents-where-to-start) explicitly, using that application's generated index and actual package scripts. The optional source/test packet writer can manage its own instruction block; the chart-page writer manages the configured README block and does not create either agent instruction file.

## Choose the boundary

Identify the public action/flow ID, trusted scope and API used by the application. `executeAction` and `executeServiceFlow` are different recording paths. After-sales has its own request/action runtime. Start with the [source map](SOURCE-MAP.md), then the owning callable rather than an unrelated package-wide scan.

An ordinary `describeService` call builds a registered chart to describe it; custom builders are trusted code. Do not call it a pure catalog lookup. Use the separate unreleased developer catalog when available in the candidate build; it declares only the registered description and its source/opaque boundaries.

## Find an editable source surface

Read the actual caller, selected decision and relevant mapper, then follow transported fields to possible source writers. Inspect the complete original callback or bounded callable before editing. If a parent/helper body is omitted, a source reference or hash is not a substitute for that body. A static writer is a possible producer, not proof it ran or caused the observed value.

Verify that supplied source matches the version being edited. A manifest describes a build; the optional Node source reader must compare actual current bytes before reporting a matching version. Prefer live checkout source over a retained packaged copy when both exist. A stale or missing match is a concrete gap, not permission to invent the code. Public installed paths come from the generated manifest; repository-only paths are labeled in the source map.

## Walk backward from an actual failure

1. Start from the saved run's first failed or uncertain native stage/attempt, keeping its real IDs and evidence references.
2. Inspect the current guard and actual recorded branch/loop decision. A description alone is not an executed decision.
3. Follow retained reads/writes and scope mappings to the preceding source or recorded writer. A read prefix shows earlier reads, not proof of an expression-level data dependency.
4. At an application port, inspect the host implementation or retained host/provider evidence if authorized. The SMB wrapper cannot explain an opaque transaction or unobserved SDK retry.
5. Separate recorded cause, possible source relationship and unresolved requirement. Preserve incomplete prefixes, unsupported scopes, dropped events and unknown effects.

A successful reconciliation read proves that the read answered; the authoritative domain receipt determines the payment/refund state. Correlation links and matching names do not create causal proof. Expected work absent from commits is not observed, not automatically skipped or failed. An old recording does not gain evidence from a newer library.

## Change behavior without weakening evidence

Keep decisions in actual native decider stages and preserve their branch destinations. Produce only the bounded safe facts a guard needs from its real private predicate: a boolean, fixed tag or position/eligibility tuple where required. Do not copy the customer command, private case or provider response into the trace. Do not replace a real condition with a descriptive annotation. For saved mounted after-sales records use [the scoped cause reader](AFTERSALES-CAUSE.md), retaining its incomplete/scope-boundary answers rather than converting the trace to a fake root.

Preserve scope/authorization, integer-money and quantity rules, atomic port contracts, durable idempotency and unknown-write recovery. A chart finishing does not authorize success without its validated receipt. A later recorder failure cannot erase an acknowledged operation or create a business retry.

## Verify the relevant contract

Use the targeted test group listed in the source map, including both decision outcomes and evidence/privacy assertions for a control change. Use independent observed counters only in tests, never as diagnosis input. Run appropriate broader tests, typecheck and build before reporting completion. Do not claim a real provider, deployment, publication or benchmark improvement from local fixtures alone.

Keep ordinary source inspection unrestricted. No new permission gate or automatic repair is introduced by these instructions. All new developer/source-pack APIs in this candidate remain unreleased until a separate package release.
