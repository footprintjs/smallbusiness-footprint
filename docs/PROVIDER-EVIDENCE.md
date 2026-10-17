# Commerce provider evidence

Use `smallbusiness-footprint/diagnostics/runtime` only where the host already owns a real database, payment or shipping call. It is a thin wrapper over `footprint-blueprint/diagnostics/runtime`; the existing normalization entry and browser metadata entry do not import it.

```js
import { createCommerceBoundaryRecorder } from 'smallbusiness-footprint/diagnostics/runtime';

const recorder = createCommerceBoundaryRecorder();
executor.setRedactionPolicy({ keys: ['idempotencyKey', 'authorization', 'token'] });
executor.attachFlowRecorder(recorder.flowRecorder);

// Inside the actual request's flow, before an application wrapper hides the raw classification:
await recorder.run(scope, {
  system: 'database', operation: 'read-order', target: 'database.read', effect: 'read',
  timeoutMs: 1500,
}, context => readOrderWithAdapterEvidence(context));
```

`readOrderWithAdapterEvidence` is host adapter code, not a built-in SDK option. It forwards `context.signal`, the deadline and remaining budget to the provider. The wrapper makes one logical call with one attempt; it does not add a provider retry loop. The provider's existing retry/idempotency policy stays authoritative. Writes use the host's existing durable idempotency key; diagnostic state never stores that key.

## What an adapter can report

When an adapter genuinely observes a transport attempt, it can call:

```js
context.observePhysical({
  source: 'my-sdk-adapter', phase: 'response-complete', outcome: 'failed',
  startedAt, durationMs, attempt: actualAttemptIndex,
  // Include a known maximum only when the SDK actually supplies it.
  httpStatus: actualNumericStatus, error: privateProviderError,
});
```

The callback normalizes the private error and binds its safe projection to real `AttemptContext.observed` and `onAttempt` records. It does not copy the error message, provider request, headers, customer payload or arbitrary request reference. Never synthesize timestamps, counts, outcomes or native IDs when a callback is unavailable. Headers and dispatch timings are distinct from a completed response body. When a real adapter knows it could not observe additional dispatches or a body completion, it calls `context.markIncomplete('multiple-dispatches')`, `response-unconsumed` or `observation-unavailable`. This counts a coverage notice, not a guessed number of attempts. Missing or late reports are partial coverage; they do not prove zero network requests or zero retries. SDK retry decisions stay unknown unless independently established; the engine's interpretation of an observed record is not the SDK's policy decision.

The commerce normalizer preserves rejecting HTTP 4xx/5xx responses before transport hints. Successful headers do not disprove a later response-body timeout or connection reset. A trusted host classifier takes priority. AWS-shaped authorization/throttle names on database, configuration, storage and email adapters, bounded transport codes and payment SDK error classes can classify a failure without inventing an HTTP status. A connection error, timeout, 503 or authorization failure does not establish that a provider, region or entire database is down. Custom vendors can supply `normalizeError` to `createCommerceBoundaryRecorder`, or use Blueprint's neutral recorder directly.

## Storage and privacy

After execution, join `recorder.snapshot()` with the **same executor's** redacted native snapshot:

```js
const collected = recorder.snapshot();
const record = {
  schemaVersion: 1, storeId, runId: nativeSnapshot.runId, flowId, nativeSnapshot,
  boundaryEvidence: collected.boundaryEvidence,
  physicalEvidence: collected.physicalEvidence,
  coverage: collected.coverage,
  diagnostics: { ...collected.diagnostics, persistence: 'stored' },
};
// The host may claim "stored" only after its sink acknowledges the write.
// Persist/reload this envelope through a scoped host storage port before diagnosis.
```

The recorder owns no storage and makes no durability claim. A failed sink must be reported separately and must not replace the original business outcome. Late callbacks cannot mutate an earlier detached snapshot. The row cap is shared across logical and physical evidence; dropped entries remain explicit in coverage.

Completed provider exceptions preserve their original identity so existing repositories can map conditional-write conflicts and domain failures. This does not clear an unknown write effect: a final rejected response can follow an earlier ambiguous SDK transport attempt. Actual native timer/abort guards retain their own uncertainty semantics. Catch or map private provider errors **before they escape a parent flow stage**; the recorder sanitizes its own native call, not arbitrary error handling elsewhere in the application. Keep customer inputs and provider responses outside ordinary flow state and apply the host's existing redaction policy.

## After-sales flows

`createAfterSalesService` supports an optional host `withBoundaryScope(port, work)` dependency. The host installs `port.run(operation, callback)` in its own asynchronous request context and invokes `work`. Existing raw provider adapters then use that port. Every request/action run has a separate recorder, and each stage's port is bound to its actual native scope. No process-global request context or vendor SDK is added to this library.

When the hook is installed, `AfterSalesTrace.boundaryDiagnostics` supplies the same optional collector snapshot beside that trace's existing native snapshot. Without the hook, after-sales execution and the trace shape remain unchanged. Existing `executionOptions` continue to carry the trusted caller's deadline/cancellation; tracing introduces no business retries, refund decisions or timeout policy.

## Payment uncertainty and reconciliation

A write timeout, cancellation or ambiguous provider failure remains `unknown`; do not blindly issue the payment again. Query the provider through an independent, idempotent read using the original operation identity. A successful read transport says the query completed, not that a charge was applied. An authoritative domain payment receipt is a separate business fact; the collector never rewrites the original uncertain physical attempt. The host still owns settlement, stock reservations, refunds and recovery.

## Local validation

```js
import { runBoundaryEvidenceScenario } from 'smallbusiness-footprint/testing';
import { diagnoseFailureRecording } from 'footprint-blueprint/diagnostics';

const { record, observed } = await runBoundaryEvidenceScenario('boundary-db-recovered');
const diagnosis = diagnoseFailureRecording(JSON.parse(JSON.stringify(record)));
```

The 12 boundary scenarios use actual Blueprint/FootprintJS execution and local SDK doubles. They cover database auth, throttling and server responses; multiple transport attempts inside one call; ambiguous payment writes and separate reads; caller cancellation and read timeout; late callbacks and partial evidence. `observed` is an independent test harness result and is never a diagnosis input. All original 27 local scenarios remain available. These local results do not claim a live provider or cloud was exercised.



## Optional after-sales native record storage

After-sales accepts a host-owned Foottrace sink factory. Each execution gets a fresh diagnostic `recordId`; this is separate from the native run ID and every order, case, payment and idempotency key. The immutable factory request contains only `flowId` and `recordId`.

```ts
const service = createAfterSalesService({
  // Existing repository, payments, authorizer and store configuration.
  recordSink: ({ flowId, recordId }) => hostRecordStore.sink({ flowId, recordId }),
  recordSinkFlushTimeoutMs: 250,
  onTrace: trace => hostTraceStore.save(trace),
});
```

The factory returns the native `RecordSink` interface from `foottrace/write`, or `undefined` to disable recording for that execution. An undefined sink leaves the trace shape unchanged. A throwing factory or malformed adapter produces `trace.recording.status: 'unavailable'`; it does not fail the business action. A valid sink produces `trace.recording` with its `recordId`, status `attached` and the factual final `{done, failed, pending}` flush result. `nativeSnapshot.sink` retains the engine's entry/loss counters. The locator and an attached sink do not prove durable delivery.

The real executor hands the sink each redacted opened/commit/note/closed entry as it lands, including actual native log addresses. After-sales always sets native `onFailure: 'report'` and `flush: 'manual'`, then waits at most `recordSinkFlushTimeoutMs` for the final drain (default 250 ms, accepted range 0–2000). Diagnostics never create a business retry or change an acknowledged refund. The host supplies storage adapters, queue limits and durable acknowledgements; no cloud SDK is imported here. A pending drain keeps running after the wait ends and does not prove that its remaining entries were stored before a hard process kill. Later asynchronous entry failures may settle after the final snapshot.

To read a recovered prefix, use Foottrace's existing `readStoredRecord(entries)`. A root with no covering close is `complete: false`, whether the process crashed or is still running. Missing entries remain gaps. After-sales does not synthesize a successful close, a provider outcome or a retry decision. The app must authorize record reads and bind the locator to its store and native run; customer requests must never choose a storage key.

Raw sink exception text is selected by the native `recordSinkError` redaction policy before it can enter loss diagnostics. Business inputs and provider payloads remain in private request closures as before.


`BusinessPlatformConfig` and `createPlatformForRequest` also forward `recordSink` and `recordSinkFlushTimeoutMs` for direct `executeAction` calls to Blueprint. That factory receives `{actionId, recordId}` and has the same native report/manual behavior. It does not automatically instrument the separate `executeServiceFlow` executor; hosts must not claim durable prefixes for that mode from this direct-action setting. For remote storage, set the native final drain longer than the adapter's own I/O/flush deadline so its cancellation can settle first.
