import { describe, expect, it } from 'vitest';
import { fixture, target } from '../../__tests__/fixture.js';

describe('read-only checks', () => {
  it('runs only declared reads before the native approval checkpoint', async () => {
    const f = fixture();
    const checkpoint = await f.pause();
    expect(f.check.mock.calls).toEqual([[target]]);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.other).not.toHaveBeenCalled();
    expect(checkpoint.sharedState.checks).toEqual([{ id: 'eligible', result: 'pass' }]);
    expect(JSON.stringify(checkpoint)).not.toContain(target.subjectId);
  });

  it('preserves uncertainty and keeps a rejected read private', async () => {
    const f = fixture(async () => { throw Error('private fixture details'); });
    const run = f.executor();
    await run.run();
    expect(run.getSnapshot().sharedState.outcome).toBe('checks-unknown');
    expect(JSON.stringify(run.getSnapshot())).not.toContain('private fixture details');
    expect(f.apply).not.toHaveBeenCalled();
  });
});
