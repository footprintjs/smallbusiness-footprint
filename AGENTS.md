# Working on this library

Start with [docs/AGENT-GUIDE.md](docs/AGENT-GUIDE.md) and [docs/SOURCE-MAP.md](docs/SOURCE-MAP.md). Choose the action/flow and a concrete source gap before broad reading. Use supplied current source when sufficient; inspect any additional source needed for correctness. No tool or read-avoidance rule is an acceptance gate.

- Keep public APIs aligned with `package.json` exports and actual installed/build artifacts. New candidate APIs are unreleased even while the compatibility version remains 1.1.0.
- Trace actual guards, loops, input/output mappings and field writers to the owning callable. Static descriptions and possible writers are navigation facts, not observed runtime causes.
- Preserve opaque host boundaries. Do not invent transaction, retry, provider, storage or business behavior hidden behind a port.
- Keep customer input, tokens, reasons, identities, raw provider errors and responses out of recorded state. Missing/partial recording remains unknown and cannot reverse an acknowledged operation.
- Keep actual decisions in native decider stages. Preserve business rules, authorization, scope, idempotency and uncertainty while changing representation or diagnostics.
- Use targeted meaningful tests first; run typecheck/build and the appropriate broader suite for the final change. Test both branch outcomes, safe producer facts and acknowledged-operation behavior when relevant.
- Preserve historical changelog/release evidence. Do not turn local validation into a publication, deployment or live-provider claim.

Use Node 24.15–24.x and the declared package manager. The source checkout has a development-only Blueprint tarball override; published consumers have numeric dependencies. See [docs/QUICKSTART.md](docs/QUICKSTART.md). Routine authorized edits need no additional approval flow from this guide.
