# Read actual saved after-sales causes by scope

**Unreleased working candidate.** Import the optional `smallbusiness-footprint/diagnostics/cause` entry from this checkout or its newly built candidate. It exports `recordedAfterSalesCauseScopes`, `createAfterSalesCauseReader` and canonical `CauseRecordingError`. It executes no service, repository, provider, retry or repair.

```js
import { createAfterSalesCauseReader }
  from 'smallbusiness-footprint/diagnostics/cause';

// The host loads and authorizes an actual saved AfterSalesTrace.
export function openSavedAfterSalesTrace(savedTrace) {
  return createAfterSalesCauseReader(savedTrace);
}
```

The reader exposes `nodes`, `scopes`, `catalog()` and `explain(nodeId)`. Select an actual admitted catalog node or a validated qualified child ID returned by the canonical reader, not an ID invented from a display name. Keep confidence, gaps and scope addresses visible. An ancestor is not automatically a provider-internal root cause.

## Preserve the native record

The adapter admits saved inert data iteratively and projects the public cause reader's expected **per-scope metadata**. It never flattens or fabricates a `nativeSnapshot`. Root/mounted histories retain actual commit order, runtime IDs, write values, read prefixes and log addresses. Readable/execution-key aliases are deduplicated by their actual native address, with conflicting aliases refused. An actual mount seed cannot recursively mount itself again.

`reads` is sparse: only a real retained stage-read frame supplies a stage entry. A missing frame does not erase another stage's known reads. Per-write `readKeys` stay unchanged in the commit bundle; they support canonical write attribution but do not establish full stage-read coverage. Missing collection stays incomplete, not an empty observed read set.

Captured controls/attention retain run binding and fact references. Wrong-run data, incompatible scope ownership, corrupt references, future controls and ordinary stages presented as mounts/control decisions are refused. A missing native decision frame is a gap, not an invented control edge. Cross-scope control ancestry remains an explicit canonical scope boundary; global presence does not make a local scope complete. The host still owns authenticity and access; consistent IDs are not signatures.

## Finite admission and query limits

Projection admits at most 32 actual scopes and 1024 total commits. Iterative inert-data limits are 200,000 scheduled values, depth 2048, 8,388,608 characters across keys/string values, arrays of at most 10,000 entries and individual strings of at most 65,536 characters. Source trees are separately bounded at 2048 observed nodes. Accessors, cycles, unsupported prototypes and prototype keys are refused without reading a getter. These ceilings are not permission to copy private inputs into state.

Reader defaults are 32 scopes, 1024 commits and 2048 catalog nodes. Optional limits can lower these; `timeoutMs` defaults to 1500 and is bounded at 5000. Canonical per-query traversal ceilings still apply and report partial/limited answers. Oversized admission/discovery throws `CAUSE_RECORD_LIMIT`; malformed recording/ownership throws `CAUSE_RECORD_INVALID`. No dependency cap is patched and no oversized source is silently truncated.

These bounds support actual legal 14- and 100-item saved request/refund/restock fixtures and their latest loop-fact data edges. They do not claim every arbitrary record or future workflow fits. Tests also cover opposite approval facts, missing reads/capture/control, private-value absence and malicious input refusals.

## Keep provider uncertainty separate

The pinned Blueprint `diagnoseFailureRecording` entry validates a root-only native shape; it cannot simply be treated as a mounted after-sales reader. This adapter does not rewrite a nested trace into a fake root to make that API accept it. Use the scoped reader for native ancestry and retain original `boundaryDiagnostics` logical/physical evidence and unknown-effect assertions separately. Do not infer that a payment applied from a successful read or control branch.

A missing capture, failed prefix, uncommitted fact or unresolved scope keeps the answer incomplete. Provider acknowledgement and diagnostic completeness are separate. Unknown refunds retain the original reservation/key and use host reconciliation; a cause query grants no permission for another write. See [after-sales](AFTERSALES.md), [provider evidence](PROVIDER-EVIDENCE.md) and [the agent guide](AGENT-GUIDE.md).
