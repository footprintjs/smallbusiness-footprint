import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import manifest from '../../../package.json' with { type: 'json' };

const commerce = createRequire(import.meta.url);
const blueprint = createRequire(commerce.resolve('footprint-blueprint'));
const engine = createRequire(commerce.resolve('footprintjs'));

describe('installed runtime dependencies', () => {
  it('uses one engine and record reader across commerce and Blueprint', () => {
    for (const name of ['footprintjs', 'foottrace'] as const) {
      const metadata = name + '/package.json';
      expect(commerce(metadata).version).toBe(manifest.dependencies[name]);
      expect(blueprint.resolve(metadata)).toBe(commerce.resolve(metadata));
    }
    expect(engine.resolve('foottrace/package.json')).toBe(commerce.resolve('foottrace/package.json'));
  });
});
