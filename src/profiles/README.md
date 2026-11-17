# Example business profiles

Repository guide. `businessProfiles.ts` declares the kids-boutique and chocolate-shop examples and converts registered profiles to business metadata. They are presets, not tenant deployments or authorization identities. Services/theme metadata describe defaults, not a published storefront snapshot.

Custom profile arrays replace built-ins; spread defaults to retain them. Register module dependencies and module-owned terminology consistently. Full scope and monotonic binding/override revisions are enforced by the surrounding platform/store contracts.

Check `src/__tests__/unit/profiles.test.ts`, `terminology.test.ts` and `src/__tests__/scenario/customProfiles.test.ts`. Do not hardcode a new customer's behavior as a profile-name branch when it belongs in a configured authoritative operation.
