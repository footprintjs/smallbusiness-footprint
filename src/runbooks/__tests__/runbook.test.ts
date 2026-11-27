import { FlowChartExecutor, type FlowchartCheckpoint } from 'footprintjs';
import { describe, expect, it, vi } from 'vitest';
import { createRunbookChart, type RunbookAction, type RunbookCheck, type RunbookDefinition } from '../../runbooks.js';

const definition: RunbookDefinition = {
  id: 'test-runbook', revision: '1', guidanceKey: 'runbook.test',
  checks: ['eligible'], action: 'repair',
};
const target = { tenantId: 'sample-tenant', incidentId: 'case-42', subjectId: 'item-7' };

function fixture(read: RunbookCheck = async () => 'pass') {
  const check = vi.fn(read);
  const receipts = new Map<string, string>();
  const apply = vi.fn<RunbookAction>(async (subject, key) => {
    if (!receipts.has(key)) receipts.set(key, subject.subjectId);
    return 'applied';
  });
  const other = vi.fn<RunbookAction>();
  const ports = { checks: new Map([['eligible', check]]), actions: new Map([['repair', apply], ['other', other]]) };
  const executor = (book = definition, subject = target) =>
    new FlowChartExecutor(createRunbookChart(book, subject, ports));
  async function pause(): Promise<FlowchartCheckpoint> {
    const run = executor();
    await run.run();
    expect(run.getCheckpoint()?.pausedBy).toBe('interrupt');
    return JSON.parse(JSON.stringify(run.getCheckpoint()));
  }
  return { check, apply, other, ports, receipts, executor, pause };
}

describe('owner runbook chart', () => {
  it('runs only declared reads before the native approval checkpoint', async () => {
    const f = fixture();
    const checkpoint = await f.pause();
    expect(f.check.mock.calls).toEqual([[target]]);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.other).not.toHaveBeenCalled();
    expect(checkpoint.sharedState.checks).toEqual([{ id: 'eligible', result: 'pass' }]);
    expect(JSON.stringify(checkpoint)).not.toContain(target.subjectId);
  });

  it('resumes in another executor and records the one scoped action', async () => {
    const f = fixture();
    const checkpoint = await f.pause();
    const run = f.executor();
    await run.resume(checkpoint, 'approve');
    expect(run.getSnapshot().sharedState).toMatchObject({ decision: 'approve', outcome: 'applied' });
    expect(f.check).toHaveBeenCalledTimes(1);
    expect(f.apply).toHaveBeenCalledExactlyOnceWith(target, expect.any(String));
    expect(f.other).not.toHaveBeenCalled();
  });

  it.each(['decline', true, null, { decision: 'approve', action: 'other' }])(
    'resumes without writing for %j', async answer => {
      const f = fixture();
      const checkpoint = await f.pause();
      const run = f.executor();
      await run.resume(checkpoint, answer);
      expect(run.getSnapshot().sharedState.outcome).toBe(answer === 'decline' ? 'declined' : 'invalid-decision');
      expect(f.apply).not.toHaveBeenCalled();
      expect(f.other).not.toHaveBeenCalled();
    },
  );

  it.each(['blocked', 'unknown', 'malformed'] as const)('holds on a %s read', async result => {
    const f = fixture(async () => result as 'unknown');
    const run = f.executor();
    await run.run();
    expect(run.getCheckpoint()).toBeUndefined();
    expect(run.getSnapshot().sharedState.outcome).toBe(result === 'blocked' ? 'checks-blocked' : 'checks-unknown');
    expect(f.apply).not.toHaveBeenCalled();
  });

  it('preserves uncertainty and keeps a rejected read private', async () => {
    const f = fixture(async () => { throw Error('private fixture details'); });
    const run = f.executor();
    await run.run();
    expect(run.getSnapshot().sharedState.outcome).toBe('checks-unknown');
    expect(JSON.stringify(run.getSnapshot())).not.toContain('private fixture details');
    expect(f.apply).not.toHaveBeenCalled();
  });

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

  it.each([
    [definition, { ...target, subjectId: 'different' }],
    [definition, { ...target, incidentId: 'different' }],
    [definition, { ...target, tenantId: 'different' }],
    [{ ...definition, action: 'other' }, target],
    [{ ...definition, revision: '2' }, target],
    [{ ...definition, guidanceKey: 'different' }, target],
  ] as const)('rejects an approval restored against a changed binding', async (book, subject) => {
    const f = fixture();
    const checkpoint = await f.pause();
    await expect(f.executor(book, subject).resume(checkpoint, 'approve')).rejects.toThrow();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.other).not.toHaveBeenCalled();
  });

  it('captures the declared action, target and ports before a mutable caller changes them', async () => {
    const f = fixture();
    const book = { ...definition };
    const subject = { ...target };
    const run = f.executor(book, subject);
    await run.run();
    const checkpoint = run.getCheckpoint()!;
    book.action = 'other';
    subject.subjectId = 'other';
    f.ports.actions.set('repair', f.other);
    await run.resume(checkpoint, 'approve');
    expect(f.apply).toHaveBeenCalledExactlyOnceWith(target, expect.any(String));
    expect(f.other).not.toHaveBeenCalled();
  });
});
