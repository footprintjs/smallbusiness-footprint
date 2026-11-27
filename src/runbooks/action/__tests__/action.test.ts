import { describe, expect, it } from 'vitest';
import { fixture, target } from '../../__tests__/fixture.js';

describe('authoritative runbook action', () => {
  it('keeps the same operation key after a lost acknowledgement and concurrent resumes', async () => {
    const f = fixture();
    f.apply.mockImplementationOnce(async (subject, key) => {
      f.receipts.set(key, subject.subjectId);
      throw Error('private fixture details');
    });
    const checkpoint = await f.pause();
    const first = f.executor();
    await first.resume(checkpoint, 'approve');
    expect(first.getSnapshot().sharedState.outcome).toBe('action-unknown');
    expect(JSON.stringify(first.getSnapshot())).not.toContain('private fixture details');
    const retries = [f.executor(), f.executor()];
    await Promise.all(retries.map(run => run.resume(checkpoint, 'approve')));
    expect(retries.map(run => run.getSnapshot().sharedState.outcome)).toEqual(['applied', 'applied']);
    expect(f.apply).toHaveBeenCalledTimes(3);
    expect([...f.receipts.values()]).toEqual([target.subjectId]);
  });

  it.each([['ineligible', 'ineligible'], ['unknown', 'action-unknown'], ['unexpected', 'action-unknown']])(
    'records the actual adapter acknowledgement %s', async (ack, outcome) => {
      const f = fixture();
      f.apply.mockResolvedValueOnce(ack as 'unknown');
      const checkpoint = await f.pause();
      const run = f.executor();
      await run.resume(checkpoint, 'approve');
      expect(run.getSnapshot().sharedState.outcome).toBe(outcome);
    },
  );
});
