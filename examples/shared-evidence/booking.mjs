/** Reduced booking example based on the booking app's integration pattern.
 * Actual FootPrint.js and SQLite execution; no SchoolFootprint dispatch or UI.
 * Sample data is in memory. Authentication is outside this reduced workflow.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { flowChart, FlowChartExecutor } from 'footprintjs';
import { createEvidenceCollector } from '@footprint/actions/evidence';
import { assert, checkEvidence, checkPrivacy, summarize } from './shared.mjs';

const PRIVATE_OWNER = 'private-staff@example.test';
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE bookings (
  id TEXT PRIMARY KEY, instructor TEXT NOT NULL, day TEXT NOT NULL,
  start INTEGER NOT NULL, end INTEGER NOT NULL,
  status TEXT NOT NULL, owner TEXT NOT NULL);
  CREATE TABLE runs (id TEXT PRIMARY KEY, booking_id TEXT, action TEXT NOT NULL, receipt TEXT NOT NULL);`);

async function record(actionId, build, bookingId) {
  const evidence = createEvidenceCollector(); // Default: metadata only, no row/request values.
  const runId = randomUUID(); // Real application audit ID, distinct from the engine run ID.
  const chart = build(evidence);
  const executor = new FlowChartExecutor(chart, { readTracking: 'full', writeProvenance: 'reads-prefix' });
  executor.enableNarrative();
  let recording;
  db.exec('BEGIN IMMEDIATE');
  try {
    await executor.run();
    const snapshot = executor.getSnapshot({ redact: true });
    const state = snapshot.sharedState;
    const receipt = evidence.finalize({
      runId, engineRunId: snapshot.runId, actionId, nativeRecording: true,
      outcome: state.status === 'conflict'
        ? { status: 'rejected', code: 'BOOKING_CONFLICT' }
        : { status: 'succeeded' },
    });
    recording = { snapshot, evidence: receipt, narrative: executor.getNarrativeEntries() };
    // Optional evidence cannot turn an applied business write into a rollback.
    db.prepare('INSERT INTO runs VALUES(?,?,?,?)').run(runId, state.bookingId ?? bookingId ?? null, actionId, JSON.stringify(receipt ?? null));
    // Receipt phases describe SQL applied before this enclosing COMMIT completes.
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  // Quickstart verification runs after acknowledgement, outside its transaction.
  checkEvidence(recording.evidence);
  checkPrivacy(recording, PRIVATE_OWNER);
  return recording;
}

function create(input) {
  // This example admits only known sample identifiers and valid same-day minutes.
  assert.equal(input.instructor, 'instructor-1');
  assert.equal(input.day, '2030-02-08');
  assert.ok(Number.isInteger(input.start) && Number.isInteger(input.end) && input.start >= 0 && input.start < input.end && input.end <= 1440);
  return record('booking.create', evidence => flowChart('Read actual overlaps', scope => {
    scope.request = { ...input }; // Only the selected non-private sample fields enter native state.
    const rows = db.prepare("SELECT id FROM bookings WHERE status='confirmed' AND instructor=? AND day=? AND start < ? AND end > ? ORDER BY id")
      .all(input.instructor, input.day, input.end, input.start);
    scope.blockerIds = rows.map(row => row.id);
    evidence.observe({ kind: 'booking.overlap-query', operation: 'bookings.select-overlaps',
      recordIds: scope.blockerIds, parameters: input, data: rows }); // Payload omitted by default.
  }, 'find-overlaps', { description: 'Read confirmed intervals that overlap this requested instructor slot.' })
    .addDeciderFunction('Choose booking outcome', scope => scope.blockerIds.length ? 'reject-overlap' : 'insert-booking', 'check-overlap')
    .addFunctionBranch('reject-overlap', 'Reject conflicting booking', scope => { scope.status = 'conflict'; }, 'A business rejection completes its native workflow normally.')
    .addFunctionBranch('insert-booking', 'Insert confirmed booking', scope => {
      const request = scope.request;
      const id = randomUUID();
      const changed = Number(db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?)')
        .run(id, request.instructor, request.day, request.start, request.end, 'confirmed', PRIVATE_OWNER).changes);
      assert.equal(changed, 1);
      evidence.effect({ kind: 'booking.persistence', operation: 'bookings.insert', phase: 'applied', count: changed, recordIds: [id] });
      scope.bookingId = id; scope.status = 'confirmed';
    }, 'Report the actual SQL row count inside the current transaction.')
    .end().build());
}

function cancel(id) {
  return record('booking.cancel', evidence => flowChart('Read booking before cancellation', scope => {
    const row = db.prepare("SELECT id,status FROM bookings WHERE id=? AND status='confirmed'").get(id);
    assert.ok(row, 'Require an existing confirmed booking.');
    evidence.observe({ kind: 'booking.before-cancel', operation: 'bookings.select-by-id', recordIds: [row.id], data: row });
    const creation = db.prepare("SELECT id FROM runs WHERE booking_id=? AND action='booking.create' ORDER BY rowid LIMIT 1").get(id);
    assert.ok(creation, 'Link only to an actual saved creation run.');
    evidence.link({ relation: 'related', runId: creation.id });
    scope.bookingId = row.id; scope.beforeStatus = row.status;
  }, 'read-booking')
    .addFunction('Cancel confirmed booking', scope => {
      const changed = Number(db.prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND status='confirmed'").run(scope.bookingId).changes);
      assert.equal(changed, 1);
      evidence.effect({ kind: 'booking.persistence', operation: 'bookings.cancel', phase: 'applied', count: changed, recordIds: [scope.bookingId] });
      scope.status = 'cancelled';
    }, 'cancel-booking', 'Apply one update; do not infer a completed transaction from a stage return.')
    .build(), id);
}

try {
  const first = await create({ instructor: 'instructor-1', day: '2030-02-08', start: 540, end: 600 });
  const conflict = await create({ instructor: 'instructor-1', day: '2030-02-08', start: 570, end: 630 });
  assert.equal(first.evidence.engineRunId, first.snapshot.runId);
  assert.equal(first.evidence.effects[0].count, 1);
  assert.equal(conflict.evidence.outcome.status, 'rejected');
  assert.deepEqual(conflict.evidence.effects, []);
  assert.deepEqual(conflict.evidence.observations[0].recordIds, [first.snapshot.sharedState.bookingId]);
  assert.equal(Number(db.prepare('SELECT count(*) AS count FROM bookings').get().count), 1);
  const cancelled = await cancel(first.snapshot.sharedState.bookingId);
  assert.deepEqual(cancelled.evidence.links, [{ relation: 'related', runId: first.evidence.runId }]);
  assert.equal(db.prepare('SELECT status FROM bookings WHERE id=?').get(first.snapshot.sharedState.bookingId).status, 'cancelled');
  assert.equal(cancelled.evidence.effects[0].phase, 'applied');
  assert.equal(cancelled.evidence.effects[0].count, 1);
  assert.equal(cancelled.evidence.engineRunId, cancelled.snapshot.runId);
  assert.equal(conflict.evidence.engineRunId, conflict.snapshot.runId);
  assert.equal(new Set([first, conflict, cancelled].map(run => run.snapshot.runId)).size, 3);
  console.log(JSON.stringify({
    example: 'Reduced booking app pattern: actual FootPrint.js + in-memory SQLite',
    assertions: 'passed',
    note: 'The overlap workflow completed normally; its business outcome was rejected. Applied effects describe SQL before the enclosing commit. Related history does not claim causation.',
    scenarios: [summarize('booking-created', first, { nativeWorkflow: 'completed' }),
      summarize('overlap-rejected', conflict, { nativeWorkflow: 'completed' }),
      summarize('booking-cancelled', cancelled, { nativeWorkflow: 'completed' })],
  }, null, 2));
} finally { db.close(); }
