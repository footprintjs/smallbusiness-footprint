import { describe, expect, it } from 'vitest';
import { definition, fixture } from '../../__tests__/fixture.js';
import { vi } from 'vitest';

describe('unmet checks', () => {
  it('retains an unknown read alongside a separate known blocker', async () => {
    const f = fixture(async () => 'unknown');
    f.ports.checks.set('other', vi.fn(async () => 'blocked' as const));
    const run = f.executor({ ...definition, checks: ['eligible', 'other'] });
    await run.run();
    expect(run.getSnapshot().sharedState).toMatchObject({
      checks: [{ id: 'eligible', result: 'unknown' }, { id: 'other', result: 'blocked' }],
      outcome: 'checks-blocked',
    });
    expect(run.getCheckpoint()).toBeUndefined();
    expect(f.apply).not.toHaveBeenCalled();
  });
});
