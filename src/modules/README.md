# Business modules

Repository guide. `index.ts` lists seven modules in dependency order. Each definition owns its dependency, roles, seed metadata and terminology declarations. A module being enabled does not supply an authoritative payment, inventory or publishing implementation.

Omitted `createBusinessPlatform` definition arrays use built-ins; supplied arrays replace them. Extend with the exported defaults, preserve stable IDs/dependencies when replacing a definition, and validate effective configuration. Explicit disabling removes transitive dependents in the platform.

Check `src/__tests__/unit/modules.test.ts`, `src/__tests__/scenario/customProfiles.test.ts` and configuration invariants. See [integration contracts](../../docs/INTEGRATION.md) for revisioned profiles/overrides and host-owned storage.
