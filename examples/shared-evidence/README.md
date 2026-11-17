# Booking and publication fixtures

Repository guide. Run from the repository root after dependency installation/build:

```sh
pnpm quickstart:booking
pnpm quickstart:publication
```

`booking.mjs` uses real FootPrintJS stages and in-memory SQLite; its applied row effects are recorded before the enclosing transaction commits. `publication.mjs` uses a real outer/inner Blueprint action and the typed SMB publication port; correlation links refer to actual nested invocations. `shared.mjs` checks receipt shape, privacy and Node compatibility.

The host authorization/session, storage and publisher are local fixtures, not shipped production adapters. Expected rejection logs can appear even when assertions pass. `package-template.json` is the archived 0.7.0 kit manifest; do not use its old versions as a current 1.1 install recipe. Follow [the quickstart](../../docs/QUICKSTART.md) for current installed-package paths.
