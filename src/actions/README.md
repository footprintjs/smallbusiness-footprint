# Action declarations

Repository guide. `businessActions.ts` owns stable IDs, strict command schemas, required modules and permissions. These declarations select/validate an operation; they do not implement it. Execution is wired by `businessPlatform.ts` and `operations.ts` outside this folder.

When changing an action, check its matching typed port, configured adapter and scenario together. Keep trusted actor/scope outside command input and private values outside recorded summaries. Use `src/__tests__/unit/actions.test.ts`, `src/__tests__/security/validation.test.ts` and the matching scenario. A new schema field alone does not enforce a host's proof-binding or business policy.
