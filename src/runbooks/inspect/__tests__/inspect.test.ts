import { describe, expect, it } from 'vitest';
import { fixture } from '../../__tests__/fixture.js';

describe('inspect', () => {
  it.each([undefined, 'unmapped'])(
    'withholds a proposal for %s',
    async (finding) => {
      const f = fixture();
      f.change(finding);
      const run = f.runner();
      await run.run();
      expect(run.isPaused()).toBe(false);
      expect(run.getSnapshot().sharedState).toMatchObject({
        outcome: 'unresolved',
        inspection: finding ? 'found' : 'none',
      });
      expect(f.ports.applyOnce).not.toHaveBeenCalled();
    }
  );
  it('keeps a failed read unresolved and excludes the provider reply from the record', async () => {
    const f = fixture();
    f.ports.inspect.mockRejectedValueOnce(new Error('private provider reply'));
    const run = f.runner();
    await run.run();
    expect(run.isPaused()).toBe(false);
    expect(run.getSnapshot().sharedState).toMatchObject({ outcome: 'unresolved', inspection: 'failed' });
    expect(JSON.stringify(run.getSnapshot())).not.toContain(
      'private provider reply'
    );
    expect(f.ports.applyOnce).not.toHaveBeenCalled();
  });
});
