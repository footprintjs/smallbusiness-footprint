import { describe, expect, it } from 'vitest';
import { fixture } from '../../__tests__/fixture.js';

describe('declined runbooks', () => {
  it('records the decline without invoking an action', async () => {
    const f = fixture();
    const checkpoint = await f.pause();
    const run = f.executor();
    await run.resume(checkpoint, 'decline');
    expect(run.getSnapshot().sharedState).toMatchObject({ decision: 'decline', outcome: 'declined' });
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.other).not.toHaveBeenCalled();
  });
});
