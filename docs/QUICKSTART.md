# Run the current 1.1 examples

Use Node 24.15–24.x. The current source checkout and published 1.1.0 compatibility line use Blueprint 1.1.0, FootPrintJS 12.0.0, Foottrace 1.15.0 and Zod 4.6.5. New developer/source-navigation APIs and after-sales representation changes in this working candidate are **unreleased**, even while its package version remains 1.1.0.

## From the source checkout

```sh
pnpm install
pnpm build
pnpm quickstart:booking
pnpm quickstart:publication
```

Use the pnpm version declared in `package.json`. `pnpm-workspace.yaml` supplies a development-only override to the included reviewed Blueprint 1.1.0 archive; the public package keeps a numeric Blueprint dependency. The override and historical kit template are not consumer installation requirements. Initial installation may need registry access for third-party dependencies. Do not replace the current dependencies with the historical template below.

## From a registry installation

In an application directory with Node 24.15–24.x:

```sh
npm install smallbusiness-footprint@1.1.0
node node_modules/smallbusiness-footprint/examples/shared-evidence/booking.mjs
node node_modules/smallbusiness-footprint/examples/shared-evidence/publication.mjs
```

The package declares and installs its matching runtime dependencies. This executes the examples shipped by that published package; it does not install unreleased changes from a working checkout. For a newly packed local candidate, install its tarball and the matching Blueprint tarball explicitly, then run the examples from that installation. A successful source build, packed-consumer test or example run is separate from publication and deployment.

## What the examples prove

The release kit includes a small booking example and a publication example. They teach the application integration patterns with local fixtures, rather than requiring the full applications or their hosting infrastructure.

Both examples use sample data and in-memory storage without a model, cloud account or credentials. They print JSON and assert the recorded outcomes. Expected rejection diagnostics can appear on standard error; exit status 0 and passed assertions indicate a successful local run. They are reduced integration fixtures, not a deployed application or proof of a live provider. [Integration contracts](INTEGRATION.md) explain what a production host must implement.

## Archived 0.7 kit and 1.0 migration

The source checkout's `examples/shared-evidence/package-template.json` describes the historical 0.7.0 kit and its original dependencies. It is not the current 1.1 installation recipe. Version 1.0 adopted FootPrintJS 12 and Blueprint 1.0; [its migration record](MIGRATION-1.0.md) remains historical. For an existing archived kit, extract it and run from its own root:

```sh
cd quickstart
npm ci --ignore-scripts
npm run booking
npm run publication
npm test
```

Both historical libraries install from the kit's own tarballs. Initial installation needs npm access for its pinned third-party dependencies unless cached. This archived kit does not test current 1.1 libraries or the unreleased working candidate.

The booking example runs actual FootPrint stages and in-memory SQLite, reporting acceptance, overlap rejection and cancellation through the pure evidence collector. Its `applied` effects describe actual row counts before the enclosing transaction commits. The overlap workflow completes normally while its business outcome is rejected.

The publication example uses a `createPlatform` boundary with two actual Platform actions and the SMB typed publication port. It checks authorization and schema, invokes an authoritative fixture publisher and reports a confirmed in-memory publication effect. Repeating the exact captured old guards fails without another commit; a stale source revision also fails, and an unauthorized caller is rejected before an inner action. Each `calls` link points to an actual recorded inner invocation. The receipt uses a generic execution-failure code for stale requests, while the action response retains the domain `PUBLICATION_CONFLICT` code.

Inspect each receipt's `schemaVersion`, outcome, effects, run links and coverage. A related-run link is a correlation; a reported commit depends on what the host port actually confirms. Default shared capture omits private values. Shape validation does not establish receipt authenticity.

## Framework imports

The booking pattern imports `createEvidenceCollector` from `footprint-blueprint/evidence`. The publication boundary uses `footprint-blueprint/platform` and SMB's typed publication port. The root Blueprint entry loads all Platform layers; Features and Evidence have focused runtime graphs. Static imports load their graph immediately; use `await import('footprint-blueprint/actions')` when actions should load on demand. None of these choices changes npm's dependency downloads.

## Use SMB in an application

Use `smallbusiness-footprint/metadata` in a browser for module, profile, capability and action declarations. Use the main entry point on the backend. Supply bound scope, a profile store, trusted authorization and authoritative providers or exact operations. The [integration guide](INTEGRATION.md) describes those contracts.

`executeAction` goes through Blueprint's action executor and can return a shared receipt. `executeServiceFlow` uses SMB's recorded business workflow path and returns its own SDK snapshots, manifests and narratives; it does not automatically produce the same common effect receipt. A host can add explicit reporting at its application publication boundary while retaining its original workflow recording.

The reduced quickstart is not a complete booking app or a deployed storefront. Use the separate conference demo kit to explore their fuller local demonstration. Existing Node 22 booking consumers retain the pure-helper compatibility backport; this prepared SDK requires Node 24.15–24.x.

No agent is included. A future client can reuse an authenticated application action boundary and inspect recorded outcomes; the host remains responsible for transport, permissions, transactions and recovery.

The sibling Blueprint repository contains the release runbook in `docs/RELEASE.md`; use its copy included in the release kit. Local quickstart results do not establish registry publication or application deployment; verify those separately against the release receipt.

## Source CI and release approval

Ordinary source CI checks a packed candidate against this checkout's complete manifest, trusted package/publisher identity, a stable source version, exact portable stable dependencies, required documentation and declared main/type/export files. New source versions and dependencies can pass these checks without altering historical immutable release approval. This produces a `checked-source-package` artifact; passing source checks does not approve an npm release. Explicit publication still requires the unchanged reviewed archive hashes in both verification and the main-only OIDC publisher. A changed candidate is refused for publication until it receives a separate exact-byte review. No source check updates the approved archive record or publishes a package.
