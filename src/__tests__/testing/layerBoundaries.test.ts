import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
describe('diagnostics and local testing ownership', () => {
  it('runtime diagnostics/testing imports only public engine, Blueprint and package-local modules', () => {
    for (const path of ['diagnostics.ts', 'testing.ts', 'testing/runner.ts', 'testing/scenarios.ts']) {
      const text = source(path);
      const imports = [...text.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
      for (const dependency of imports) expect(dependency.startsWith('.') || ['footprintjs', 'footprint-blueprint/diagnostics'].includes(dependency)).toBe(true);
      expect(text).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|require)\s*\(|process\.env|node:|@aws-sdk|agentfootprint|anthropic|easypost|charmingcherubs/i);
    }
  });
  it('testing stays opt-in instead of entering application runtime and metadata entry points', () => {
    expect(source('index.ts')).not.toMatch(/testing|diagnostics/);
    expect(source('metadata.ts')).not.toMatch(/testing|diagnostics/);
    const metadata = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
    expect(metadata.exports['./testing'].types).toBe('./dist/testing.d.ts');
    expect(metadata.exports['./diagnostics'].types).toBe('./dist/diagnostics.d.ts');
    expect(metadata.dependencies['footprint-blueprint']).toBe('0.5.0');
  });
});
