# Working on this library

For workflow changes, start with the [generated flow index](docs/flows/README.md), choose the relevant flow and follow its child-flow/source links. A supplied current source/test packet can already cover that initial read: use it directly when sufficient and inspect additional source for concrete missing or changed details. Do not require a navigation ritual or prohibit reads needed for correctness.

The shared workflow is in [docs/AGENT-GUIDE.md](docs/AGENT-GUIDE.md); [docs/SOURCE-MAP.md](docs/SOURCE-MAP.md) locates ownership and opaque boundaries. Change runtime factories, callbacks and their accurate metadata, then regenerate documentation with `npm run docs:flows` or the normal `npm run build`. Verify with `npm run check:flow-docs` and review generated changes alongside source. Keep handwritten edits outside generated regions. Builds regenerate; CI checks before a writing build. Automatic file watching / a Vitest documentation plugin is not implemented yet.

For consuming applications, use their own registered chart index, source/test packet and declared scripts; this library's charts do not discover host workflows. The [application guide](docs/APPLICATION-FLOW-BUILD.md#tell-coding-agents-where-to-start) supplies `AGENTS.md` and `CLAUDE.md` templates. Root repository instructions are not installed into consuming projects automatically.

- Keep public APIs aligned with `package.json` exports and actual installed/build artifacts. New candidate APIs are unreleased even while the compatibility version remains 1.1.0.
- Trace actual guards, loops, input/output mappings and field writers to the owning callable. Static descriptions and possible writers are navigation facts, not observed runtime causes.
- Preserve opaque host boundaries. Do not invent transaction, retry, provider, storage or business behavior hidden behind a port.
- Keep customer input, tokens, reasons, identities, raw provider errors and responses out of recorded state. Missing/partial recording remains unknown and cannot reverse an acknowledged operation.
- Keep actual decisions in native decider stages. Preserve business rules, authorization, scope, idempotency and uncertainty while changing representation or diagnostics.
- Use targeted meaningful tests first; run typecheck/build and the appropriate broader suite for the final change. Test both branch outcomes, safe producer facts and acknowledged-operation behavior when relevant.
- Preserve historical changelog/release evidence. Do not turn local validation into a publication, deployment or live-provider claim.

Use Node 24.15–24.x and the declared package manager. The source checkout has a development-only Blueprint tarball override; published consumers have numeric dependencies. See [docs/QUICKSTART.md](docs/QUICKSTART.md). Routine authorized edits need no additional approval flow from this guide.
