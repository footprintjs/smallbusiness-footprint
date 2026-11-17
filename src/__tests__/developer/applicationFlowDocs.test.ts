import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { flowChart } from 'footprintjs';
import { buildApplicationFlowDocumentation, checkApplicationFlowDocumentation, writeApplicationFlowDocumentation, type ApplicationFlowDocumentationIndex, type ApplicationDocumentationChart } from '../../developer/application.js';

const scratch: string[] = [];
afterEach(async () => { for (const root of scratch.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smallbusiness-flow-docs-')); scratch.push(root);
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src/app.mjs'), "throw new Error('NEVER_IMPORT_APPLICATION');\nexport const run = () => false;\n");
  await fs.writeFile(path.join(root, 'README.md'), '# Kept customer introduction\n\nHand-written content.\n');
  let callbacks = 0;
  const stop = () => { callbacks++; throw new Error('NEVER_EXECUTE_STAGE'); };
  const child = flowChart('Check stock', stop, 'check-stock').addDeciderFunction('Enough stock?', () => { callbacks++; return 'yes'; }, 'stock-decision').addFunctionBranch('yes', 'Reserve stock', stop).addFunctionBranch('no', 'Reject request', stop).end().build();
  const chart = flowChart('Validate request', stop, 'validate').addFunction('Build command', stop, 'command').build();
  const index: ApplicationFlowDocumentationIndex = { applicationName: 'Warehouse', sourceFiles: ['src/app.mjs'], flows: [{ id: 'dispatch', chart, sources: [{ file: 'src/app.mjs', symbol: 'run' }] }, { id: 'dispatch/stock', chart: child, parentId: 'dispatch', mountId: 'stock-mount', sources: [{ file: 'src/app.mjs' }], opaqueBoundaries: ['Atomic store behavior is host-owned.'] }] };
  return { root, index, chart, child, callbacks: () => callbacks };
}

describe('build-time chart algorithm READMEs', () => {
  it('reuses actual SDK chart descriptions and diagrams without executing the application or any stage', async () => {
    const f = await fixture(), docs = await buildApplicationFlowDocumentation({ root: f.root, index: f.index });
    expect(f.callbacks()).toBe(0);
    const parent = docs.manifest.flows.find(x => x.id === 'dispatch')!, child = docs.manifest.flows.find(x => x.id === 'dispatch/stock')!;
    expect(docs.files[parent.file]).toContain(f.chart.description);
    expect(docs.files[child.file]).toContain(f.child.toMermaid());
    expect(docs.files[child.file]).toContain('decision');
    expect(docs.files[child.file]).toContain('Enough stock?');
    expect(docs.files[parent.file]).toContain('stock-mount');
    expect(docs.files[child.file]).toContain('Parent: dispatch');
    expect(docs.files[parent.file]).toContain('../../../../src/app.mjs');
    expect(docs.manifest.coverage).toMatchObject({ completeApplication: false, executedCallbacks: false });
    expect(docs.files['README.md']).toContain('Validate request');
    const reversed = await buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, flows: [...f.index.flows].reverse() } });
    expect(reversed).toEqual(docs);
    const options = { root: f.root, documentation: docs, readmeFile: 'README.md' };
    expect((await checkApplicationFlowDocumentation(options)).valid).toBe(false);
    expect((await writeApplicationFlowDocumentation(options)).changed).toHaveLength(6);
    expect((await checkApplicationFlowDocumentation(options)).valid).toBe(true);
    expect((await writeApplicationFlowDocumentation(options)).changed).toEqual([]);
    expect(await fs.readFile(path.join(f.root, 'README.md'), 'utf8')).toContain('Hand-written content.');
  });
  it('formats chart-derived MCP metadata and JSON contracts without starting a server or running an action', async () => {
    const f = await fixture(); let exports = 0;
    const chart: ApplicationDocumentationChart = { toMermaid: () => 'flowchart TD\nstart-->done', description: '1. Validate\n2. Decide\n3. Reserve', stageDescriptions: new Map([['Decide', 'Use the declared stock rule']]), outputSchema: { type: 'boolean' }, toMCPTool() { exports++; return { name: 'reserve', description: 'Derived from numbered stages', inputSchema: { type: 'object', properties: { quantity: { type: 'integer' } } } }; } };
    const docs = await buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, flows: [{ id: 'reserve', chart }] } });
    const page = docs.files[docs.manifest.flows[0]!.file]!;
    expect(exports).toBe(1); expect(page).toContain('Tool name: reserve'); expect(page).toContain('"quantity"'); expect(page).toContain('"boolean"'); expect(page).toContain('Derived from numbered stages');
    expect(page).toContain('Use the declared stock rule'); expect(docs.manifest.flows[0]!.algorithmOrigin).toBe('chart-metadata');
    expect(page).toContain('No owning source declared');
  });
  it('preserves an exact structural fallback when view metadata has no generated algorithm description', async () => {
    const f = await fixture();
    const chart = { toMermaid: () => f.child.toMermaid(), root: f.child.root };
    const docs = await buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, flows: [{ id: 'sparse', chart }] } });
    expect(docs.manifest.flows[0]!.algorithmOrigin).toBe('constructed-topology');
    expect(docs.files[docs.manifest.flows[0]!.file]).toContain('Constructed topology (callback semantics unresolved)');
    expect(f.callbacks()).toBe(0);
  });
  it('describes real native parallel forks and loop targets, and expands title-only metadata structurally', async () => {
    const f = await fixture(); let ran = 0;
    const stop = () => { ran++; throw new Error('NEVER_RUN'); };
    const native = flowChart('Read inputs', stop, 'inputs').addListOfFunction([{ id: 'crew', name: 'Read crew', fn: stop }, { id: 'stock', name: 'Read stock', fn: stop }]).addFunction('Visit part', stop, 'part').loopTo('part').build();
    const chart = { toMermaid: () => native.toMermaid(), root: native.root, description: 'FlowChart: Read inputs' };
    const docs = await buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, flows: [{ id: 'parallel-loop', chart }] } });
    const page = docs.files[docs.manifest.flows[0]!.file]!;
    expect(docs.manifest.flows[0]!.algorithmOrigin).toBe('constructed-topology');
    expect(page).toContain('parallel fork'); expect(page).toContain('loop back → part');
    expect(page).toContain('after selected/parallel branches'); expect(page).toContain('Builder description (verbatim)');
    expect(ran).toBe(0);
  });
  it('detects source changes without modifying old documentation and rejects exports that mutate admitted source', async () => {
    const f = await fixture(), docs = await buildApplicationFlowDocumentation({ root: f.root, index: f.index });
    await writeApplicationFlowDocumentation({ root: f.root, documentation: docs });
    const before = await fs.readFile(path.join(f.root, 'docs/application-flows/README.md'), 'utf8');
    await fs.appendFile(path.join(f.root, 'src/app.mjs'), '// changed predicate\n');
    await expect(checkApplicationFlowDocumentation({ root: f.root, documentation: docs })).rejects.toMatchObject({ code: 'STALE_APPLICATION_FLOW_DOCUMENTATION' });
    expect(await fs.readFile(path.join(f.root, 'docs/application-flows/README.md'), 'utf8')).toBe(before);
    const chart = { toMermaid() { writeFileSync(path.join(f.root, 'src/app.mjs'), 'mutated'); return 'flowchart TD\nA'; } };
    await expect(buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, flows: [{ id: 'mutates', chart }] } })).rejects.toMatchObject({ code: 'SOURCE_CHANGED_DURING_DOCUMENTATION_BUILD' });
  });
  it('detects topology/description-only changes from freshly constructed charts and repairs a changed generated page', async () => {
    const f = await fixture(), docs = await buildApplicationFlowDocumentation({ root: f.root, index: f.index });
    await writeApplicationFlowDocumentation({ root: f.root, documentation: docs });
    const newChart = flowChart('Validate a new rule', () => { throw new Error('NEVER_RUN'); }, 'validate').build();
    const changed = await buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, flows: [{ ...f.index.flows[0]!, chart: newChart }, f.index.flows[1]!] } });
    const mismatch = await checkApplicationFlowDocumentation({ root: f.root, documentation: changed });
    expect(mismatch.valid).toBe(false); expect(mismatch.differences).toContain('docs/application-flows/' + docs.manifest.flows[0]!.file);
    await writeApplicationFlowDocumentation({ root: f.root, documentation: changed });
    const file = changed.manifest.flows[0]!.file;
    await fs.appendFile(path.join(f.root, 'docs/application-flows', file), '\nmanual wrong generated content\n');
    expect((await checkApplicationFlowDocumentation({ root: f.root, documentation: changed })).valid).toBe(false);
    await writeApplicationFlowDocumentation({ root: f.root, documentation: changed });
    expect((await checkApplicationFlowDocumentation({ root: f.root, documentation: changed })).valid).toBe(true);
  });
  it('removes only unchanged obsolete generated pages and preserves modified obsolete pages and unowned files', async () => {
    const f = await fixture(), docs = await buildApplicationFlowDocumentation({ root: f.root, index: f.index });
    await writeApplicationFlowDocumentation({ root: f.root, documentation: docs });
    const single = await buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, flows: [f.index.flows[0]!] } });
    const child = docs.manifest.flows.find(x => x.parentId)!.file, childPath = path.join(f.root, 'docs/application-flows', child);
    await fs.appendFile(childPath, 'manual work');
    await expect(writeApplicationFlowDocumentation({ root: f.root, documentation: single })).rejects.toMatchObject({ code: 'MODIFIED_OBSOLETE_OUTPUT' });
    expect(await fs.readFile(childPath, 'utf8')).toContain('manual work');
    await fs.writeFile(childPath, docs.files[child]!);
    expect((await checkApplicationFlowDocumentation({ root: f.root, documentation: single })).valid).toBe(false);
    expect((await writeApplicationFlowDocumentation({ root: f.root, documentation: single })).removed).toEqual(['docs/application-flows/' + child]);
    await fs.writeFile(path.join(f.root, 'docs/application-flows/notes.md'), 'User notes');
    await expect(writeApplicationFlowDocumentation({ root: f.root, documentation: single })).rejects.toMatchObject({ code: 'UNOWNED_OUTPUT' });
    expect(await fs.readFile(path.join(f.root, 'docs/application-flows/notes.md'), 'utf8')).toBe('User notes');
  });
  it('rejects unsafe output, source admission, symlinks, malformed hierarchy and tampered document proofs', async () => {
    const f = await fixture(), docs = await buildApplicationFlowDocumentation({ root: f.root, index: f.index });
    await expect(writeApplicationFlowDocumentation({ root: f.root, documentation: docs, outputDir: 'src/docs' })).rejects.toMatchObject({ code: 'OUTPUT_DIRECTORY_MISMATCH' });
    await expect(buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, sourceFiles: ['../secrets.mjs'] } })).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    await expect(buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, flows: [{ ...f.index.flows[0]!, parentId: 'missing' }] } })).rejects.toMatchObject({ code: 'INVALID_FLOW_HIERARCHY' });
    await expect(buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, flows: [{ ...f.index.flows[0]!, parentId: 'dispatch/stock' }, f.index.flows[1]!] } })).rejects.toMatchObject({ code: 'INVALID_FLOW_HIERARCHY' });
    await expect(writeApplicationFlowDocumentation({ root: f.root, documentation: { ...docs, files: { ...docs.files, 'README.md': 'tampered' } } })).rejects.toMatchObject({ code: 'INVALID_DOCUMENTATION_PROOF' });
    await fs.mkdir(path.join(f.root, 'docs')); await fs.symlink(path.join(f.root, 'src'), path.join(f.root, 'docs/application-flows'));
    await expect(writeApplicationFlowDocumentation({ root: f.root, documentation: docs })).rejects.toMatchObject({ code: 'SYMLINK_NOT_ADMITTED' });
  });
  it('keeps source links correct for custom output locations and prevents protected README updates', async () => {
    const f = await fixture(), docs = await buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, protectedPaths: ['README.md'] }, outputDir: 'flow-docs' });
    expect(docs.files[docs.manifest.flows[0]!.file]).toContain('../../../src/app.mjs');
    await expect(writeApplicationFlowDocumentation({ root: f.root, documentation: docs, readmeFile: 'README.md' })).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT' });
    expect((await writeApplicationFlowDocumentation({ root: f.root, documentation: docs })).files).toContain('flow-docs/README.md');
    expect((await checkApplicationFlowDocumentation({ root: f.root, documentation: docs })).valid).toBe(true);
  });
  it('rejects getters in configuration without executing them', async () => {
    const f = await fixture(); let called = 0;
    await expect(buildApplicationFlowDocumentation({ root: f.root, index: { ...f.index, get applicationName() { called++; return 'side effect'; } } })).rejects.toMatchObject({ code: 'INVALID_FLOW_DOCUMENTATION' });
    expect(called).toBe(0);
  });
});
