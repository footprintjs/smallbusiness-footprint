import { createRequire, findPackageJSON } from 'node:module';
import { describe, expect, it } from 'vitest';
import manifest from '../../../package.json' with { type: 'json' };

const commerce = createRequire(import.meta.url);
const blueprint = createRequire(commerce.resolve('footprint-blueprint'));
const engine = createRequire(commerce.resolve('footprintjs'));

describe('installed runtime dependencies', () => {
  it('installs the Blueprint version declared for commerce', () => {
    const metadata = findPackageJSON('footprint-blueprint', import.meta.url);
    expect(metadata).toBeDefined();
    expect(commerce(metadata!).version).toBe(manifest.dependencies['footprint-blueprint']);
  });

  it('uses one engine and record reader across commerce and Blueprint', () => {
    for (const name of ['footprintjs', 'foottrace'] as const) {
      const metadata = name + '/package.json';
      expect(commerce(metadata).version).toBe(manifest.dependencies[name]);
      expect(blueprint.resolve(metadata)).toBe(commerce.resolve(metadata));
    }
    expect(engine.resolve('foottrace/package.json')).toBe(commerce.resolve('foottrace/package.json'));
  });
});
