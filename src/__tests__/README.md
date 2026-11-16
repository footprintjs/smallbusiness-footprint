# Choose a meaningful test surface

Repository-only fixtures; never publish them as production source/descriptor inputs. `unit/` checks schemas/configuration/mappings, `scenario/` runs real wrapper/port paths, `security/` checks validation and private state, `aftersales/` checks business and native control behavior, and `testing/` checks stored diagnostic fixtures. `property/` exercises invariants; `performance/` has local timing assertions, not a model-development benchmark.

Run the smallest relevant Vitest file while editing, then typecheck/build and the appropriate broader suite. For control changes cover both branch outcomes and retained evidence; for recording changes prove private values stay absent and acknowledgement survives observational failure. Independent test counters must not become diagnosis inputs.

Example: `pnpm exec vitest run src/__tests__/scenario/serviceComposer.test.ts`. No local test result establishes a real provider, deployment or publication.
