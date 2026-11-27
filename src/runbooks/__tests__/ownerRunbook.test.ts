import { describe, expect, it } from 'vitest';
import { fixture, subject } from './fixture.js';

describe('saved owner approval', () => {
  it('applies the recorded proposal once across simultaneous resumes of the same saved checkpoint', async () => {
    const f = fixture(),
      cp = await f.pause();
    const resume = async () => {
      const run = f.runner();
      await run.resume(structuredClone(cp), 'approve');
      return run.getSnapshot().sharedState?.outcome;
    };
    expect((await Promise.all([resume(), resume()])).sort()).toEqual([
      'already-applied',
      'applied',
    ]);
    expect(f.effects()).toBe(1);
    const calls = f.ports.applyOnce.mock.calls.map(([command]) => command);
    expect(calls[0]).toMatchObject({
      ...subject,
      finding: 'unpaid',
      action: 'release-stock',
    });
    expect(calls[0]).toEqual(calls[1]);
    expect(f.ports.inspect).toHaveBeenCalledTimes(1);
  });
});
