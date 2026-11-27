import { describe, expect, it } from 'vitest';
import type { RunbookCommand } from '../../../runbooks.js';
import { answer, fixture, subject } from '../../__tests__/fixture.js';

describe('apply', () => {
  it('holds a previously valid proposal when the authoritative condition changes', async () => {
    const f = fixture(),
      cp = await f.pause();
    f.change('paid');
    const run = f.runner();
    await run.resume(cp, answer());
    expect(run.getSnapshot().sharedState?.outcome).toBe('stale');
    expect(f.effects()).toBe(0);
  });
  it('leaves an interrupted effect unknown and can reconcile it with the same key', async () => {
    const f = fixture(),
      cp = await f.pause();
    const original = f.ports.applyOnce.getMockImplementation()!;
    f.ports.applyOnce.mockImplementationOnce(
      async (command: RunbookCommand) => {
        await original(command);
        throw new Error('private provider reply');
      }
    );
    const first = f.runner();
    await first.resume(cp, answer());
    expect(first.getSnapshot().sharedState?.outcome).toBe('unknown');
    expect(JSON.stringify(first.getSnapshot())).not.toContain(
      'private provider reply'
    );
    const retry = f.runner();
    await retry.resume(cp, answer());
    expect(retry.getSnapshot().sharedState?.outcome).toBe('already-applied');
    expect(f.effects()).toBe(1);
  });
  it('refuses a new proposal for the same incident after another action committed', async () => {
    const f = fixture();
    const first = f.runner();
    await first.resume(await f.pause(), answer());
    f.change('paid');
    const next = f.runner();
    await next.run();
    const resumed = f.runner();
    await resumed.resume(next.getCheckpoint()!, answer('approve', 'confirm-order'));
    expect(resumed.getSnapshot().sharedState?.outcome).toBe('conflict');
    expect(f.effects()).toBe(1);
  });
  it('dispatches only the action mapped to the observed positive finding', async () => {
    const f = fixture();
    f.change('paid');
    const cp = await f.pause();
    const run = f.runner();
    await run.resume(cp, answer('approve', 'confirm-order'));
    expect(f.ports.applyOnce).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        ...subject,
        finding: 'paid',
        action: 'confirm-order',
      })
    );
    expect(run.getSnapshot().sharedState?.outcome).toBe('applied');
  });
});
