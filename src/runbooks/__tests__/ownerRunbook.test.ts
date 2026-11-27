import { describe, expect, it, vi } from 'vitest';
import { fixture, subject } from './fixture.js';

describe('saved owner approval', () => {
  it('keeps the bound action adapter when the registry changes during approval', async () => {
    const f = fixture();
    const cp = await f.pause();
    const original = f.ports.applyOnce;
    const replacement = vi.fn<typeof original>().mockResolvedValue('applied');
    f.ports.applyOnce = replacement;

    const run = f.runner();
    await run.resume(cp, 'approve');
    expect(original).toHaveBeenCalledOnce();
    expect(replacement).not.toHaveBeenCalled();
    expect(f.effects()).toBe(1);
  });

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
