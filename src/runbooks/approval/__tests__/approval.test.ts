import { describe, expect, it } from 'vitest';
import { FlowChartExecutor } from 'footprintjs';
import { ownerRunbookChart } from '../../../runbooks.js';
import { answer, book, fixture, subject } from '../../__tests__/fixture.js';

describe('approval', () => {
  it.each([
    'approve',
    'decline',
    true,
    undefined,
    'APPROVE',
    ' approve',
    ['approve'],
    new String('approve'),
    'yes',
    { decision: 'approve', action: 'different' },
    null,
  ])('rejects non-approval %j', async (decision) => {
    const f = fixture(),
      cp = await f.pause(),
      run = f.runner();
    await run.resume(cp, decision);
    expect(f.ports.applyOnce).not.toHaveBeenCalled();
    expect(run.getSnapshot().sharedState?.outcome).toBe('invalid-decision');
  });
  it.each([
    { incident: 'another-incident', action: 'release-stock' },
    { incident: subject.incident, action: 'confirm-order' },
  ])('refuses a scoped mismatch %j', async (binding) => {
    const f = fixture();
    const cp = await f.pause();
    const run = f.runner();
    await run.resume(cp, { decision: 'approve', ...binding });
    expect(run.getSnapshot().sharedState?.outcome).toBe('invalid-decision');
    expect(f.ports.applyOnce).not.toHaveBeenCalled();
  });
  it('refuses the original approval after the checkpoint proposal is changed to another valid action', async () => {
    const f = fixture();
    const cp = await f.pause();
    cp.sharedState.proposal = { ...cp.sharedState.proposal, finding: 'paid', action: 'confirm-order' };
    f.change('paid');
    const run = f.runner();
    await run.resume(cp, { decision: 'approve', incident: subject.incident, action: 'release-stock' });
    expect(run.getSnapshot().sharedState?.outcome).toBe('invalid-decision');
    expect(f.ports.applyOnce).not.toHaveBeenCalled();
  });

  it('overwrites an edited approval flag when the owner declines the scoped proposal', async () => {
    const f = fixture();
    const cp = await f.pause();
    cp.sharedState.approved = true;
    const run = f.runner();
    await run.resume(cp, answer('decline'));
    expect(run.getSnapshot().sharedState?.outcome).toBe('declined');
    expect(f.ports.applyOnce).not.toHaveBeenCalled();
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
      await run.resume(cp, answer());
      expect(f.ports.applyOnce).not.toHaveBeenCalled();
      expect(run.getSnapshot().sharedState?.outcome).toBe('scope-mismatch');
    }
  );
});
