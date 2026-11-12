# Migration to 1.0.0

This is an unreleased source candidate. Source verification and publication approval are separate: the immutable approval record is unchanged and cannot publish these bytes.

## Runtime requirements

Use Node 24.15–24.x with exactly FootPrint 12.0.0 and Foottrace 1.15.0. Rebuild consumers and handle the current native `answered` attempt decision. Blueprint still reads saved `succeeded` decisions as their original stored label; it does not relabel them or infer stronger evidence.

## Evidence boundaries

Native commit records pass to Foottrace’s shared cause graph, including partial-write predecessors. These links show recorded writes and reads, not which JavaScript expression computed a value. A retained initial value with no recorded writer does not gain an invented source. Missing or incomplete capture remains unknown. A completed boundary call does not prove a provider’s internal root cause, physical retry count, cancellation or durable storage.

Rich `getSnapshot()` recordings are consumed through their actual native contracts. This migration does not claim every snapshot tree is an array or accept a minimal execution chain as a complete diagnostic recording. Existing recording defaults, redaction, optional capture and authoritative business acknowledgements are unchanged. Saved failed-run closure admission is a separate capability; a failed snapshot alone is not complete evidence.

## Blueprint dependency order

This candidate requires Blueprint 1.0.0. The development-only workspace override uses a built Blueprint source-candidate archive, excluded from the public package. Existing archives are retained. The packed public manifest uses `footprint-blueprint: 1.0.0`; publish the reviewed Blueprint first before installing this package from npm. Do not substitute the local source alias used by focused tests for packed-package verification.

No new capture options are added. Applications still opt into the existing capture hooks and supply their own storage and authoritative provider ports.
