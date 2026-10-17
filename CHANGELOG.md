# 0.5.0 — local candidate; not published

- Extract 27 local real-FootprintJS commerce failure scenarios into the explicit `smallbusiness-footprint/testing` entry, with typed paired storage ports and immutable scenario metadata.
- Add the vendor-SDK-free `smallbusiness-footprint/diagnostics` commerce adapter normalization wrapper over Blueprint 0.5 diagnostics.
- Keep private fault scripts, provider ledgers and test counters outside diagnostic evidence; preserve actual native attempt bindings, unknown write effects and separate diagnostic failures.
- Keep application UI, translations, runtime provider wiring and durable storage outside this library. Existing checkout, shipping, publication and after-sales entry points remain unchanged.

Local candidate only; npm publication and Gamma deployment are not part of this change.

# 0.4.0 — 2026-10-16 (prepared; publication pending)

- Pin Blueprint 0.4.1 and FootprintJS 10.1.0.
- Preserve vendor-neutral shipping, owner-approved cancellations/returns/refunds and per-shop policy configuration.
- Read trace runtime metadata from the public installed engine manifest and retain optional trusted execution controls.
- Preserve checkout, publication, authorization and authoritative repository/provider decisions.

Publication and final stable-package validation are pending.

# 0.4.0-gamma.1 — private coordinated engine candidate

- Preserve owner-approved cancellation, return and refund flows plus vendor-neutral shipping from the existing after-sales candidate.
- Pin Blueprint 0.4.1-gamma.1 and FootprintJS 10.1.0-gamma.1.
- Add optional trusted engine controls for direct actions and after-sales runs, preserving defaults and authoritative provider/repository decisions.
- Record actual engine runtime version alongside native after-sales traces.

Local Gamma artifacts only; no npm publication.

# 0.3.1-shipping.1 (local candidate)

- Add vendor-neutral shipping contracts, explicit adapter registry, and verified webhook boundary.
- Retain all functionality from the published 0.3.0 release.

# Changelog

## 0.3.0 — prepared single-Blueprint-package release

Prepared on 2026-10-12; npm publication is pending.

- Replaced six former `@footprint/*` dependencies with the single `footprint-blueprint@0.4.0` package and focused framework imports.
- Retained the optional commerce package, browser metadata entry, authoritative operation ports and separate `footprintjs@10.0.0` engine.
- Updated the two-artifact release-kit quickstart and migration documentation.

This is a packaging migration for modern consumers. Existing school and booking compatibility workspaces are not automatically upgraded. Direct action evidence and recorded service-flow results retain their distinct boundaries. Hosts still own authentication, transactions, idempotency, providers and durable recovery.

The inherited commerce suite contains 217 tests; the generated release record identifies actual candidate verification results.

## Earlier preparation — historical

## 0.2.4 — prepared release

Prepared on 2026-10-12; not yet published to npm.

- Consolidated the tested library into the canonical `footprintjs/smallbusiness-footprint` checkout.
- Added repository, issue, public-access and package-file metadata, a build-before-pack hook and a tarball-based quickstart guide.
- Updated the package dependency matrix to Actions / Platform 0.3.2 and Features / Tenancy / Seed / Adapters 0.2.1.

Runtime source is unchanged from local 0.2.3. The existing metadata-only browser entry point and backend execution boundaries remain in place.

## Tested local 0.2 baseline

- Migrated from the older demo runtime to FootPrint.js 10.0.0, ESM and Node 24.
- Required configured providers, trusted authorization, full scope and strict schemas before executing business operations.
- Added authoritative checkout, inventory and publication ports, captured guards, private request storage and safe recorded summaries.
- Allowed additional profile and module definitions while validating their dependencies.

Direct Blueprint actions expose shared execution evidence. SMB recorded service flows retain their separate native-recording result; they do not automatically supply common observation/effect receipts. Charming Cherubs reports shared evidence at its explicit application publication boundary.

Hosts continue to own storage transactions, payment/email providers, idempotency and durable recovery. See [the integration guide](docs/INTEGRATION.md) for migration from 0.1.
