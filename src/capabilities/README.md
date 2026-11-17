# Capability contracts

Repository guide. `businessCapabilities.ts` declares what an application can request; adapters select how to invoke a configured action. A capability name/description is not runtime implementation, a provider acknowledgement or proof that an action is authorized.

When adding a capability, trace its adapter mapping, action schema, required modules/permissions and actual configured operation. Test the mapping and operation boundary together using `src/__tests__/unit/adapters.test.ts` and the relevant scenario. The browser metadata entry exports declarations without executing providers.
