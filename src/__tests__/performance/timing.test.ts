import { describe, it, expect } from 'vitest';
import { createFixturePlatform, fixtureContext } from '../helpers.js';
import { createBusinessServiceRegistry } from '../../flows/businessServiceComposer.js';

describe('reusable runtime allocation', () => {
  it('gives each call a fresh SDK executor without carrying previous scope state', async () => {
    const platform = createFixturePlatform();
    for (let index = 0; index < 20; index++) {
      const result = await platform.executeServiceFlow(fixtureContext, 'create-product', { name: `Product-${index}`, basePrice: 20 });
      expect(result.status).toBe('success'); expect(result.result?.productId).toBe(`product-${index + 1}`);
      expect(JSON.stringify(result.executionSnapshot)).not.toContain(`Product-${index}`);
    }
  });
  it('describing configured services does not call operation providers', () => {
    const registry = createBusinessServiceRegistry(undefined);
    expect(registry.describeAllServices().length).toBe(12); expect(registry.describeService('missing')).toBeUndefined();
  });
});
