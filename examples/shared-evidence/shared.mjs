import assert from 'node:assert/strict';
import { validateExecutionEvidence } from '@footprint/actions/evidence';

const [major, minor] = process.versions.node.split('.').map(Number);
assert.ok(major === 24 && minor >= 15, 'Use Node 24.15 or newer in the 24 series.');

export { assert };

export function checkEvidence(evidence) {
  assert.ok(evidence, 'The local execution must produce a receipt.');
  assert.equal(validateExecutionEvidence(evidence).valid, true);
  assert.equal(evidence.coverage.values, 'metadata-only');
  assert.equal(evidence.coverage.nativeRecording, 'provided');
  assert.equal(evidence.coverage.droppedEntries, 0);
  assert.equal(evidence.actorId, undefined);
  assert.equal(evidence.request, undefined);
  assert.ok(Object.isFrozen(evidence) && Object.isFrozen(evidence.effects) && Object.isFrozen(evidence.observations));
}

export function checkPrivacy(recording, ...privateValues) {
  const serialized = JSON.stringify(recording);
  for (const value of privateValues) assert.equal(serialized.includes(value), false, 'Private application data entered the recording.');
}

export function summarize(label, recording, extra = {}) {
  const trace = recording.executionTrace ?? recording;
  const evidence = recording.evidence ?? trace.evidence;
  return {
    scenario: label,
    ...extra,
    nativeStages: trace.stageMetrics?.map(stage => stage.stageName)
      ?? trace.snapshot?.commitLog.map(commit => commit.stageId),
    evidence,
  };
}
