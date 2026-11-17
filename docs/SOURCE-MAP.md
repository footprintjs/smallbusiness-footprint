# Source map and opaque boundaries

Paths below are **repository-only navigation paths**, not local hyperlinks expected in every installed package. The published 1.1.0 baseline is [commit 7a28a731](https://github.com/footprintjs/smallbusiness-footprint/tree/7a28a731eb45d43b82b1fc34fac71a481055e9d8). Its implementation is historical context; unreleased changes in this working checkout must be read from current source. Use the public exports/declarations when integrating an installed package.

The unreleased developer source pack keeps canonical `src/...` identities but ships production copies under `dist/source/...`; the generated manifest supplies each actual `packagePath`. Existing published 1.1.0 does not contain that new pack. Do not guess a local `src/` path or treat a build hash as current-source verification.

## Runtime and authoritative operations

| Task | Repository path | What is visible and what stays outside |
| --- | --- | --- |
| Bind scope, profile and action preparation | `src/businessPlatform.ts` | Library composition, authorizer wiring and service dispatch; host authentication remains external |
| Find the registered action chart or per-profile variant | `src/flows/businessServiceComposer.ts` | Actual dispatch, private request lifetime, executor/capture setup and receipt handling; custom builders are trusted code |
| Inspect the common service wrapper | `src/flows/shared/businessFlow.ts` | Validate command → execute configured operation → build safe output; host operation body is opaque unless supplied separately |
| Find action-specific factory selection | `src/flows/{catalog,orders,subscribers,campaigns}/` | Native factory/call sites; names are not proof of deeper host business behavior |
| Resolve configured provider or exact operation | `src/operations.ts` | Operation mapping, receipt validation and safe output/failure projection |
| Check checkout, stock or publication receipt contracts | `src/{checkoutPort,inventoryPort,publicationPort}.ts` | Typed command/receipt checks; transactions, reservation, CAS and durable recovery are host responsibilities |
| Change after-sales control structure | `src/aftersales/flowCharts.ts` | Internal request/action charts, actual decisions, loop targets and subflow mappings; not a public import |
| Inspect after-sales effects and predicates | `src/aftersales/runtime.ts` | Request-local commands/cases, authoritative port calls and safe fact producers; private state stays in closures |
| Check after-sales types and policy | `src/aftersales.ts` | Browser-safe contracts and validated policy; no database/payment implementation |
| Add a shipping adapter | `src/shipping.ts` | Public contract, allowlisted registry and safe URL handling; vendor/authentication code is host-owned |

For a root-cause investigation, continue through the real operation/port implementation and stored evidence. Do not stop at a wrapper and label its host transaction “fully understood.”

## Configuration and selection

| Repository path | Responsibility |
| --- | --- |
| `src/actions/businessActions.ts` | Action IDs, strict schemas, required modules and permissions |
| `src/modules/` | Seven dependency-ordered module definitions, roles, seeds and module-owned terminology |
| `src/profiles/businessProfiles.ts` | Two example presets and conversion to business configuration |
| `src/capabilities/businessCapabilities.ts` | Capability declarations; availability is not an authoritative operation implementation |
| `src/adapters/` | Capability/action mappings and low-level bound adapters; no caller authentication by themselves |
| `src/overrides/unitOverrides.ts` | Scoped revisioned overrides; effective transitive disabling is composed by the platform |
| `src/terminology/businessTerms.ts` | Terminology defaults and profile wording |
| `src/metadata.ts` | Browser-safe declaration export graph |

## Diagnostics and validation

| Task | Repository path | Evidence boundary |
| --- | --- | --- |
| Normalize a provider-shaped error safely | `src/diagnostics.ts` | Bounded classification, not proof of an upstream outage or a retry policy |
| Attach a real provider-call recorder | `src/diagnostics/runtime.ts` | Thin commerce wrapper over Blueprint; no vendor/storage implementation |
| Customize explanation wording | `src/diagnostics/explanations/` | Immutable problem/suggestion presets; no new causal finding or repair |
| Query saved after-sales native scopes | `src/diagnostics/aftersalesCause.ts` | Optional scoped projection and canonical cause reader; sparse recorded reads, actual addresses and explicit gaps, never a fake flattened snapshot |
| Run 27 local failure scenarios | `src/testing/{runner,scenarios}.ts` | Saved/reloaded native evidence; observed counters remain test-only |
| Run 12 local provider-boundary scenarios | `src/testing/boundaryScenarios.ts` | Local SDK doubles, including partial/late evidence; no cloud request |
| Inspect native after-sales decisions | `src/__tests__/aftersales/` | Business branches, unknown/refund handling and privacy |
| Check service wrappers and scope | `src/__tests__/scenario/` and `src/__tests__/security/` | Actual SDK execution, typed ports, authorization and recording limits |
| Check diagnostic/catalog isolation | `src/__tests__/testing/` | Boundary classification, retained records and import-layer tests |
| Check configuration declarations | `src/__tests__/unit/` | Modules, profiles, schemas, adapters and terminology |

## Optional developer tooling in this candidate

Repository paths `src/developer/{index,types}.ts` define the separate static catalog and `src/developer/node.ts` implements the explicit bounded Node reader. `scripts/developer/build-manifest.mjs` creates the source inventory/copy and rewrites emitted map paths after TypeScript compilation. The parser remains a development dependency. New exports are `/developer`, `/developer/node` and `/developer/source-manifest.json`; none is re-exported into the existing main/metadata runtime graph. See [the exact APIs and limits](DEVELOPER.md).

Repository test paths are not installed APIs and must not become production descriptor/source-pack inputs. See [the agent guide](AGENT-GUIDE.md) for how to combine source facts with retained runtime evidence.

## Application development context

`src/developer/application.ts` owns the explicitly admitted application index, current complete-module/public-test packet, ownership-aware writer and read-only check. `application-cli.ts` is the opt-in JSON build/check executable. Precise method/property units originate in `scripts/developer/build-manifest.mjs`; `developer/node.ts` rechecks physical bytes for single/batch inspection and known-span reuse. These paths are development-only, not runtime ownership of host business policy.
