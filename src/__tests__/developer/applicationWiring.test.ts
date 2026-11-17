import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';
import { analyzeDeveloperSource } from '../../../scripts/developer/build-manifest.mjs';
import { buildApplicationSourceWiring, validateApplicationSourceWiring } from '../../developer/application-wiring.js';
import type { ApplicationSourceWiringSelection } from '../../developer/application-wiring.js';
import type { DeveloperSourceManifest, DeveloperSourceUnit } from '../../developer/types.js';

const scratch: string[] = [];
afterEach(async () => { for (const root of scratch.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const file = 'src/app.mjs';
const source = `import {flowChart} from 'footprintjs';
import {normalize,stockAllowed,intentInput} from './rules.mjs';
throw new Error('NEVER_IMPORT_APPLICATION');
export function stockPlan(session) {
 return flowChart('Check requested stock', scope => {
  session.command=normalize(session.input);
  scope.setValue('allowed',stockAllowed(session.stock,session.demand,session.command));
  return session.ports.store.prepare(intentInput(session));
 },'stock-check').build();
}
export const marker="🧭 and ${String.fromCharCode(96).repeat(3)}";
`;
function catalog(text: string): DeveloperSourceManifest {
  const record = analyzeDeveloperSource(file, Buffer.from(text));
  // The caller's build-time parser can add exact call-expression units to the
  // canonical catalog. Production APIs consume only this static data, never a parser.
  const ast = parse(text, { sourceType: 'module' });
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, any>;
    if (n.type === 'CallExpression') {
      const callee = text.slice(n.callee.start, n.callee.end);
      if (['normalize', 'stockAllowed', 'intentInput', 'session.ports.store.prepare'].includes(callee)) {
        const unit: DeveloperSourceUnit = { id: `call:${n.start}:${n.end}`, kind: 'expression', symbol: callee, owner: 'stockPlan', role: 'callsite', stageId: 'stock-check', start: n.start, end: n.end, byteStart: Buffer.byteLength(text.slice(0, n.start)), byteEnd: Buffer.byteLength(text.slice(0, n.end)), startLine: n.loc.start.line, endLine: n.loc.end.line, textSha256: sha(text.slice(n.start, n.end)) };
        record.units.push(unit);
      }
    }
    for (const [key, value] of Object.entries(n)) {
      if (['loc', 'start', 'end', 'comments', 'tokens', 'extra'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  const files = { [file]: record };
  return { schemaVersion: 1, scope: 'source-only-static-syntax', package: { name: 'application-source-only', version: '0.0.0' }, parser: { name: '@babel/parser', version: '8.1.2' }, sourceTreeSha256: sha(JSON.stringify(Object.entries(files).map(([f, r]) => [f, r.sha256]))), files };
}
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smallbusiness-source-wiring-')); scratch.push(root);
  await fs.mkdir(path.join(root, 'src')); await fs.writeFile(path.join(root, file), source);
  const sourceManifest = catalog(source);
  const selections: ApplicationSourceWiringSelection[] = [
    { id: 'normalize-command', flowId: 'dispatch', source: { file, symbol: 'normalize', role: 'callsite' } },
    { id: 'stock-admission', flowId: 'dispatch/stock', source: { file, symbol: 'stockAllowed', role: 'callsite' } },
    { id: 'prepare-plan', flowId: 'dispatch', source: { file, symbol: 'session.ports.store.prepare', role: 'callsite' } },
  ];
  return { root, sourceManifest, selections, sourceFiles: [file] };
}

describe('current source-bound caller/wiring context', () => {
  it('delivers exact AST-derived caller arguments and source proofs without importing the application', async () => {
    const f = await fixture(), wiring = await buildApplicationSourceWiring(f);
    expect(wiring.entries).toHaveLength(3);
    expect(wiring.text).toContain('stockAllowed(session.stock,session.demand,session.command)');
    expect(wiring.text).toContain('session.ports.store.prepare(intentInput(session))');
    expect(wiring.text).not.toContain('NEVER_IMPORT_APPLICATION');
    expect(wiring.text).not.toContain('export function stockPlan');
    for (const entry of wiring.entries) {
      expect(entry.status).toBe('current-source');
      expect(entry.text).toBe(source.slice(entry.proof.start, entry.proof.end));
      expect(entry.proof.moduleSha256).toBe(sha(source));
      expect(entry.unit).toMatchObject({ kind: 'expression', role: 'callsite', owner: 'stockPlan', stageId: 'stock-check' });
    }
    expect(wiring.manifest.coverage).toMatchObject({ completeApplication: false, runtimeEffectsVerified: false, catalogOrigin: 'caller-trusted-static-syntax' });
    expect(await validateApplicationSourceWiring({ root: f.root, wiring })).toMatchObject({ valid: true, entries: 3 });
    const reversed = await buildApplicationSourceWiring({ ...f, sourceFiles: [...f.sourceFiles].reverse(), selections: [...f.selections].reverse() });
    expect(reversed).toEqual(wiring);
  });
  it('also resolves a complete canonical stage callback or named callable, rather than guessing source from labels', async () => {
    const f = await fixture();
    const callback = await buildApplicationSourceWiring({ ...f, selections: [{ id: 'stage', source: { file, stageId: 'stock-check', role: 'handler' } }] });
    expect(callback.entries[0]!.unit.kind).toBe('callback');
    expect(callback.entries[0]!.text).toContain("scope.setValue('allowed',stockAllowed");
    const callableUnit = f.sourceManifest.files[file]!.units.find(u => u.kind === 'function' && u.symbol === 'stockPlan')!;
    const callable = await buildApplicationSourceWiring({ ...f, selections: [{ id: 'factory', source: { file, unitId: callableUnit.id } }] });
    expect(callable.entries[0]!.text).toContain('export function stockPlan'.replace('export ', ''));
    await expect(buildApplicationSourceWiring({ ...f, selections: [{ id: 'whole-file', source: { file } }] })).rejects.toMatchObject({ code: 'INVALID_WIRING_SELECTOR' });
  });
  it('suppresses physically verified caller-declared supplied spans without claiming model memory, and deduplicates identical units', async () => {
    const f = await fixture(), selection = f.selections[1]!;
    const repeated = await buildApplicationSourceWiring({ ...f, selections: [{ ...selection, id: 'a' }, { ...selection, id: 'b' }] });
    expect(repeated.entries.map(e => e.status)).toEqual(['current-source', 'already-included']);
    expect(repeated.text.split('stockAllowed(session.stock,session.demand,session.command)').length - 1).toBe(1);
    expect((await validateApplicationSourceWiring({ root: f.root, wiring: repeated })).valid).toBe(true);
    const knownSpans = [{ file, moduleSha256: sha(source), start: 0, end: source.length, textSha256: sha(source) }];
    const covered = await buildApplicationSourceWiring({ ...f, knownSpans });
    expect(covered.entries.every(e => e.status === 'already-supplied' && e.text === undefined)).toBe(true);
    expect(covered.text).not.toContain('stockAllowed(session.stock,session.demand,session.command)');
    expect(covered.manifest.coverage.knownSpanOrigin).toContain('not-model-memory');
    expect((await validateApplicationSourceWiring({ root: f.root, wiring: covered })).valid).toBe(true);
    await expect(buildApplicationSourceWiring({ ...f, knownSpans: [{ ...knownSpans[0]!, moduleSha256: '0'.repeat(64) }] })).rejects.toMatchObject({ code: 'STALE_WIRING_KNOWN_SPAN' });
  });
  it('rejects stale catalogs and prepared artifacts after source edits without writing anything', async () => {
    const f = await fixture(), wiring = await buildApplicationSourceWiring(f);
    await fs.appendFile(path.join(f.root, file), '// source changed\n');
    await expect(buildApplicationSourceWiring(f)).rejects.toMatchObject({ code: 'STALE_WIRING_SOURCE_MANIFEST' });
    await expect(validateApplicationSourceWiring({ root: f.root, wiring })).rejects.toMatchObject({ code: 'STALE_APPLICATION_SOURCE_WIRING' });
    expect(await fs.readdir(f.root)).toEqual(['src']);
  });
  it('refuses missing, ambiguous and forged units even if the module hash is valid', async () => {
    const f = await fixture();
    await expect(buildApplicationSourceWiring({ ...f, selections: [{ id: 'missing', source: { file, symbol: 'doesNotExist' } }] })).rejects.toMatchObject({ code: 'UNRESOLVED_WIRING_SOURCE' });
    await expect(buildApplicationSourceWiring({ ...f, selections: [{ id: 'ambiguous', source: { file, role: 'callsite' } }] })).rejects.toMatchObject({ code: 'AMBIGUOUS_WIRING_SOURCE' });
    const forged = structuredClone(f.sourceManifest), unit = forged.files[file]!.units.find(u => u.role === 'callsite')!;
    (unit as { startLine: number }).startLine++;
    await expect(buildApplicationSourceWiring({ ...f, sourceManifest: forged })).rejects.toMatchObject({ code: 'INVALID_WIRING_SOURCE_PROOF' });
    const good = await buildApplicationSourceWiring(f), tampered = structuredClone(good);
    (tampered.entries[0] as { text: string }).text = 'invented caller(session.secret)';
    await expect(validateApplicationSourceWiring({ root: f.root, wiring: tampered })).rejects.toMatchObject({ code: 'INVALID_APPLICATION_SOURCE_WIRING' });
  });
  it('keeps UTF-16/UTF-8 geometry exact and refuses a forged split-surrogate range', async () => {
    const f = await fixture();
    const marker = await buildApplicationSourceWiring({ ...f, selections: [{ id: 'marker', source: { file, symbol: 'marker' } }] });
    expect(marker.entries[0]!.text).toContain('🧭');
    expect(marker.text).toContain('````js');
    const bad = structuredClone(f.sourceManifest), at = source.indexOf('🧭') + 1;
    const unit = bad.files[file]!.units.find(u => u.symbol === 'marker')!;
    Object.assign(unit, { start: at, end: at + 1, textSha256: sha(source.slice(at, at + 1)), byteStart: Buffer.byteLength(source.slice(0, at)), byteEnd: Buffer.byteLength(source.slice(0, at + 1)), startLine: source.slice(0, at).split('\n').length, endLine: source.slice(0, at + 1).split('\n').length });
    await expect(buildApplicationSourceWiring({ ...f, sourceManifest: bad, selections: [{ id: 'forged', source: { file, symbol: 'marker' } }] })).rejects.toMatchObject({ code: 'INVALID_WIRING_SOURCE_PROOF' });
  });
  it('fails an insufficient budget atomically instead of clipping source or omitting selections', async () => {
    const f = await fixture(), full = await buildApplicationSourceWiring(f);
    expect((await buildApplicationSourceWiring({ ...f, characterBudget: full.text.length })).text).toBe(full.text);
    await expect(buildApplicationSourceWiring({ ...f, characterBudget: full.text.length - 1 })).rejects.toMatchObject({ code: 'APPLICATION_WIRING_BUDGET_EXCEEDED' });
    expect(await fs.readdir(f.root)).toEqual(['src']);
  });
  it('offers a compact text view with one module hash while preserving full source/proofs, status and strict budget validation', async () => {
    const f = await fixture(), full = await buildApplicationSourceWiring(f), compact = await buildApplicationSourceWiring({ ...f, format: 'compact' });
    expect(full.manifest.format).toBeUndefined(); expect(compact.manifest.format).toBe('compact');
    expect(compact.entries).toEqual(full.entries); expect(compact.manifest.sourceHashes).toEqual(full.manifest.sourceHashes);
    expect(compact.text.length).toBeLessThan(full.text.length);
    expect(compact.text.split(sha(source)).length - 1).toBe(1);
    for (const e of compact.entries) {
      expect(compact.text).toContain(e.text); expect(compact.text).toContain(e.unit.role); expect(compact.text).toContain(e.unit.stageId);
      expect(compact.text).not.toContain(e.id); expect(compact.text).not.toContain(e.unit.id); expect(compact.text).not.toContain(e.proof.textSha256);
    }
    expect(compact.text).toContain('1. L');
    expect((await validateApplicationSourceWiring({ root: f.root, wiring: compact })).valid).toBe(true);
    expect((await buildApplicationSourceWiring({ ...f, format: 'compact', characterBudget: compact.text.length })).text).toBe(compact.text);
    await expect(buildApplicationSourceWiring({ ...f, format: 'compact', characterBudget: compact.text.length - 1 })).rejects.toMatchObject({ code: 'APPLICATION_WIRING_BUDGET_EXCEEDED' });
    const suppressed = await buildApplicationSourceWiring({ ...f, format: 'compact', knownSpans: [{ file, moduleSha256: sha(source), start: 0, end: source.length, textSha256: sha(source) }] });
    expect(suppressed.entries.every(e => e.status === 'already-supplied')).toBe(true);
    expect(suppressed.text).not.toContain('stockAllowed(session.stock,session.demand,session.command)');
    expect((await validateApplicationSourceWiring({ root: f.root, wiring: suppressed })).valid).toBe(true);
    const duplicate = await buildApplicationSourceWiring({ ...f, format: 'compact', selections: [{ ...f.selections[1]!, id: 'long-identifier-a' }, { ...f.selections[1]!, id: 'long-identifier-b' }] });
    expect(duplicate.text).toContain('Same current source as entry 1; body omitted.');
    expect(duplicate.text).not.toContain('long-identifier-');
    expect((await validateApplicationSourceWiring({ root: f.root, wiring: duplicate })).valid).toBe(true);
    await expect(buildApplicationSourceWiring({ ...f, format: 'short' as 'compact' })).rejects.toMatchObject({ code: 'INVALID_WIRING_FORMAT' });
    const bad = structuredClone(compact); (bad.manifest as { format: string }).format = 'short';
    await expect(validateApplicationSourceWiring({ root: f.root, wiring: bad })).rejects.toMatchObject({ code: 'INVALID_APPLICATION_SOURCE_WIRING' });
  });
  it('rejects configuration getters, source symlinks and non-admitted paths', async () => {
    const f = await fixture(); let getters = 0;
    const options = { ...f, get sourceManifest() { getters++; return f.sourceManifest; } };
    await expect(buildApplicationSourceWiring(options)).rejects.toMatchObject({ code: 'INVALID_WIRING_CONFIGURATION' }); expect(getters).toBe(0);
    await expect(buildApplicationSourceWiring({ ...f, sourceFiles: ['../secret.mjs'] })).rejects.toMatchObject({ code: 'UNSAFE_WIRING_SOURCE' });
    await expect(buildApplicationSourceWiring({ ...f, selections: [{ id: 'outside', source: { file: 'src/other.mjs', symbol: 'handler' } }] })).rejects.toMatchObject({ code: 'WIRING_SOURCE_NOT_ADMITTED' });
    await fs.writeFile(path.join(f.root, 'outside.mjs'), 'PRIVATE_SOURCE');
    await fs.unlink(path.join(f.root, file)); await fs.symlink(path.join(f.root, 'outside.mjs'), path.join(f.root, file));
    await expect(buildApplicationSourceWiring(f)).rejects.toMatchObject({ code: 'WIRING_SYMLINK_NOT_ADMITTED' });
  });
});
