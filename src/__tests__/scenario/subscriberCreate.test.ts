import { describe, expect, it, vi } from 'vitest';
import { createFixturePlatform, createMockRepository, fixtureContext } from '../helpers.js';
describe('private subscriber operations', () => {
  it('normalizes subscriber email in the repository call but excludes it and unsubscribe tokens from traces', async () => {
    const repo = createMockRepository(); const upsert = vi.spyOn(repo, 'upsertSubscriber'); const result = await createFixturePlatform({ repository: repo }).executeServiceFlow(fixtureContext, 'create-subscriber', { email: 'PRIVATE@EXAMPLE.TEST' });
    expect(result.status).toBe('success'); expect(upsert.mock.calls[0][0].email).toBe('private@example.test'); expect(result.result).toEqual({ status: 'ACTIVE' }); expect(JSON.stringify(result)).not.toContain('EXAMPLE'); expect(JSON.stringify(result)).not.toContain('unsubToken');
  });
  it.each([{}, { email: '' }, { email: 'not-an-email' }])('rejects malformed subscriber input %j', async input => { expect((await createFixturePlatform().executeServiceFlow(fixtureContext, 'create-subscriber', input)).status).toBe('error'); });
  it('routes unsubscribe to token validation rather than upsert', async () => { const repo = createMockRepository(); const upsert = vi.spyOn(repo, 'upsertSubscriber'); const unsub = vi.spyOn(repo, 'unsubscribeByToken'); const result = await createFixturePlatform({ repository: repo }).executeAction(fixtureContext, 'unsubscribe', { token: 'PRIVATE_TOKEN' }); expect(result.status).toBe('success'); expect(unsub).toHaveBeenCalledWith('PRIVATE_TOKEN'); expect(upsert).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain('PRIVATE_TOKEN'); });
});
