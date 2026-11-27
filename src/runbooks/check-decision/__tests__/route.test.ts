import { expect, it } from 'vitest';
import { fixture } from '../../__tests__/fixture.js';

it('missing approval stops the action', async () => {
  const f = fixture();
  const cp = await f.pause();
  const run = f.runner();
  await run.resume(cp, 'APPROVE');
  expect(run.getSnapshot().sharedState?.outcome).toBe('invalid-decision');
  expect(f.ports.applyOnce).not.toHaveBeenCalled();
});
