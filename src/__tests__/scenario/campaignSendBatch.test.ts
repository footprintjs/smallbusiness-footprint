import { describe, it, expect, vi } from 'vitest';
import { createFixturePlatform, fixtureContext, createMockRepository } from '../helpers.js';

describe('campaign operations use real application acknowledgements', () => {
  it('creates only a draft through CRUD, with a default label', async () => {
    const repo = createMockRepository(); const create = vi.spyOn(repo, 'createCampaign');
    const result = await createFixturePlatform({ repository: repo }).executeServiceFlow(fixtureContext, 'create-campaign', { subject: 'Private campaign subject', data: { email: 'PRIVATE@example.test' } });
    expect(result.status).toBe('success'); expect(result.result).toMatchObject({ status: 'DRAFT' });
    expect(create.mock.calls[0][0].label).toBe('Untitled Campaign');
    expect(JSON.stringify(result)).not.toContain('PRIVATE@example.test'); expect(JSON.stringify(result)).not.toContain('Private campaign subject');
  });
  it.each(['schedule-campaign', 'send-campaign-batch'])('does not invent acknowledgement for unconfigured %s', async action => {
    const repo = createMockRepository(); const update = vi.spyOn(repo, 'updateCampaign'); const record = vi.spyOn(repo, 'recordSendResult');
    const result = await createFixturePlatform({ repository: repo }).executeServiceFlow(fixtureContext, action, { campaignId: 'campaign-1', scheduleAt: '2030-01-01T00:00:00Z', idempotencyKey: 'batch-key' });
    expect(result.status).toBe('error'); expect(update).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
  });
  it('reports only the sender receipt, including partial failures', async () => {
    const schedule = vi.fn(async () => ({ acknowledgement: 'scheduled' as const, output: { campaignId: 'campaign-1', status: 'SCHEDULED' } }));
    const sendBatch = vi.fn(async () => ({ acknowledgement: 'accepted' as const, output: { campaignId: 'campaign-1', status: 'SENDING', sentCount: 2, failedCount: 1, email: 'PRIVATE@example.test' } }));
    const platform = createFixturePlatform({ providers: { campaigns: { schedule, sendBatch } } });
    const result = await platform.executeServiceFlow(fixtureContext, 'send-campaign-batch', { campaignId: 'campaign-1', idempotencyKey: 'batch-key' });
    expect(result.status).toBe('success'); expect(sendBatch).toHaveBeenCalledOnce(); expect(schedule).not.toHaveBeenCalled();
    expect(result.result).toEqual({ campaignId: 'campaign-1', status: 'SENDING', sentCount: 2, failedCount: 1 });
    expect(result.narrative.length).toBeGreaterThan(0); expect(JSON.stringify(result)).not.toContain('PRIVATE@example.test');
  });
  it('fails safely when scheduler rejects rather than marking SCHEDULED', async () => {
    const schedule = vi.fn(async () => { throw new Error('provider leaked PRIVATE@example.test https://private.test/token'); });
    const result = await createFixturePlatform({ providers: { campaigns: { schedule, sendBatch: vi.fn() } } }).executeServiceFlow(fixtureContext, 'schedule-campaign', { campaignId: 'campaign-1', scheduleAt: '2030-01-01T00:00:00Z', idempotencyKey: 'schedule-key' });
    expect(result.status).toBe('error'); expect(result.result).toBeUndefined(); expect(result.code).toBe('BUSINESS_OPERATION_FAILED');
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|private.test/);
  });
});
