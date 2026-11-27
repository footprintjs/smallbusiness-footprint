import { describe, expect, it } from 'vitest';
import { fixture } from '../../__tests__/fixture.js';

describe('required check gate', () => {
  it.each(['blocked', 'unknown', 'malformed'] as const)('holds on a %s read', async result => {
    const f = fixture(async () => result as 'unknown');
    const run = f.executor();
    await run.run();
    expect(run.getCheckpoint()).toBeUndefined();
    expect(run.getSnapshot().sharedState.outcome).toBe(result === 'blocked' ? 'checks-blocked' : 'checks-unknown');
    expect(f.apply).not.toHaveBeenCalled();
  });
});
