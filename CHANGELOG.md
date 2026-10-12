# Changelog

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
