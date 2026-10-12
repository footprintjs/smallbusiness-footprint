import { describe, expect, it, vi } from 'vitest';
import { createFixturePlatform, createMockRepository, fixtureContext } from '../helpers.js';
describe('protected product operations using real FootprintJS10', () => {
  it('creates with typed arrays and returns safe IDs plus SDK execution evidence', async () => {
    const repo = createMockRepository(); const create = vi.spyOn(repo, 'createProduct'); const platform = createFixturePlatform({ repository: repo });
    const result = await platform.executeServiceFlow(fixtureContext, 'create-product', { name: 'Dress', basePrice: 2999, colors: ['Pink'], sizes: ['6'], images: ['https://example.test/dress.jpg'] });
    expect(result.status).toBe('success'); expect(result.result).toMatchObject({ productId: 'product-1', status: 'ACTIVE' }); expect(result.executionSnapshot).toBeDefined(); expect(result.narrative.length).toBeGreaterThan(0); expect(create).toHaveBeenCalledOnce();
  });
  it.each([{}, { name: 'Dress' }, { name: 'Dress', basePrice: -1 }, { name: 4, basePrice: 5 }, { name: 'Dress', basePrice: NaN }, { name: 'Dress', basePrice: 5, colors: 'pink' }])('rejects invalid input before a repository call %j', async input => {
    const repo = createMockRepository(); const create = vi.spyOn(repo, 'createProduct'); const result = await createFixturePlatform({ repository: repo }).executeServiceFlow(fixtureContext, 'create-product', input);
    expect(result.status).toBe('error'); expect(create).not.toHaveBeenCalled();
  });
  it('routes update-product to update rather than the create capability', async () => {
    const repo = createMockRepository(); const create = vi.spyOn(repo, 'createProduct'); const update = vi.spyOn(repo, 'updateProduct');
    expect((await createFixturePlatform({ repository: repo }).executeAction(fixtureContext, 'update-product', { id: 'product-1', name: 'Edited' })).status).toBe('success'); expect(update).toHaveBeenCalledOnce(); expect(create).not.toHaveBeenCalled();
  });
  it('archives through its exact handler', async () => { const repo = createMockRepository(); const archive = vi.spyOn(repo, 'archiveProduct'); const result = await createFixturePlatform({ repository: repo }).executeServiceFlow(fixtureContext, 'archive-product', { id: 'product-1' }); expect(result.status).toBe('success'); expect(archive).toHaveBeenCalledOnce(); });
});
