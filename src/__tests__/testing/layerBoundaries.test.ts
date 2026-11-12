import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
describe('diagnostics and local testing ownership', () => {
  it('runtime diagnostics/testing imports only public engine, Blueprint and package-local modules', () => {
    for (const path of ['diagnostics.ts', 'diagnostics/runtime.ts', 'testing.ts', 'testing/runner.ts', 'testing/scenarios.ts', 'testing/boundaryScenarios.ts']) {
      const text = source(path);
      const imports = [...text.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
      for (const dependency of imports) expect(dependency.startsWith('.') || ['footprintjs', 'footprint-blueprint/diagnostics', 'footprint-blueprint/diagnostics/runtime'].includes(dependency)).toBe(true);
      expect(text).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|require)\s*\(|process\.env|node:|@aws-sdk|agentfootprint|anthropic|easypost|charmingcherubs/i);
    }
  });
  it('testing stays opt-in instead of entering application runtime and metadata entry points', () => {
    expect(source('index.ts')).not.toMatch(/testing|diagnostics/);
    expect(source('metadata.ts')).not.toMatch(/testing|diagnostics/);
    const metadata = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
    expect(metadata.exports['./testing'].types).toBe('./dist/testing.d.ts');
    expect(metadata.exports['./diagnostics'].types).toBe('./dist/diagnostics.d.ts');
    expect(metadata.exports['./diagnostics/runtime'].types).toBe('./dist/diagnostics/runtime.d.ts');
    expect(source('diagnostics.ts')).not.toContain('diagnostics/runtime');
    expect(metadata.dependencies['footprint-blueprint']).toBe('1.0.0');
  });
});


// These are the public documentation and output contracts, not a list of private names.
const packageRoot = new URL('../../../', import.meta.url);
const terminologyHeader = `/**
 * Business terminology definitions for configurable commerce workflows.
 * Configurable entity labels and per-business-type defaults.
 */`;

describe('library-owned public copy', () => {
  it.each(['src/terminology/businessTerms.ts', 'dist/terminology/businessTerms.d.ts'])(
    'keeps the approved generic terminology documentation in %s', path => {
      // CI builds before running the suite. Read the real declaration too: source-only
      // checks would miss stale or independently changed text in the public package.
      const text = readFileSync(new URL(path, packageRoot), 'utf8');
      expect(text.startsWith(terminologyHeader)).toBe(true);
    },
  );

  it('keeps the approved generic publication example documentation and actual output', () => {
    const example = new URL('examples/shared-evidence/publication.mjs', packageRoot);
    expect(readFileSync(example, 'utf8').split('\n')[0])
      .toBe('/** Guarded publication example using generic host-owned ports.');
    const output = execFileSync(process.execPath, [fileURLToPath(example)], {
      cwd: packageRoot, encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
      stdio: 'pipe',
    });
    const report = JSON.parse(output);
    expect(report.example).toBe('Guarded publication with Blueprint actions and a Smallbusiness port');
    expect(report.assertions).toBe('passed');
    expect(report.scenarios.map((scenario: { scenario: string }) => scenario.scenario)).toEqual([
      'publication-committed', 'exact-stale-request-failed', 'stale-source-failed', 'unauthorized-request-rejected',
    ]);
  });
});
