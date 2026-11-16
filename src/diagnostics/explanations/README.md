# Optional commerce explanation wording

This folder owns static, immutable commerce presets. Blueprint owns template validation, matching, safe rendering, defaults, evidence and uncertainty. There is no second diagnosis engine here.

The presets match actual stored-diagnosis finding codes for access rejection, an uncertain external write, observed transport recovery and failed recording confirmation. They customize the problem and suggested check; none supplies a cause or claims a repair. A generic boundary failure cannot select a shipping or inventory explanation without an independently admitted business finding code.

The current 1.1 compatibility line uses Blueprint 1.1's explanation formatter. Pass these optional presets through its `templates` option; keep the canonical recorded observation, evidence links, unknowns and reconciliation guard visible. Custom wording is authored explanation, not new proof. Advice executes nothing and grants no permission.

The adjacent tests run real local commerce boundary fixtures and diagnose their saved/reloaded records. They also prove that one consumer cannot mutate the shared wording for later callers. No provider or cloud adapter is contacted.

Repository navigation: `index.ts` owns the immutable presets and `__tests__/presets.test.ts` checks the actual finding-code match, privacy and uncertainty boundaries. Run `pnpm exec vitest run src/diagnostics/explanations/__tests__/presets.test.ts` from a source checkout. This folder guide is repository documentation; the public API is `smallbusiness-footprint/diagnostics`, not a private source import.
