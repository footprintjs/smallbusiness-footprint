import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { flowChart } from 'footprintjs';
import { buildApplicationDeveloperContext, checkApplicationDeveloperContext, writeApplicationDeveloperContext, type ApplicationDeveloperIndex } from '../../developer/application.js';
// Build-time parser is intentionally not imported by the published Node application-context entry.
import { analyzeDeveloperSource } from '../../../scripts/developer/build-manifest.mjs';
import type { DeveloperSourceManifest } from '../../developer/types.js';

const scratch: string[] = [];
afterEach(async () => { for (const root of scratch.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const sha = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smallbusiness-app-context-')); scratch.push(root);
  await fs.mkdir(path.join(root, 'src'));
  const source = {
    'src/app.mjs': "throw new Error('APP_MUST_NOT_BE_IMPORTED');\nimport {reserve} from './logic.mjs';\nexport const run = input => reserve(input);\n",
    'src/logic.mjs': "const floor = 2;\nexport function reserve(input) { return input.stock >= input.quantity + floor; }\n",
    'src/refund.mjs': "export function refund() { throw new Error('OPAQUE_PROVIDER_NOT_EXECUTED'); }\n",
  };
  for (const [f, s] of Object.entries(source)) await fs.writeFile(path.join(root, f), s);
  const smoke = "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {run} from './src/app.mjs';\ntest('public reserve',()=>assert.equal(run({stock:4,quantity:2}),true));\n";
  await fs.writeFile(path.join(root, 'public.test.mjs'), smoke);
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'tiny-app', private: true, type: 'module', scripts: { test: 'node --test public.test.mjs', build: 'node check.mjs' }, dependencies: { 'smallbusiness-footprint': '1.1.0' } }));
  const index: ApplicationDeveloperIndex = { applicationName: 'Tiny warehouse', sourceFiles: Object.keys(source), flows: [{ id: 'inventory-reserve', description: 'Reserve inventory with a floor', tags: ['stock'], sources: [{ file: 'src/app.mjs' }, { file: 'src/logic.mjs' }], opaqueBoundaries: ['Authoritative provider effects are outside this app packet'] }, { id: 'billing-refund', description: 'Refund an invoice', sources: [{ file: 'src/refund.mjs' }] }], development: { entry: { file: 'src/app.mjs', exportName: 'run', signature: 'run(input)' }, commands: { test: 'npm test', build: 'npm run build' }, smokeTest: { file: 'public.test.mjs', text: smoke }, regressionTestDirectory: 'src/__tests__', protectedFiles: ['public.test.mjs', 'scripts/'] } };
  return { root, source, smoke, index };
}
const goal = 'Change inventory reserve stock floor';

describe('explicit application source context', () => {
  it('supplies current editable modules, package facts and approved smoke upfront without importing app code', async () => {
    const f = await fixture(), a = await buildApplicationDeveloperContext({ root: f.root, index: f.index, goal });
    expect(a.manifest.selectedFlowIds).toEqual(['inventory-reserve']);
    expect(a.packetText).toContain(f.source['src/app.mjs']); expect(a.packetText).toContain(f.source['src/logic.mjs']);
    expect(a.packetText).not.toContain(f.source['src/refund.mjs']); expect(a.packetText).toContain(f.smoke);
    expect(a.packetText).toContain('node --test public.test.mjs'); expect(a.packetText).toContain('New regression tests: src/__tests__');
    expect(a.manifest.coverage.allAdmittedSourceDelivered).toBe(false); expect(a.manifest.coverage.completeApplication).toBe(false);
    expect(a.packetText.slice(a.manifest.publicSmoke.packetStart, a.manifest.publicSmoke.packetEnd)).toBe(f.smoke);
    expect(a.manifest.publicSmoke).toMatchObject({ origin: 'current-file', file: 'public.test.mjs', sha256: sha(f.smoke) });
    for (const p of a.manifest.sources) expect(a.packetText.slice(p.packetStart, p.packetEnd)).toBe(f.source[p.file as keyof typeof f.source]);
    const b = await buildApplicationDeveloperContext({ root: f.root, index: { ...f.index, sourceFiles: [...f.index.sourceFiles].reverse(), flows: [...f.index.flows].reverse() }, goal });
    expect(b).toEqual(a);
  });
  it('keeps all registered flow locators, follows explicit related flow membership and rejects missing membership', async () => {
    const f = await fixture();
    const index = { ...f.index, flows: f.index.flows.map(flow => flow.id === 'inventory-reserve' ? { ...flow, relatedFlowIds: ['billing-refund'] } : flow) };
    const a = await buildApplicationDeveloperContext({ root: f.root, index, goal });
    expect(a.indexText).toContain('billing-refund'); expect(a.manifest.selectedFlowIds).toEqual(['billing-refund', 'inventory-reserve']);
    expect(a.packetText).toContain(f.source['src/refund.mjs']); expect(a.manifest.coverage.allAdmittedSourceDelivered).toBe(true);
    await expect(buildApplicationDeveloperContext({ root: f.root, index: { ...index, flows: [{ ...index.flows[0]!, relatedFlowIds: ['missing'] }, index.flows[1]!] }, goal })).rejects.toMatchObject({ code: 'INVALID_INDEX' });
  });
  it('exports the trusted constructed SDK topology without executing stage callbacks, and labels declared diagrams separately', async () => {
    const f = await fixture(); let ran = 0;
    const chart = flowChart('Validate', () => { ran++; }, 'validate').addDeciderFunction('Allowed?', () => { ran++; return 'yes'; }, 'allowed').addFunctionBranch('yes', 'Keep request', () => { ran++; }).end().build();
    const index = { ...f.index, flows: [{ ...f.index.flows[0]!, chart }, { ...f.index.flows[1]!, diagram: 'flowchart TD\nA-->B' }] };
    const a = await buildApplicationDeveloperContext({ root: f.root, index, goal });
    expect(ran).toBe(0); expect(a.packetText).toContain(chart.toMermaid());
    expect(a.manifest.topology.map(t => t.origin)).toEqual(['caller-declared', 'caller-trusted-chart-export']);
    await expect(buildApplicationDeveloperContext({ root: f.root, index: { ...f.index, flows: [{ ...f.index.flows[0]!, chart, diagram: 'flowchart TD' }] }, goal })).rejects.toMatchObject({ code: 'INVALID_INDEX' });
  });
  it('rejects accessor/function configuration without invoking application getters', async () => {
    const f = await fixture(); let ran = 0;
    const index = { ...f.index, get applicationName() { ran++; return 'unsafe'; } };
    await expect(buildApplicationDeveloperContext({ root: f.root, index, goal })).rejects.toMatchObject({ code: 'INVALID_INDEX' });
    expect(ran).toBe(0);
  });
  it('never clips a complete packet or drops source to force admission at a lower budget', async () => {
    const f = await fixture(), a = await buildApplicationDeveloperContext({ root: f.root, index: f.index, goal });
    expect((await buildApplicationDeveloperContext({ root: f.root, index: f.index, goal, characterBudget: a.packetText.length })).packetText).toBe(a.packetText);
    await expect(buildApplicationDeveloperContext({ root: f.root, index: f.index, goal, characterBudget: a.packetText.length - 1 })).rejects.toMatchObject({ code: 'APPLICATION_CONTEXT_BUDGET_EXCEEDED' });
    expect(await fs.readdir(f.root)).toEqual(expect.not.arrayContaining(['docs']));
  });
  it('binds canonical optional method selectors to current exact bytes; no stale or forged range is accepted', async () => {
    const f = await fixture();
    const files = Object.fromEntries(Object.entries(f.source).map(([file, source]) => [file, analyzeDeveloperSource(file, Buffer.from(source))]));
    const manifest: DeveloperSourceManifest = { schemaVersion: 1, scope: 'source-only-static-syntax', package: { name: 'tiny-app', version: '0.0.0' }, parser: { name: '@babel/parser', version: '8.1.2' }, sourceTreeSha256: sha(JSON.stringify(Object.entries(files).map(([file, v]) => [file, v.sha256]))), files };
    const index = { ...f.index, flows: [{ ...f.index.flows[0]!, sources: [{ file: 'src/logic.mjs', symbol: 'reserve' }] }, f.index.flows[1]!] };
    const a = await buildApplicationDeveloperContext({ root: f.root, index, goal, sourceManifest: manifest });
    expect(a.manifest.sources.find(s => s.file === 'src/logic.mjs')!.resolvedUnits[0]!.symbol).toBe('reserve');
    const forged = structuredClone(manifest); forged.files['src/logic.mjs']!.units.find(u => u.symbol === 'reserve')!.start++;
    await expect(buildApplicationDeveloperContext({ root: f.root, index, goal, sourceManifest: forged })).rejects.toMatchObject({ code: 'INVALID_SOURCE_PROOF' });
    await fs.appendFile(path.join(f.root, 'src/logic.mjs'), '// newer\n');
    await expect(buildApplicationDeveloperContext({ root: f.root, index, goal, sourceManifest: manifest })).rejects.toMatchObject({ code: 'STALE_SOURCE_MANIFEST' });
  });
  it('refuses private/unadmitted paths, symlink ancestors and stale public smoke without returning a packet', async () => {
    const f = await fixture();
    await expect(buildApplicationDeveloperContext({ root: f.root, index: { ...f.index, sourceFiles: ['../secret.mjs'] }, goal })).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    await expect(buildApplicationDeveloperContext({ root: f.root, index: { ...f.index, sourceFiles: ['src/__tests__/private.mjs'] }, goal })).rejects.toMatchObject({ code: 'UNSAFE_SOURCE' });
    await expect(buildApplicationDeveloperContext({ root: f.root, index: { ...f.index, flows: [{ ...f.index.flows[0]!, sources: [{ file: 'src/not-admitted.mjs' }] }] }, goal })).rejects.toMatchObject({ code: 'SOURCE_NOT_ADMITTED' });
    await fs.appendFile(path.join(f.root, 'public.test.mjs'), '// newer\n');
    await expect(buildApplicationDeveloperContext({ root: f.root, index: f.index, goal })).rejects.toMatchObject({ code: 'STALE_PUBLIC_SMOKE' });
    await fs.writeFile(path.join(f.root, 'public.test.mjs'), f.smoke);
    await fs.mkdir(path.join(f.root, 'other')); await fs.writeFile(path.join(f.root, 'other/source.mjs'), 'export const secret=1;');
    await fs.symlink(path.join(f.root, 'other'), path.join(f.root, 'src/linked'));
    await expect(buildApplicationDeveloperContext({ root: f.root, index: { ...f.index, sourceFiles: [...f.index.sourceFiles, 'src/linked/source.mjs'] }, goal })).rejects.toMatchObject({ code: 'SYMLINK_NOT_ADMITTED' });
  });
  it('detects admitted input changes by a trusted chart exporter before returning stale combined source', async () => {
    const f = await fixture();
    const { writeFileSync } = await import('node:fs');
    const index = { ...f.index, flows: [{ ...f.index.flows[0]!, chart: { toMermaid() { writeFileSync(path.join(f.root, 'src/logic.mjs'), 'changed'); return 'flowchart TD\nA'; } } }] };
    await expect(buildApplicationDeveloperContext({ root: f.root, index, goal })).rejects.toMatchObject({ code: 'SOURCE_CHANGED_DURING_CONTEXT_BUILD' });
  });
});

describe('explicit application writer and read-only check', () => {
  it('preserves handwritten README/AGENTS content and writes the exact stable owned set', async () => {
    const f = await fixture(); await fs.writeFile(path.join(f.root, 'README.md'), '# Original\n\nUser text.\n'); await fs.writeFile(path.join(f.root, 'AGENTS.md'), '# Custom instructions\nKeep this.\n');
    const context = await buildApplicationDeveloperContext({ root: f.root, index: f.index, goal }), opts = { root: f.root, context, readmeFile: 'README.md', agentFile: 'AGENTS.md' };
    expect((await checkApplicationDeveloperContext(opts)).valid).toBe(false);
    expect((await writeApplicationDeveloperContext(opts)).changed).toHaveLength(6);
    expect((await checkApplicationDeveloperContext(opts)).valid).toBe(true);
    expect((await fs.readFile(path.join(f.root, 'README.md'), 'utf8')).startsWith('# Original\n\nUser text.\n')).toBe(true);
    expect((await fs.readFile(path.join(f.root, 'AGENTS.md'), 'utf8')).startsWith('# Custom instructions\nKeep this.\n')).toBe(true);
    const before = await fs.stat(path.join(f.root, 'docs/application-context/packet.md'));
    expect((await writeApplicationDeveloperContext(opts)).changed).toEqual([]);
    expect((await fs.stat(path.join(f.root, 'docs/application-context/packet.md'))).mtimeMs).toBe(before.mtimeMs);
    await fs.appendFile(path.join(f.root, 'docs/application-context/packet.md'), 'forged');
    const damaged = await fs.readFile(path.join(f.root, 'docs/application-context/packet.md'), 'utf8');
    expect((await checkApplicationDeveloperContext(opts)).differences).toEqual(['docs/application-context/packet.md']);
    expect(await fs.readFile(path.join(f.root, 'docs/application-context/packet.md'), 'utf8')).toBe(damaged);
    await writeApplicationDeveloperContext(opts); expect((await checkApplicationDeveloperContext(opts)).valid).toBe(true);
  });
  it('rejects stale context before mutating files, including source and package/smoke changes', async () => {
    const f = await fixture(), context = await buildApplicationDeveloperContext({ root: f.root, index: f.index, goal });
    await fs.appendFile(path.join(f.root, 'src/refund.mjs'), '// unselected but admitted changed\n');
    await expect(writeApplicationDeveloperContext({ root: f.root, context, readmeFile: 'README.md' })).rejects.toMatchObject({ code: 'STALE_APPLICATION_CONTEXT' });
    await expect(fs.access(path.join(f.root, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' });
    await fs.writeFile(path.join(f.root, 'src/refund.mjs'), f.source['src/refund.mjs']);
    await fs.appendFile(path.join(f.root, 'package.json'), ' ');
    await expect(checkApplicationDeveloperContext({ root: f.root, context })).rejects.toMatchObject({ code: 'STALE_APPLICATION_CONTEXT' });
  });
  it('does not overwrite unknown output files or malformed root marker sections', async () => {
    const f = await fixture(), context = await buildApplicationDeveloperContext({ root: f.root, index: f.index, goal });
    await fs.mkdir(path.join(f.root, 'docs/application-context'), { recursive: true }); await fs.writeFile(path.join(f.root, 'docs/application-context/user.md'), 'user-owned');
    await expect(writeApplicationDeveloperContext({ root: f.root, context })).rejects.toMatchObject({ code: 'UNOWNED_OUTPUT' });
    expect(await fs.readFile(path.join(f.root, 'docs/application-context/user.md'), 'utf8')).toBe('user-owned');
    await fs.rm(path.join(f.root, 'docs'), { recursive: true }); await fs.writeFile(path.join(f.root, 'AGENTS.md'), '<!-- BEGIN SMALLBUSINESS APPLICATION CONTEXT -->\nuser');
    await expect(writeApplicationDeveloperContext({ root: f.root, context, agentFile: 'AGENTS.md' })).rejects.toMatchObject({ code: 'INVALID_GENERATED_MARKERS' });
    await expect(fs.access(path.join(f.root, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('refuses source/test/package and production-scope instruction targets before creating any output', async () => {
    const f = await fixture(), context = await buildApplicationDeveloperContext({ root: f.root, index: f.index, goal });
    const original = new Map(await Promise.all([...Object.keys(f.source), 'public.test.mjs', 'package.json'].map(async file => [file, await fs.readFile(path.join(f.root, file))] as const)));
    const forbidden = ['src/app.mjs', 'public.test.mjs', 'package.json', 'src/README.md', 'SRC/README.md', 'source/README.md', 'lib/AGENTS.md', 'app/README.md', 'test/README.md', 'tests/README.md', 'fixtures/README.md', '__fixtures__/README.md', 'node_modules/README.md', 'dist/README.md', 'scripts/README.md'];
    for (const file of forbidden) for (const key of ['readmeFile', 'agentFile'] as const) {
      await expect(writeApplicationDeveloperContext({ root: f.root, context, [key]: file })).rejects.toThrow();
      await expect(checkApplicationDeveloperContext({ root: f.root, context, [key]: file })).rejects.toThrow();
      await expect(fs.access(path.join(f.root, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' });
    }
    for (const [file, bytes] of original) expect(await fs.readFile(path.join(f.root, file))).toEqual(bytes);
    expect(await fs.readdir(path.join(f.root, 'src'))).toEqual(expect.not.arrayContaining(['README.md']));
  });
  it('retains protected input paths in the manifest and refuses Markdown aliases of public/protected inputs', async () => {
    const f = await fixture();
    await fs.writeFile(path.join(f.root, 'public-example.md'), f.smoke); await fs.writeFile(path.join(f.root, 'GUIDE.md'), 'Handwritten guide.');
    await fs.mkdir(path.join(f.root, 'docs-private')); await fs.writeFile(path.join(f.root, 'docs-private/notes.md'), 'Protected notes.');
    const index = { ...f.index, development: { ...f.index.development, smokeTest: { file: 'public-example.md' }, protectedFiles: ['GUIDE.md', 'docs-private/'] } };
    const context = await buildApplicationDeveloperContext({ root: f.root, index, goal });
    expect(context.manifest.protectedPaths).toEqual(['GUIDE.md', 'docs-private/']);
    for (const file of ['public-example.md', 'GUIDE.md', 'guide.MD', 'docs-private/README.md']) {
      await expect(writeApplicationDeveloperContext({ root: f.root, context, readmeFile: file })).rejects.toMatchObject({ code: 'UNSAFE_INSTRUCTION_TARGET' });
      await expect(fs.access(path.join(f.root, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect(await fs.readFile(path.join(f.root, 'GUIDE.md'), 'utf8')).toBe('Handwritten guide.');
    expect(await fs.readFile(path.join(f.root, 'public-example.md'), 'utf8')).toBe(f.smoke);
    expect(await fs.readFile(path.join(f.root, 'docs-private/notes.md'), 'utf8')).toBe('Protected notes.');
    const protectedOutput = await buildApplicationDeveloperContext({ root: f.root, index: { ...index, development: { ...index.development, protectedFiles: ['docs/application-context/packet.md'] } }, goal });
    await expect(writeApplicationDeveloperContext({ root: f.root, context: protectedOutput })).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT' });
    await expect(fs.access(path.join(f.root, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects case aliases and file/directory overlaps between instruction and output paths before mutation', async () => {
    const f = await fixture(), context = await buildApplicationDeveloperContext({ root: f.root, index: f.index, goal });
    for (const options of [{ readmeFile: 'docs/application-context/index.md' }, { agentFile: 'DOCS/APPLICATION-CONTEXT/AGENTS.md' }, { outputDir: 'README.md/context', readmeFile: 'README.md' }, { readmeFile: 'guide.md', agentFile: 'guide.md/AGENTS.md' }, { outputDir: 'SRC/context' }]) {
      await expect(writeApplicationDeveloperContext({ root: f.root, context, ...options })).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT' });
    }
    expect((await fs.readdir(f.root)).sort()).toEqual(['package.json', 'public.test.mjs', 'src']);
  });
  it('allows an explicit work cache scope but never private production admission or symlink output escape', async () => {
    const f = await fixture(), context = await buildApplicationDeveloperContext({ root: f.root, index: f.index, goal });
    const opts = { root: f.root, context, outputDir: '.work-tmp/application-context', readmeFile: '.work-tmp/README.md', agentFile: '.work-tmp/AGENTS.md' };
    expect((await writeApplicationDeveloperContext(opts)).changed).toHaveLength(6); expect((await checkApplicationDeveloperContext(opts)).valid).toBe(true);
    await expect(writeApplicationDeveloperContext({ root: f.root, context, outputDir: '.git/context' })).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    await fs.mkdir(path.join(f.root, 'external')); await fs.symlink(path.join(f.root, 'external'), path.join(f.root, 'linked'));
    await expect(writeApplicationDeveloperContext({ root: f.root, context, outputDir: 'linked/context' })).rejects.toMatchObject({ code: 'SYMLINK_NOT_ADMITTED' });
    expect(await fs.readdir(path.join(f.root, 'external'))).toEqual([]);
  });
});
