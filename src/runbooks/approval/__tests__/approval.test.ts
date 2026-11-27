import { describe, expect, it } from 'vitest';
import { FlowChartExecutor } from 'footprintjs';
import { ownerRunbookChart } from '../../../runbooks.js';
import { book, fixture, subject } from '../../__tests__/fixture.js';

describe('approval', () => {
  it.each([
    'decline',
    'yes',
    { decision: 'approve', action: 'different' },
    null,
  ])('rejects non-approval %j', async (decision) => {
    const f = fixture(),
      cp = await f.pause(),
      run = f.runner();
    await run.resume(cp, decision);
    expect(f.ports.applyOnce).not.toHaveBeenCalled();
    expect(run.getSnapshot().sharedState?.outcome).toBe(
      decision === 'decline' ? 'declined' : 'invalid-decision'
    );
  });
  it.each(['tenant', 'incident', 'subject', 'version', 'action'])(
    'refuses a checkpoint rebuilt with a different %s',
    async (field) => {
      const f = fixture(),
        cp = await f.pause();
      const nextBook =
        field === 'version'
          ? { ...book, version: '2' }
          : field === 'action'
          ? { ...book, actions: { unpaid: 'other-action' } }
          : book;
      const target = ['subject', 'tenant', 'incident'].includes(field)
        ? { ...subject, [field]: 'other' }
        : subject;
      const run = new FlowChartExecutor(
        ownerRunbookChart(nextBook, target, f.ports)
      );
      await run.resume(cp, 'approve');
      expect(f.ports.applyOnce).not.toHaveBeenCalled();
      expect(run.getSnapshot().sharedState?.outcome).toBe('scope-mismatch');
    }
  );
});
