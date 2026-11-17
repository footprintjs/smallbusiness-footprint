/** Optional Node/build source facts. No parser, application module or callback is imported or executed. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { DeveloperKnownSourceSpan, DeveloperSourceManifest, DeveloperSourceSelector, DeveloperSourceUnit } from './types.js';

export type ApplicationSourceWiringSelection = {
  readonly id: string;
  readonly source: DeveloperSourceSelector;
  /** Caller-declared navigation membership, not an inferred execution relationship. */
  readonly flowId?: string;
};
export type ApplicationSourceWiringProof = {
  readonly file: string; readonly moduleSha256: string;
  readonly start: number; readonly end: number; readonly byteStart: number; readonly byteEnd: number;
  readonly startLine: number; readonly endLine: number; readonly textSha256: string;
};
export type ApplicationSourceWiringEntry = {
  readonly id: string; readonly flowId?: string; readonly selector: DeveloperSourceSelector;
  readonly status: 'current-source' | 'already-supplied' | 'already-included';
  readonly unit: DeveloperSourceUnit; readonly matchingUnitIds: readonly string[];
  readonly proof: ApplicationSourceWiringProof;
  readonly text?: string; readonly includedBy?: string;
  readonly suppliedBy?: DeveloperKnownSourceSpan;
};
export type ApplicationSourceWiring = {
  readonly text: string; readonly entries: readonly ApplicationSourceWiringEntry[];
  readonly manifest: {
    readonly schemaVersion: 1; readonly producer: 'smallbusiness-application-source-wiring-v1';
    readonly sourceTreeSha256: string; readonly sourceHashes: Readonly<Record<string, string>>;
    readonly catalogSourceTreeSha256: string;
    /** Opt-in text presentation only; exact entry/source proofs are unchanged. */
    readonly format?: 'compact';
    readonly characters: number; readonly textSha256: string; readonly characterBudget: number;
    readonly coverage: {
      readonly scope: 'explicit-selected-source-catalog-units'; readonly catalogOrigin: 'caller-trusted-static-syntax';
      readonly currentBytesVerified: true; readonly completeApplication: false; readonly runtimeEffectsVerified: false;
      readonly knownSpanOrigin: 'caller-declared-prior-exposure-not-model-memory';
    };
  };
};
export class ApplicationSourceWiringError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'ApplicationSourceWiringError'; this.code = code; }
}
const PRODUCER = 'smallbusiness-application-source-wiring-v1' as const;
const sha = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const fail = (code: string, message: string): never => { throw new ApplicationSourceWiringError(code, message); };
const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function text(v: unknown, label: string, maximum = 1024): string {
  if (typeof v !== 'string' || !v.length || v.length > maximum || v.includes('\0')) fail('INVALID_WIRING_CONFIGURATION', `${label} must be a bounded nonempty string`);
  return v as string;
}
function staticData(v: unknown, active = new Set<object>()): void {
  if (v === undefined || v === null || ['string', 'boolean'].includes(typeof v) || typeof v === 'number' && Number.isFinite(v)) return;
  if (typeof v !== 'object' || !Array.isArray(v) && !plain(v) || Array.isArray(v) && Object.getPrototypeOf(v) !== Array.prototype || active.has(v)) fail('INVALID_WIRING_CONFIGURATION', 'Source facts require plain acyclic static data');
  active.add(v);
  for (const key of Reflect.ownKeys(v)) {
    const d = Object.getOwnPropertyDescriptor(v, key)!;
    if (typeof key !== 'string' || !('value' in d)) fail('INVALID_WIRING_CONFIGURATION', 'Source facts must not execute getters');
    staticData(d.value, active);
  }
  active.delete(v);
}
function sourcePath(v: unknown): string {
  const file = text(v, 'source file');
  if (!/^src\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:[cm]?[jt]s|jsx|tsx)$/.test(file) || file.split('/').some(p => ['.', '..', '__tests__', '__fixtures__', 'test', 'tests', 'fixtures', 'node_modules', 'dist', 'coverage'].includes(p)) || /\.(?:test|spec)\.[^.]+$/i.test(file)) fail('UNSAFE_WIRING_SOURCE', 'Wiring reads only explicitly admitted production src JS/TS files');
  return file;
}
function sourceSelector(v: unknown, admitted: Set<string>): DeveloperSourceSelector {
  if (!plain(v) || Object.keys(v).some(k => !['file', 'symbol', 'unitId', 'stageId', 'role'].includes(k))) fail('INVALID_WIRING_SELECTOR', 'Expected a static source-unit selector');
  const s = v as DeveloperSourceSelector, file = sourcePath(s.file);
  if (!admitted.has(file)) fail('WIRING_SOURCE_NOT_ADMITTED', `Source is not admitted: ${file}`);
  for (const key of ['symbol', 'unitId', 'stageId', 'role'] as const) if (s[key] !== undefined) text(s[key], 'source selector');
  if (!['symbol', 'unitId', 'stageId', 'role'].some(k => (s as Record<string, unknown>)[k] !== undefined)) fail('INVALID_WIRING_SELECTOR', 'Select a precise callable, callback or expression unit; a whole-file selector is not wiring evidence');
  return { ...s, file };
}
async function read(root: string, file: string): Promise<{ text: string; sha256: string }> {
  let filename = root;
  for (const component of file.split('/')) {
    filename = path.join(filename, component);
    const stat = await fs.lstat(filename);
    if (stat.isSymbolicLink()) fail('WIRING_SYMLINK_NOT_ADMITTED', `Source facts do not follow symlinks: ${file}`);
  }
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!(await handle.stat()).isFile()) fail('UNSAFE_WIRING_SOURCE', 'Admitted source must be a regular file');
    const bytes = await handle.readFile(), value = bytes.toString('utf8');
    if (!Buffer.from(value).equals(bytes)) fail('UNSUPPORTED_WIRING_ENCODING', 'Admitted source must be original UTF-8');
    return { text: value, sha256: sha(bytes) };
  } finally { await handle.close(); }
}
function boundary(value: string, offset: number): boolean {
  return !(offset > 0 && offset < value.length && /[\uD800-\uDBFF]/.test(value[offset - 1]!) && /[\uDC00-\uDFFF]/.test(value[offset]!));
}
function span(value: string, start: unknown, end: unknown, textSha256: unknown): { start: number; end: number } {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (start as number) < 0 || (end as number) <= (start as number) || (end as number) > value.length || !boundary(value, start as number) || !boundary(value, end as number) || !hash(textSha256) || sha(value.slice(start as number, end as number)) !== textSha256) fail('INVALID_WIRING_SOURCE_PROOF', 'A selected source range does not match current bytes');
  return { start: start as number, end: end as number };
}
function unitProof(file: string, module: { text: string; sha256: string }, unit: DeveloperSourceUnit): ApplicationSourceWiringProof {
  if (!plain(unit)) fail('INVALID_WIRING_SOURCE_PROOF', 'A source unit must be plain static data');
  const { start, end } = span(module.text, unit.start, unit.end, unit.textSha256);
  const byteStart = Buffer.byteLength(module.text.slice(0, start)), byteEnd = Buffer.byteLength(module.text.slice(0, end));
  const startLine = module.text.slice(0, start).split('\n').length, endLine = module.text.slice(0, end).split('\n').length;
  if (unit.byteStart !== byteStart || unit.byteEnd !== byteEnd || unit.startLine !== startLine || unit.endLine !== endLine) fail('INVALID_WIRING_SOURCE_PROOF', 'Source-unit offsets/lines do not match current bytes');
  text(unit.id, 'unit ID'); text(unit.symbol, 'unit symbol');
  if (!['function', 'binding', 'callback', 'expression', 'state-access'].includes(unit.kind)) fail('INVALID_WIRING_SOURCE_PROOF', 'Unsupported source-unit kind');
  for (const key of ['owner', 'role', 'stageId', 'field'] as const) if (unit[key] !== undefined) text(unit[key], 'unit metadata');
  if (unit.access !== undefined && !['read', 'write'].includes(unit.access) || unit.sourceForm !== undefined && !['object-method', 'object-property', 'class-method'].includes(unit.sourceForm)) fail('INVALID_WIRING_SOURCE_PROOF', 'Unsupported source-unit metadata');
  return { file, moduleSha256: module.sha256, start, end, byteStart, byteEnd, startLine, endLine, textSha256: unit.textSha256 };
}
function projectedUnit(unit: DeveloperSourceUnit): DeveloperSourceUnit {
  const { id, kind, symbol, owner, role, stageId, sourceForm, field, access, start, end, byteStart, byteEnd, startLine, endLine, textSha256 } = unit;
  return { id, kind, symbol, ...(owner === undefined ? {} : { owner }), ...(role === undefined ? {} : { role }), ...(stageId === undefined ? {} : { stageId }), ...(sourceForm === undefined ? {} : { sourceForm }), ...(field === undefined ? {} : { field }), ...(access === undefined ? {} : { access }), start, end, byteStart, byteEnd, startLine, endLine, textSha256 };
}
function sameProof(a: ApplicationSourceWiringProof, b: ApplicationSourceWiringProof): boolean {
  return ['file', 'moduleSha256', 'start', 'end', 'byteStart', 'byteEnd', 'startLine', 'endLine', 'textSha256'].every(key => (a as unknown as Record<string, unknown>)[key] === (b as unknown as Record<string, unknown>)[key]);
}
function knownProof(value: DeveloperKnownSourceSpan, current: Map<string, { text: string; sha256: string }>): DeveloperKnownSourceSpan {
  if (!plain(value) || Object.keys(value).some(k => !['file', 'moduleSha256', 'start', 'end', 'textSha256'].includes(k))) fail('INVALID_WIRING_KNOWN_SPAN', 'Expected an explicit current known source span');
  const file = sourcePath(value.file), source = current.get(file);
  if (!source) return fail('STALE_WIRING_KNOWN_SPAN', 'Known source does not match an admitted current module');
  if (value.moduleSha256 !== source.sha256) fail('STALE_WIRING_KNOWN_SPAN', 'Known source does not match an admitted current module');
  span(source.text, value.start, value.end, value.textSha256);
  return { file, moduleSha256: value.moduleSha256, start: value.start, end: value.end, textSha256: value.textSha256 };
}
const escaped = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\r?\n/g, ' ');
function fence(value: string, language: string): string {
  const mark = '`'.repeat(Math.max(3, ...[...value.matchAll(/`+/g)].map(x => x[0].length + 1)));
  return `${mark}${language}\n${value}\n${mark}`;
}
function renderCompact(entries: readonly ApplicationSourceWiringEntry[]): string {
  const lines = ['# Current source wiring', '', 'Exact current source; labels are caller-trusted syntax, not runtime proof. Entry numbers index the full proofs. Supplied-source claims do not prove model memory.', ''];
  const files = [...new Set(entries.map(entry => entry.proof.file))].sort(compare);
  for (const file of files) {
    const grouped = entries.map((entry, index) => ({ entry, ordinal: index + 1 })).filter(item => item.entry.proof.file === file);
    lines.push(`${escaped(file)} · SHA-256 ${grouped[0]!.entry.proof.moduleSha256}`, '');
    for (const { entry, ordinal } of grouped) {
      const p = entry.proof, u = entry.unit;
      const line = p.startLine === p.endLine ? `${p.startLine}` : `${p.startLine}-${p.endLine}`;
      // IDs, owners, offsets and both hashes stay in the proof object. The
      // source already spells out arguments/callees; do not repeat those names
      // alongside the stage ID on every text line.
      lines.push(`${ordinal}. L${line} · ${escaped(u.role ?? u.kind)} · ${escaped(u.stageId ?? u.symbol)}`);
      if (entry.status === 'current-source') lines.push(fence(entry.text!, /\.(?:ts|tsx|mts|cts)$/.test(p.file) ? 'ts' : 'js'));
      else if (entry.status === 'already-supplied') lines.push(`Already supplied: verified current span ${entry.suppliedBy!.start}:${entry.suppliedBy!.end}; body omitted. Inspect again for a concrete gap.`);
      else lines.push(`Same current source as entry ${entries.findIndex(prior => prior.id === entry.includedBy) + 1}; body omitted.`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
function render(entries: readonly ApplicationSourceWiringEntry[], format?: 'compact'): string {
  if (format === 'compact') return renderCompact(entries);
  const lines = ['# Current source wiring', '', 'Exact current source-catalog units. Catalog identities/roles and flow membership are caller-trusted static syntax, not inferred business semantics or runtime effects. Prior exposure is caller-declared, not proof of model memory.', ''];
  for (const entry of entries) {
    const p = entry.proof, u = entry.unit;
    lines.push(`## ${escaped(entry.id)}`, '', `${escaped(p.file)}:${p.startLine}-${p.endLine} · ${escaped(u.kind)} ${escaped(u.symbol)}${u.owner ? ' · owner ' + escaped(u.owner) : ''}${u.role ? ' · role ' + escaped(u.role) : ''}${u.stageId ? ' · stage ' + escaped(u.stageId) : ''}${entry.flowId ? ' · declared flow ' + escaped(entry.flowId) : ''}`, `Source ${p.start}:${p.end}; module SHA-256 ${p.moduleSha256}; unit SHA-256 ${p.textSha256}.`);
    if (entry.status === 'current-source') lines.push('', fence(entry.text!, /\.(?:ts|tsx|mts|cts)$/.test(p.file) ? 'ts' : 'js'));
    else if (entry.status === 'already-supplied') lines.push('', `Already supplied according to the caller's current known span ${entry.suppliedBy!.start}:${entry.suppliedBy!.end}; body is not repeated. Inspect it again if a concrete gap requires it.`);
    else lines.push('', `Exact current source already included by ${escaped(entry.includedBy!)}; body is not repeated.`);
    lines.push('');
  }
  return lines.join('\n');
}

/** A canonical catalog can contain complete named callables or AST-derived call/assignment expression units.
 * This API checks their current physical source, not the parser's authenticity or callback semantics.
 */
export async function buildApplicationSourceWiring(options: {
  readonly root: string; readonly sourceFiles: readonly string[]; readonly sourceManifest: DeveloperSourceManifest;
  readonly selections: readonly ApplicationSourceWiringSelection[];
  readonly knownSpans?: readonly DeveloperKnownSourceSpan[];
  /** Omit repeated per-entry hashes in the text; complete source/proof entries remain unchanged. */
  readonly format?: 'compact';
  /** Rendered text budget; no partial source or silently omitted entry is returned. */
  readonly characterBudget?: number;
}): Promise<ApplicationSourceWiring> {
  staticData(options);
  const root = await fs.realpath(options.root), catalog = options.sourceManifest, budget = options.characterBudget ?? 24000;
  if (options.format !== undefined && options.format !== 'compact') fail('INVALID_WIRING_FORMAT', 'Source-wiring format must be omitted or compact');
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 1000000) fail('INVALID_WIRING_BUDGET', 'Rendered source-wiring budget must be 1..1000000 characters');
  if (!plain(catalog) || catalog.schemaVersion !== 1 || catalog.scope !== 'source-only-static-syntax' || !plain(catalog.files) || !hash(catalog.sourceTreeSha256)) fail('INVALID_WIRING_SOURCE_MANIFEST', 'Expected a caller-trusted canonical source-only catalog');
  if (!Array.isArray(options.sourceFiles) || !options.sourceFiles.length || options.sourceFiles.length > 512) fail('INVALID_WIRING_CONFIGURATION', 'Declare 1..512 production source files');
  const files = options.sourceFiles.map(sourcePath).sort(compare), admitted = new Set(files);
  if (new Set(files.map(f => f.toLowerCase())).size !== files.length) fail('INVALID_WIRING_CONFIGURATION', 'Admitted source files must be distinct, including case');
  if (!Array.isArray(options.selections) || !options.selections.length || options.selections.length > 512) fail('INVALID_WIRING_CONFIGURATION', 'Declare 1..512 precise source selections');
  const ids = new Set<string>();
  const selections = options.selections.map(value => {
    if (!plain(value) || Object.keys(value).some(k => !['id', 'source', 'flowId'].includes(k))) fail('INVALID_WIRING_CONFIGURATION', 'Source selections require only an ID, selector and optional declared flow');
    const id = text(value.id, 'selection ID', 256); if (ids.has(id)) fail('INVALID_WIRING_CONFIGURATION', 'Duplicate source selection ID'); ids.add(id);
    if (value.flowId !== undefined) text(value.flowId, 'declared flow ID', 256);
    return { id, source: sourceSelector(value.source, admitted), ...(value.flowId === undefined ? {} : { flowId: value.flowId }) };
  }).sort((a, b) => compare(a.id, b.id));
  const current = new Map<string, { text: string; sha256: string }>(); let characters = 0;
  for (const file of files) { const value = await read(root, file); characters += value.text.length; if (characters > 10000000) fail('APPLICATION_WIRING_SOURCE_LIMIT', 'Admitted source exceeds ten million characters'); current.set(file, value); }
  for (const file of files) { const record = Object.getOwnPropertyDescriptor(catalog.files, file)?.value; const value = current.get(file)!; if (!plain(record) || record.sha256 !== value.sha256 || record.characters !== value.text.length || record.lines !== value.text.split('\n').length || record.parseStatus !== 'parsed' || !Array.isArray(record.units)) fail('STALE_WIRING_SOURCE_MANIFEST', `Source catalog is unsupported or differs from current source: ${file}`); }
  if (options.knownSpans !== undefined && (!Array.isArray(options.knownSpans) || options.knownSpans.length > 512)) fail('INVALID_WIRING_KNOWN_SPAN', 'Known source spans must be a bounded explicit list');
  const known = (options.knownSpans ?? []).map(k => knownProof(k, current));
  const entries: ApplicationSourceWiringEntry[] = [], delivered = new Map<string, string>();
  for (const selected of selections) {
    const s = selected.source, module = current.get(s.file)!, record = catalog.files[s.file]!;
    const matches = record.units.filter(u => (s.unitId === undefined || u.id === s.unitId) && (s.symbol === undefined || u.symbol === s.symbol) && (s.stageId === undefined || u.stageId === s.stageId) && (s.role === undefined || u.role === s.role));
    if (!matches.length) fail('UNRESOLVED_WIRING_SOURCE', `No current catalog unit matches ${selected.id}`);
    const proofs = matches.map(unit => ({ unit, proof: unitProof(s.file, module, unit) }));
    if (new Set(proofs.map(p => `${p.proof.start}:${p.proof.end}:${p.proof.textSha256}`)).size !== 1) fail('AMBIGUOUS_WIRING_SOURCE', `Source selection is ambiguous: ${selected.id}`);
    proofs.sort((a, b) => compare(a.unit.id, b.unit.id)); const { proof } = proofs[0]!, unit = projectedUnit(proofs[0]!.unit);
    const key = `${proof.file}:${proof.moduleSha256}:${proof.start}:${proof.end}:${proof.textSha256}`, includedBy = delivered.get(key);
    const suppliedBy = known.find(k => k.file === s.file && k.start <= proof.start && k.end >= proof.end);
    const base = { id: selected.id, ...(selected.flowId === undefined ? {} : { flowId: selected.flowId }), selector: s, unit, matchingUnitIds: [...new Set(matches.map(u => u.id))].sort(compare), proof };
    if (suppliedBy) entries.push({ ...base, status: 'already-supplied', suppliedBy });
    else if (includedBy) entries.push({ ...base, status: 'already-included', includedBy });
    else { entries.push({ ...base, status: 'current-source', text: module.text.slice(proof.start, proof.end) }); delivered.set(key, selected.id); }
  }
  const rendered = render(entries, options.format); if (rendered.length > budget) fail('APPLICATION_WIRING_BUDGET_EXCEEDED', 'Complete source wiring exceeds the declared rendered-text budget; no source was clipped or entry omitted');
  const sourceHashes = Object.fromEntries(files.map(f => [f, current.get(f)!.sha256]));
  for (const file of files) if ((await read(root, file)).sha256 !== sourceHashes[file]) fail('SOURCE_CHANGED_DURING_WIRING_BUILD', `Source changed while constructing current facts: ${file}`);
  return { text: rendered, entries, manifest: { schemaVersion: 1, producer: PRODUCER, sourceTreeSha256: sha(JSON.stringify(Object.entries(sourceHashes))), sourceHashes, catalogSourceTreeSha256: catalog.sourceTreeSha256, ...(options.format === undefined ? {} : { format: options.format }), characters: rendered.length, textSha256: sha(rendered), characterBudget: budget, coverage: { scope: 'explicit-selected-source-catalog-units', catalogOrigin: 'caller-trusted-static-syntax', currentBytesVerified: true, completeApplication: false, runtimeEffectsVerified: false, knownSpanOrigin: 'caller-declared-prior-exposure-not-model-memory' } } };
}

/** Revalidate a prepared artifact before using it in a README/packet; this performs no application imports or writes. */
export async function validateApplicationSourceWiring(options: { readonly root: string; readonly wiring: ApplicationSourceWiring }): Promise<{ valid: true; sourceTreeSha256: string; entries: number }> {
  staticData(options);
  const root = await fs.realpath(options.root), w = options.wiring, m = w?.manifest;
  if (!plain(w) || !plain(m) || m.schemaVersion !== 1 || m.producer !== PRODUCER || !plain(m.sourceHashes) || !Array.isArray(w.entries) || !w.entries.length || w.entries.length > 512 || !plain(m.coverage) || m.coverage.scope !== 'explicit-selected-source-catalog-units' || m.coverage.catalogOrigin !== 'caller-trusted-static-syntax' || m.coverage.currentBytesVerified !== true || m.coverage.completeApplication !== false || m.coverage.runtimeEffectsVerified !== false || m.coverage.knownSpanOrigin !== 'caller-declared-prior-exposure-not-model-memory' || !hash(m.catalogSourceTreeSha256)) fail('INVALID_APPLICATION_SOURCE_WIRING', 'Expected an exact source-only wiring artifact');
  if (m.format !== undefined && m.format !== 'compact') fail('INVALID_APPLICATION_SOURCE_WIRING', 'Unknown prepared source-wiring format');
  const files = Object.keys(m.sourceHashes).sort(compare); if (!files.length || files.length > 512) fail('INVALID_APPLICATION_SOURCE_WIRING', 'Invalid admitted source inventory');
  const current = new Map<string, { text: string; sha256: string }>();
  for (const file of files) { sourcePath(file); const value = await read(root, file); if (value.sha256 !== m.sourceHashes[file]) fail('STALE_APPLICATION_SOURCE_WIRING', `Prepared source facts differ from current source: ${file}`); current.set(file, value); }
  if (sha(JSON.stringify(files.map(file => [file, m.sourceHashes[file]]))) !== m.sourceTreeSha256) fail('INVALID_APPLICATION_SOURCE_WIRING', 'Source identity differs');
  const seen = new Map<string, ApplicationSourceWiringEntry>(), admitted = new Set(files);
  for (const e of w.entries) {
    if (!plain(e) || seen.has(text(e.id, 'entry ID', 256))) fail('INVALID_APPLICATION_SOURCE_WIRING', 'Wiring entries require distinct IDs');
    if (e.flowId !== undefined) text(e.flowId, 'declared flow ID', 256);
    const s = sourceSelector(e.selector, admitted), value = current.get(s.file)!;
    const p = unitProof(s.file, value, e.unit);
    if ((s.unitId !== undefined && s.unitId !== e.unit.id) || (s.symbol !== undefined && s.symbol !== e.unit.symbol) || (s.stageId !== undefined && s.stageId !== e.unit.stageId) || (s.role !== undefined && s.role !== e.unit.role)) fail('INVALID_APPLICATION_SOURCE_WIRING', 'Entry selector does not identify its selected catalog unit');
    if (!plain(e.proof) || !sameProof(p, e.proof) || e.proof.file !== s.file || !Array.isArray(e.matchingUnitIds) || !e.matchingUnitIds.length || e.matchingUnitIds.some(id => typeof id !== 'string') || !e.matchingUnitIds.includes(e.unit.id)) fail('INVALID_APPLICATION_SOURCE_WIRING', 'Entry source proof differs');
    if (e.status === 'current-source') { if (e.text !== value.text.slice(p.start, p.end) || e.includedBy !== undefined || e.suppliedBy !== undefined) fail('INVALID_APPLICATION_SOURCE_WIRING', 'Source text differs from current selected bytes'); }
    else if (e.status === 'already-supplied') { const known = knownProof(e.suppliedBy!, current); if (e.text !== undefined || e.includedBy !== undefined || known.file !== p.file || known.start > p.start || known.end < p.end) fail('INVALID_APPLICATION_SOURCE_WIRING', 'Known source does not cover the selected unit'); }
    else if (e.status === 'already-included') { const prior = seen.get(e.includedBy!); if (e.text !== undefined || e.suppliedBy !== undefined || prior?.status !== 'current-source' || !sameProof(prior.proof, p)) fail('INVALID_APPLICATION_SOURCE_WIRING', 'Repeated source does not identify its prior current body'); }
    else fail('INVALID_APPLICATION_SOURCE_WIRING', 'Unknown source-delivery status');
    seen.set(e.id, e);
  }
  const rendered = render(w.entries, m.format);
  if (w.text !== rendered || rendered.length !== m.characters || sha(rendered) !== m.textSha256 || !Number.isSafeInteger(m.characterBudget) || m.characterBudget < 1 || m.characterBudget > 1000000 || rendered.length > m.characterBudget) fail('INVALID_APPLICATION_SOURCE_WIRING', 'Rendered source text or budget proof differs');
  for (const file of files) if ((await read(root, file)).sha256 !== m.sourceHashes[file]) fail('SOURCE_CHANGED_DURING_WIRING_BUILD', `Source changed while verifying current facts: ${file}`);
  return { valid: true, sourceTreeSha256: m.sourceTreeSha256, entries: w.entries.length };
}
