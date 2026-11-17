# Source entry points

Repository guide only. Public consumers import `smallbusiness-footprint` and its declared subpaths, not private TypeScript files. Start with `businessPlatform.ts` for scope/action preparation, `flows/` for composed wrappers, `operations.ts` plus the typed ports for host dispatch, and `aftersales/runtime.ts` for cancellation/return/refund control.

`metadata.ts` selects declarations without the executor. Configuration lives in `modules/`, `profiles/`, `capabilities/`, `actions/`, `terminology/` and `overrides/`. Provider evidence and local diagnostics are opt-in in `diagnostics/` and `testing/`. Tests live in `__tests__/` and are not production source-pack inputs.

Use [the source map](../docs/SOURCE-MAP.md) for task-to-file and test navigation. Follow real controls and source identities; names and wrapper descriptions do not reveal an opaque host operation.
