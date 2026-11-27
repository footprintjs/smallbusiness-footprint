import { describe, expect, it } from 'vitest';
import { definition, fixture, target } from './fixture.js';

describe('native runbook chart', () => {
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

describe('runbook definition', () => {
  it.each([
    { checks: [] }, { checks: ['eligible', 'eligible'] }, { checks: ['missing'] },
    { action: 'missing' }, { revision: '' },
  ])('rejects an unusable definition before any port runs', fields => {
    const f = fixture();
    expect(() => f.executor({ ...definition, ...fields })).toThrow();
    expect(f.check).not.toHaveBeenCalled();
    expect(f.apply).not.toHaveBeenCalled();
  });

  it('keeps independent incidents, tenants and subjects in distinct operation keys', async () => {
    const f = fixture();
    for (const subject of [target, { ...target, subjectId: 'next' }, { ...target, tenantId: 'next' }, { ...target, incidentId: 'next' }]) {
      const run = f.executor(definition, subject);
      await run.run();
      await run.resume(run.getCheckpoint()!, 'approve');
    }
    expect(f.receipts.size).toBe(4);
  });
});
