import { expect, it } from 'vitest';
import { fixture } from '../../__tests__/fixture.js';

it('unrecognized findings stay unresolved', async () => {
  const f = fixture();
  f.change('constructor');
  const run = f.runner();
  await run.run();
  expect(run.isPaused()).toBe(false);
  expect(run.getSnapshot().sharedState?.outcome).toBe('unresolved');
  expect(f.ports.applyOnce).not.toHaveBeenCalled();
});
