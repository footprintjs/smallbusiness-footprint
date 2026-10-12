# Try the prepared libraries locally

The release kit includes a small booking example and a Charming Cherubs publication example. They teach the application integration patterns with local fixtures, rather than requiring the full applications or their hosting infrastructure.

These seven Footprint library packages are local release candidates and are not yet published to npm. Use Node 24.15–24.x and npm. Extract the release kit, then run from its root:

```sh
cd quickstart
npm ci --ignore-scripts
npm run booking
npm run publication
npm test
```

The Footprint packages install from included local tarballs. Initial installation needs npm access for pinned third-party dependencies unless cached. The examples use sample data and in-memory storage and require no cloud account, model or credentials. Both commands print JSON to standard output without writing files. Expected SDK error diagnostics for rejection cases go to standard error; exit status 0 and passed assertions indicate a successful run.

The booking example runs actual FootPrint stages and in-memory SQLite, reporting acceptance, overlap rejection and cancellation through the pure evidence collector. Its `applied` effects describe actual row counts before the enclosing transaction commits. The overlap workflow completes normally while its business outcome is rejected.

The publication example follows Charming's `createPlatform` boundary with two actual Platform actions and the SMB typed publication port. It checks authorization and schema, invokes an authoritative fixture publisher and reports a confirmed in-memory publication effect. Repeating the exact captured old guards fails without another commit; a stale source revision also fails, and an unauthorized caller is rejected before an inner action. Each `calls` link points to an actual recorded inner invocation. The receipt uses a generic execution-failure code for stale requests, while the action response retains the domain `PUBLICATION_CONFLICT` code.

Inspect each receipt's `schemaVersion`, outcome, effects, run links and coverage. A related-run link is a correlation; a reported commit depends on what the host port actually confirms. Default shared capture omits private values. Shape validation does not establish receipt authenticity.

## Use SMB in an application

Use `smallbusiness-footprint/metadata` in a browser for module, profile, capability and action declarations. Use the main entry point on the backend. Supply bound scope, a profile store, trusted authorization and authoritative providers or exact operations. The [integration guide](INTEGRATION.md) describes those contracts.

`executeAction` goes through Blueprint's action executor and can return a shared receipt. `executeServiceFlow` uses SMB's recorded business workflow path and returns its own SDK snapshots, manifests and narratives; it does not automatically produce the same common effect receipt. Charming Cherubs adds explicit reporting at its application publication boundary while retaining its original workflow recording.

The reduced quickstart is not the complete booking app or Charming Cherubs deployment. Use the separate conference demo kit to explore their fuller local demonstration. Existing Node 22 booking consumers retain the pure-helper compatibility backport; this prepared SDK requires Node 24.15–24.x.

No agent is included. A future client can reuse an authenticated application action boundary and inspect recorded outcomes; the host remains responsible for transport, permissions, transactions and recovery.

The sibling Blueprint repository contains the release runbook in `docs/RELEASE.md`; use its copy included in the release kit. The preparation branch is local until the reviewed source is published.
