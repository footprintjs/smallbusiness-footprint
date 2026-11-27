import { describe, expect, it } from 'vitest';
import { fixture } from '../../__tests__/fixture.js';

describe('owner authorization', () => {
  it.each([true, null, { decision: 'approve', action: 'other' }])(
    'resumes without writing for %j', async answer => {
      const f = fixture();
      const checkpoint = await f.pause();
      const run = f.executor();
      await run.resume(checkpoint, answer);
      expect(run.getSnapshot().sharedState.outcome).toBe('invalid-decision');
      expect(f.apply).not.toHaveBeenCalled();
      expect(f.other).not.toHaveBeenCalled();
    },
  );
});
