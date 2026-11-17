# Optional source tooling

Repository guide for unreleased exports, not a core execution layer. `index.ts` reads caller-trusted static registrations/manifest data without building charts; `types.ts` defines source selectors, declared fields and opaque operation boundaries. `node.ts` verifies actual current source and returns bounded metadata or explicitly requested source without executing application modules.

Build-manifest resolution is not freshness: it stays `not-checked` until the Node reader compares bytes. Hash correspondence is not publisher authenticity, runtime lineage or a root cause. Custom builders without descriptors remain unknown. The default 4000-character cumulative allowance is per reader instance, including the whole returned JSON/accounting; overflow throws rather than truncating.

Production source is copied once to `dist/source/` by `scripts/developer/build-manifest.mjs`, and maps point there. `__tests__`, `__fixtures__`, `.test.ts`/`.spec.ts` and benchmark artifacts are excluded; the explicit public `/testing` helper implementation remains production code. The main runtime and browser metadata entry do not import these tools. Package installation bytes still include the source pack even when application imports omit it.

Use [the developer guide](../../docs/DEVELOPER.md) and the candidate's source/catalog/package tests. Build before validating the packed consumer and check stale source, bounds, private-file exclusion and map resolution. Do not substitute a published 1.1 package for candidate validation.

`application.ts` is the optional Node/build application index and upfront source/public-test packet builder, with explicit writer/checker and a JSON CLI. It imports only Node built-ins, not a parser or runtime application. `node.ts.inspectBatch` adds atomic multi-selector reads, shared file metadata and explicit known-span reuse with reread override. Main/runtime/browser entries remain separate. See [application context](../../docs/APPLICATION-CONTEXT.md).
