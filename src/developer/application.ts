/** Optional Node/build tooling for an explicitly admitted application. No application module is imported. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { DeveloperSourceManifest, DeveloperSourceSelector, DeveloperSourceUnit } from './types.js';
export { buildApplicationFlowDocumentation, checkApplicationFlowDocumentation, writeApplicationFlowDocumentation, ApplicationFlowDocumentationError } from './application-flow-docs.js';
export type { ApplicationDocumentationChart, ApplicationDocumentationFlow, ApplicationFlowDocumentationIndex, ApplicationFlowDocumentation, ApplicationFlowDocumentationOutputOptions } from './application-flow-docs.js';

export type ApplicationDeveloperFlow = {
  readonly id: string; readonly description?: string; readonly tags?: readonly string[];
  readonly sources: readonly DeveloperSourceSelector[];
  readonly relatedSources?: readonly DeveloperSourceSelector[];
  readonly relatedFlowIds?: readonly string[];
  /** A trusted construction-time SDK chart. Only its export method is called; never an executor. */
  readonly chart?: { toMermaid(): string };
  /** A caller-declared diagram, not a verified SDK export. Mutually exclusive with chart. */
  readonly diagram?: string;
  readonly opaqueBoundaries?: readonly string[];
};
export type ApplicationDeveloperIndex = {
  readonly applicationName: string;
  readonly sourceFiles: readonly string[];
  readonly flows: readonly ApplicationDeveloperFlow[];
  readonly development: {
    readonly entry: { readonly file: string; readonly exportName: string; readonly signature?: string };
    readonly commands: { readonly test: string; readonly build?: string; readonly typecheck?: string };
    /** This is an explicit approval to include this public example. A declared file is read and hash-bound. */
    readonly smokeTest: { readonly file?: string; readonly text?: string; readonly sha256?: string };
    /** Explicit approval to supply current public tooling/configuration bytes, never execute them. */
    readonly supportFiles?: readonly { readonly file: string; readonly purpose: string }[];
    readonly regressionTestDirectory?: string;
    readonly protectedFiles?: readonly string[];
  };
};
export type ApplicationDeveloperPacketOptions = {
  readonly format: 'compact';
  /** Caller-declared contracts for admitted, explicitly protected source whose body may be omitted. */
  readonly referenceSources?: readonly { readonly file: string; readonly contract: string }[];
};
export type ApplicationDeveloperSupportProof = {
  readonly file: string; readonly purpose: string; readonly sha256: string; readonly characters: number;
  readonly packetStart: number; readonly packetEnd: number;
};
export type ApplicationDeveloperReferenceProof = {
  readonly file: string; readonly moduleSha256: string; readonly moduleCharacters: number;
  readonly contract: string; readonly contractOrigin: 'caller-declared'; readonly sourceDelivered: false;
  readonly packetStart: number; readonly packetEnd: number;
  readonly requestedSelectors: readonly DeveloperSourceSelector[]; readonly resolvedUnits: readonly DeveloperSourceUnit[];
};
export type ApplicationDeveloperSourceProof = {
  readonly file: string; readonly moduleSha256: string; readonly sourceSha256: string;
  readonly start: number; readonly end: number; readonly startLine: number; readonly endLine: number;
  readonly packetStart: number; readonly packetEnd: number; readonly sourceForm: 'complete-module';
  readonly requestedSelectors: readonly DeveloperSourceSelector[];
  readonly resolvedUnits: readonly DeveloperSourceUnit[];
};
export type ApplicationDeveloperContext = {
  readonly indexText: string; readonly packetText: string;
  readonly manifest: {
    readonly schemaVersion: 1; readonly producer: 'smallbusiness-application-context-v1';
    readonly applicationName: string; readonly goal: string; readonly sourceTreeSha256: string;
    readonly sourceHashes: Readonly<Record<string, string>>;
    readonly indexSha256: string; readonly packetSha256: string;
    readonly indexCharacters: number; readonly packetCharacters: number; readonly characterBudget: number;
    readonly selectedFlowIds: readonly string[]; readonly selection: readonly { readonly id: string; readonly score: number; readonly selected: boolean }[];
    readonly sources: readonly ApplicationDeveloperSourceProof[];
    readonly packetFormat?: 'compact';
    readonly sourceReferences?: readonly ApplicationDeveloperReferenceProof[];
    readonly supportFiles?: readonly ApplicationDeveloperSupportProof[];
    readonly developmentFacts?: {
      readonly entry: ApplicationDeveloperIndex['development']['entry']; readonly commands: ApplicationDeveloperIndex['development']['commands'];
      readonly regressionTestDirectory?: string; readonly regressionEntryImport?: string;
      readonly packetStart: number; readonly packetEnd: number; readonly textSha256: string;
    };
    readonly publicSmoke: { readonly origin: 'current-file' | 'caller-approved-literal'; readonly file?: string; readonly sha256: string; readonly characters: number; readonly packetStart: number; readonly packetEnd: number };
    readonly packageFile?: { readonly file: string; readonly sha256: string };
    readonly coverage: { readonly scope: 'admitted-application-source'; readonly allAdmittedSourceDelivered: boolean; readonly completeApplication: false; readonly semantics: 'source-not-runtime-proof' };
    readonly topology: readonly { readonly flowId: string; readonly origin: 'caller-trusted-chart-export' | 'caller-declared' | 'not-supplied'; readonly sha256?: string }[];
    /** Application-declared files/directory prefixes that documentation writers must never alter. */
    readonly protectedPaths: readonly string[];
    readonly boundaries: readonly string[];
  };
};
export class ApplicationDeveloperContextError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'ApplicationDeveloperContextError'; this.code = code; }
}
const PRODUCER = 'smallbusiness-application-context-v1' as const;
const BEGIN = '<!-- BEGIN SMALLBUSINESS APPLICATION CONTEXT -->';
const END = '<!-- END SMALLBUSINESS APPLICATION CONTEXT -->';
const OWNERSHIP = '.smallbusiness-context.json';
const GENERATED = ['index.md', 'packet.md', 'manifest.json'] as const;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const fail = (code: string, message: string): never => { throw new ApplicationDeveloperContextError(code, message); };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function staticData(value: unknown, route: string[] = [], active = new Set<object>()): void {
  // The one deliberately executable input is an explicit caller-trusted chart exporter.
  if (route.length === 4 && route[0] === 'index' && route[1] === 'flows' && /^\d+$/.test(route[2]!) && route[3] === 'chart') return;
  if (value === undefined || value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('INVALID_INDEX', 'Static context data requires finite numbers'); return; }
  if (typeof value !== 'object' || !Array.isArray(value) && !plain(value) || Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype) fail('INVALID_INDEX', 'Context configuration must be plain static data');
  const object = value as object;
  if (active.has(object)) fail('INVALID_INDEX', 'Context configuration must not contain cycles');
  active.add(object);
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key !== 'string') fail('INVALID_INDEX', 'Static context configuration has an unsupported symbolic key');
    const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
    if (!('value' in descriptor)) fail('INVALID_INDEX', 'Static context configuration must not execute getters');
    staticData(descriptor.value, [...route, key as string], active);
  }
  active.delete(object);
}
function text(value: unknown, name: string, maximum = 8192): string {
  if (typeof value !== 'string' || !value.length || value.length > maximum || value.includes('\0')) fail('INVALID_INDEX', `${name} must be a nonempty bounded string`);
  return value as string;
}
function relative(value: unknown, name: string, source = false, output = false): string {
  const file = text(value, name, 1024);
  if (path.isAbsolute(file) || file.includes('\\') || file.split('/').some((p, i) => !/^[A-Za-z0-9_.-]+$/.test(p) || p === '.' || p === '..' || p.startsWith('.') && !(output && i === 0 && p === '.work-tmp') || ['node_modules', 'dist', 'coverage', '__fixtures__', '.git'].includes(p))) fail('UNSAFE_PATH', `${name} must stay in explicitly admitted project files`);
  if (source && (!file.startsWith('src/') || !/\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/.test(file) || file.split('/').some(p => ['__tests__', 'test', 'tests', 'fixtures'].includes(p)) || /\.(test|spec)\.[^.]+$/.test(file))) fail('UNSAFE_SOURCE', 'Application production source must be an explicitly admitted src JS/TS file');
  return file;
}
function selector(value: DeveloperSourceSelector, admitted: Set<string>): DeveloperSourceSelector {
  if (!plain(value)) fail('INVALID_SELECTOR', 'A source selector must be a plain object');
  const keys = Object.keys(value);
  if (keys.some(k => !['file', 'symbol', 'unitId', 'stageId', 'role'].includes(k))) fail('INVALID_SELECTOR', 'Unknown source selector field');
  const file = relative(value.file, 'source selector', true);
  if (!admitted.has(file)) fail('SOURCE_NOT_ADMITTED', `Source selector is not admitted: ${file}`);
  for (const key of ['symbol', 'unitId', 'stageId', 'role'] as const) if (value[key] !== undefined) text(value[key], key, 512);
  return { ...value, file };
}
function supportPath(value: unknown): string {
  const file = relative(value, 'approved public support file');
  const blocked = new Set(['src', 'source', 'sources', 'lib', 'app', 'apps', '__tests__', 'test', 'tests', 'fixture', 'fixtures', '__fixtures__', 'private', 'secrets', 'credentials', 'node_modules', 'dist', 'coverage', 'vendor']);
  if (file.split('/').some(p => blocked.has(p.toLowerCase())) || /\.(?:test|spec)\.[^.]+$/i.test(file)) fail('UNSAFE_SUPPORT_SOURCE', 'Support files must be explicitly public tooling/configuration, outside production, private test and fixture scopes');
  return file;
}
function protectedSource(file: string, protectedPaths: readonly string[]): boolean {
  const value = file.toLowerCase();
  return protectedPaths.some(p => { const root = p.replace(/\/$/, '').toLowerCase(); return value === root || p.endsWith('/') && value.startsWith(root + '/'); });
}
function compactDevelopmentFacts(dev: Pick<ApplicationDeveloperIndex['development'], 'entry' | 'commands' | 'regressionTestDirectory'>): { text: string; regressionEntryImport?: string } {
  let regressionEntryImport: string | undefined;
  if (dev.regressionTestDirectory) {
    regressionEntryImport = path.posix.relative(dev.regressionTestDirectory, dev.entry.file);
    if (!regressionEntryImport.startsWith('.')) regressionEntryImport = './' + regressionEntryImport;
  }
  return {
    text: `PUBLIC DEVELOPMENT FACTS (caller-declared contracts; commands not executed)\nEntry: ${dev.entry.file}#${dev.entry.exportName}${dev.entry.signature ? ' — ' + dev.entry.signature : ''}\nCommands: ${JSON.stringify(dev.commands)}\n${dev.regressionTestDirectory ? 'New regression tests: ' + dev.regressionTestDirectory + '\n' : ''}${regressionEntryImport ? 'Path-derived import for a test directly in that directory: ' + JSON.stringify(regressionEntryImport) + ', export ' + dev.entry.exportName + ' (path fact, not execution verification)\n' : ''}`,
    ...(regressionEntryImport ? { regressionEntryImport } : {}),
  };
}
async function target(root: string, file: string, missing = false): Promise<string> {
  let current = root;
  const parts = file.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]!);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) fail('SYMLINK_NOT_ADMITTED', `Context tooling does not follow symlinks: ${file}`);
      if (i < parts.length - 1 && !stat.isDirectory()) fail('UNSAFE_PATH', `Source ancestor is not a directory: ${file}`);
    } catch (error) { if (missing && (error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
  }
  return current;
}
async function read(root: string, file: string): Promise<{ text: string; sha256: string }> {
  const filename = await target(root, file);
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!(await handle.stat()).isFile()) fail('UNSAFE_PATH', `Expected a regular file: ${file}`);
    const bytes = await handle.readFile(), content = bytes.toString('utf8');
    if (!Buffer.from(content).equals(bytes)) fail('UNSUPPORTED_ENCODING', `Expected original UTF-8 source: ${file}`);
    return { text: content, sha256: sha(bytes) };
  } finally { await handle.close(); }
}
function fence(content: string, language = ''): string {
  const mark = '`'.repeat(Math.max(3, ...[...content.matchAll(/`+/g)].map(m => m[0].length + 1)));
  return `${mark}${language}\n${content}\n${mark}`;
}
function tokens(value: string): Set<string> {
  const words = value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'change', 'implement', 'please']);
  return new Set(words.filter(w => w.length > 2 && !stop.has(w)).map(w => w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
}
function resolvedUnits(manifest: DeveloperSourceManifest | undefined, selected: DeveloperSourceSelector[], file: string, current: { text: string; sha256: string }): DeveloperSourceUnit[] {
  if (!manifest) return [];
  const record = Object.getOwnPropertyDescriptor(manifest.files, file)?.value;
  if (!record || record.sha256 !== current.sha256) fail('STALE_SOURCE_MANIFEST', `Source manifest differs from current admitted file: ${file}`);
  const units: DeveloperSourceUnit[] = [];
  for (const request of selected) {
    const narrow = request.symbol || request.unitId || request.stageId || request.role;
    if (!narrow) continue;
    let matches = record.units.filter((u: DeveloperSourceUnit) => (request.symbol === undefined || u.symbol === request.symbol) && (request.unitId === undefined || u.id === request.unitId) && (request.stageId === undefined || u.stageId === request.stageId) && (request.role === undefined || u.role === request.role));
    // Distinct roles sharing an exact complete source range are not ambiguous code.
    matches = [...new Map(matches.map((u: DeveloperSourceUnit) => [`${u.start}:${u.end}:${u.textSha256}`, u])).values()];
    if (matches.length !== 1) fail('UNRESOLVED_SOURCE_SELECTOR', `Source selector is missing or ambiguous: ${file}`);
    const unit = matches[0]!;
    if (!Number.isSafeInteger(unit.start) || !Number.isSafeInteger(unit.end) || unit.start < 0 || unit.end <= unit.start || unit.end > current.text.length || sha(current.text.slice(unit.start, unit.end)) !== unit.textSha256 || unit.byteStart !== Buffer.byteLength(current.text.slice(0, unit.start)) || unit.byteEnd !== Buffer.byteLength(current.text.slice(0, unit.end)) || unit.startLine !== current.text.slice(0, unit.start).split('\n').length || unit.endLine !== current.text.slice(0, unit.end).split('\n').length) fail('INVALID_SOURCE_PROOF', `Source unit geometry does not match current bytes: ${file}`);
    if (!units.some(u => u.id === unit.id)) units.push(unit);
  }
  return units;
}
/** Build a task packet from current explicitly admitted source. Complete small modules preserve their local imports/helpers.
 * Optional catalogs validate precise selector identities; this first version packs complete selected modules, never clipped fragments.
 * Configured diagrams and exported charts are caller-trusted static topology, not runtime or provider-effect evidence.
 */
export async function buildApplicationDeveloperContext(options: {
  readonly root: string; readonly index: ApplicationDeveloperIndex; readonly goal: string;
  readonly sourceManifest?: DeveloperSourceManifest; readonly characterBudget?: number;
  readonly packetOptions?: ApplicationDeveloperPacketOptions;
}): Promise<ApplicationDeveloperContext> {
  staticData(options);
  const root = await fs.realpath(options.root), index = options.index;
  if (!plain(index)) fail('INVALID_INDEX', 'Application index must be an explicit plain object');
  const name = text(index.applicationName, 'applicationName', 160), goal = text(options.goal, 'goal', 16384), budget = options.characterBudget ?? 12000;
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 1000000) fail('INVALID_BUDGET', 'Context character budget must be 1..1000000');
  if (!Array.isArray(index.sourceFiles) || index.sourceFiles.length < 1 || index.sourceFiles.length > 512) fail('INVALID_INDEX', 'Declare 1..512 production source files');
  const files = index.sourceFiles.map(f => relative(f, 'sourceFiles', true)).sort(compare), admitted = new Set(files);
  if (admitted.size !== files.length) fail('INVALID_INDEX', 'Duplicate admitted production source');
  if (!Array.isArray(index.flows) || index.flows.length < 1 || index.flows.length > 512) fail('INVALID_INDEX', 'Declare 1..512 application flows');
  const flows = index.flows.slice().sort((a, b) => compare(a.id, b.id)), ids = new Set<string>();
  for (const flow of flows) {
    if (!plain(flow) || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(flow.id) || ids.has(flow.id)) fail('INVALID_INDEX', 'Application flow IDs must be unique stable strings');
    ids.add(flow.id); if (flow.description !== undefined) text(flow.description, 'flow description');
    if (!Array.isArray(flow.sources) || flow.sources.length > 512) fail('INVALID_INDEX', 'Flow sources must be an explicit selector array');
    for (const s of [...flow.sources, ...(flow.relatedSources ?? [])]) selector(s, admitted);
    for (const t of flow.tags ?? []) text(t, 'flow tag', 160);
    for (const b of flow.opaqueBoundaries ?? []) text(b, 'opaque boundary', 2048);
    if (flow.chart !== undefined && flow.diagram !== undefined) fail('INVALID_INDEX', 'Use a chart export or a declared diagram, not both');
  }
  for (const flow of flows) for (const id of flow.relatedFlowIds ?? []) if (!ids.has(id)) fail('INVALID_INDEX', 'Related application flow is not registered');
  const dev = index.development;
  if (!plain(dev) || !plain(dev.entry) || !plain(dev.commands) || !plain(dev.smokeTest)) fail('INVALID_INDEX', 'A public entry, commands and approved smoke example are required');
  const entry = relative(dev.entry.file, 'entry file', true); if (!admitted.has(entry)) fail('SOURCE_NOT_ADMITTED', 'Public entry must be admitted production source');
  text(dev.entry.exportName, 'entry export', 160); if (dev.entry.signature !== undefined) text(dev.entry.signature, 'entry signature', 2048);
  for (const [key, value] of Object.entries(dev.commands)) { if (!['test', 'build', 'typecheck'].includes(key)) fail('INVALID_INDEX', 'Unknown development command'); text(value, 'development command', 2048); if (value.includes('\n') || value.includes('\r')) fail('INVALID_INDEX', 'Development commands must be single lines'); }
  text(dev.commands.test, 'test command', 2048);
  if (dev.regressionTestDirectory !== undefined) relative(dev.regressionTestDirectory, 'regression test directory');
  if (dev.protectedFiles !== undefined && (!Array.isArray(dev.protectedFiles) || dev.protectedFiles.length > 512)) fail('INVALID_INDEX', 'Protected development paths must be a bounded explicit array');
  const protectedPaths = [...new Set((dev.protectedFiles ?? []).map(f => {
    text(f, 'protected path', 1024);
    const prefix = f.endsWith('/');
    return relative(prefix ? f.slice(0, -1) : f, 'protected file') + (prefix ? '/' : '');
  }))].sort(compare);
  const compact = options.packetOptions !== undefined;
  const referenceContracts = new Map<string, string>();
  if (compact) {
    const presentation = options.packetOptions!;
    if (!plain(presentation) || presentation.format !== 'compact' || Object.keys(presentation).some(k => !['format', 'referenceSources'].includes(k)) || presentation.referenceSources !== undefined && (!Array.isArray(presentation.referenceSources) || presentation.referenceSources.length > 512)) fail('INVALID_PACKET_OPTIONS', 'Expected explicit compact packet options and bounded protected source references');
    for (const reference of presentation.referenceSources ?? []) {
      if (!plain(reference) || Object.keys(reference).some(k => !['file', 'contract'].includes(k))) fail('INVALID_PACKET_OPTIONS', 'Source references require only an admitted file and caller-declared contract');
      const file = relative(reference.file, 'referenced source', true);
      if (!admitted.has(file)) fail('SOURCE_NOT_ADMITTED', `Referenced source is not admitted: ${file}`);
      if (!protectedSource(file, protectedPaths)) fail('UNPROTECTED_SOURCE_REFERENCE', `Editable source cannot be replaced by a reference: ${file}`);
      if (referenceContracts.has(file)) fail('INVALID_PACKET_OPTIONS', 'Duplicate protected source reference');
      referenceContracts.set(file, text(reference.contract, 'protected source contract', 8192));
    }
  }
  if (dev.supportFiles !== undefined && (!Array.isArray(dev.supportFiles) || dev.supportFiles.length > 32)) fail('INVALID_INDEX', 'Approved public support files must be a bounded explicit array');
  const support = new Map<string, { text: string; sha256: string; purpose: string }>();
  const supportNames = new Set<string>();
  let supportCharacters = 0;
  for (const approved of dev.supportFiles ?? []) {
    if (!plain(approved) || Object.keys(approved).some(k => !['file', 'purpose'].includes(k))) fail('INVALID_INDEX', 'Approved support files require only a file and public purpose');
    const file = supportPath(approved.file), purpose = text(approved.purpose, 'public support purpose', 2048);
    if (supportNames.has(file.toLowerCase()) || files.some(f => f.toLowerCase() === file.toLowerCase()) || file.toLowerCase() === dev.smokeTest.file?.toLowerCase() || file.toLowerCase() === 'package.json') fail('DUPLICATE_SUPPORT_SOURCE', 'Support source must not duplicate admitted source, package metadata or public smoke');
    const value = await read(root, file); supportCharacters += value.text.length;
    if (value.text.length > 32000 || supportCharacters > 128000) fail('PUBLIC_SUPPORT_LIMIT', 'Approved support source exceeds the bounded public-tooling limit');
    support.set(file, { ...value, purpose });
    supportNames.add(file.toLowerCase());
  }
  const current = new Map<string, { text: string; sha256: string }>(); let total = 0;
  for (const file of files) { const value = await read(root, file); total += value.text.length; if (total > 10000000) fail('SOURCE_ADMISSION_LIMIT', 'Admitted source exceeds the declared ten-million-character build limit'); current.set(file, value); }
  const hashes = Object.fromEntries(files.map(file => [file, current.get(file)!.sha256])), tree = sha(JSON.stringify(Object.entries(hashes)));
  if (options.sourceManifest) {
    if (options.sourceManifest.schemaVersion !== 1 || options.sourceManifest.scope !== 'source-only-static-syntax') fail('INVALID_SOURCE_MANIFEST', 'Expected a canonical source-only manifest');
    for (const file of files) if (options.sourceManifest.files[file]?.sha256 !== current.get(file)!.sha256) fail('STALE_SOURCE_MANIFEST', `Source manifest differs: ${file}`);
  }
  let smoke: { text: string; sha256: string; file?: string; origin: 'current-file' | 'caller-approved-literal' };
  if (dev.smokeTest.file !== undefined) {
    const file = relative(dev.smokeTest.file, 'public smoke file'), source = await read(root, file);
    if (dev.smokeTest.text !== undefined && dev.smokeTest.text !== source.text || dev.smokeTest.sha256 !== undefined && dev.smokeTest.sha256 !== source.sha256) fail('STALE_PUBLIC_SMOKE', 'Approved smoke example differs from the current declared file');
    smoke = { ...source, file, origin: 'current-file' };
  } else { const content = text(dev.smokeTest.text, 'approved smoke example', 32000); smoke = { text: content, sha256: sha(content), origin: 'caller-approved-literal' }; if (dev.smokeTest.sha256 !== undefined && dev.smokeTest.sha256 !== smoke.sha256) fail('STALE_PUBLIC_SMOKE', 'Approved literal smoke hash differs'); }
  if (smoke.text.length > 32000) fail('INVALID_INDEX', 'Public smoke example exceeds 32000 characters');
  let packageFile: { file: string; sha256: string } | undefined, packageFacts: Record<string, unknown> | undefined;
  try { const source = await read(root, 'package.json'), pkg = JSON.parse(source.text); packageFile = { file: 'package.json', sha256: source.sha256 }; const scripts = Object.fromEntries(['test', 'build', 'typecheck'].filter(k => typeof pkg.scripts?.[k] === 'string').map(k => [k, pkg.scripts[k]])); packageFacts = { ...(typeof pkg.name === 'string' ? { name: pkg.name } : {}), scripts, ...(plain(pkg.dependencies) ? { declaredDependencies: pkg.dependencies } : {}) }; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const wanted = tokens(goal), ranking = flows.map(flow => ({ id: flow.id, score: [...tokens([flow.id, flow.description ?? '', ...(flow.tags ?? []), ...flow.sources.map(s => `${s.file} ${s.symbol ?? ''} ${s.stageId ?? ''}`)].join(' '))].filter(t => wanted.has(t)).length }));
  const best = Math.max(...ranking.map(x => x.score)); const selectedIds = new Set(ranking.filter(x => best === 0 || x.score === best).map(x => x.id));
  const expand = [...selectedIds]; for (let i = 0; i < expand.length; i++) for (const id of flows.find(f => f.id === expand[i])!.relatedFlowIds ?? []) if (!selectedIds.has(id)) { selectedIds.add(id); expand.push(id); }
  const chosen = flows.filter(flow => selectedIds.has(flow.id)), selectors = [...chosen.flatMap(f => [...f.sources, ...(f.relatedSources ?? [])]), { file: entry }];
  const selectedFiles = [...new Set(selectors.map(s => s.file))].sort(compare), boundaries = [...new Set(chosen.flatMap(f => [...(f.opaqueBoundaries ?? []), ...(f.sources.length ? [] : [`No implementation source declared for ${f.id}`])]))];
  const deliveredFiles = selectedFiles.filter(file => !referenceContracts.has(file));
  if (!deliveredFiles.length) fail('NO_DELIVERED_SOURCE', 'A source packet must retain at least one complete selected module; protected references are not editable code');
  const topology: ApplicationDeveloperContext['manifest']['topology'][number][] = [], diagrams = new Map<string, string>();
  for (const flow of flows) {
    let diagram: string | undefined, origin: 'caller-trusted-chart-export' | 'caller-declared' | 'not-supplied' = 'not-supplied';
    if (flow.chart !== undefined) { if (!flow.chart || typeof flow.chart.toMermaid !== 'function') fail('INVALID_CHART_EXPORT', 'Trusted chart must expose toMermaid()'); diagram = flow.chart.toMermaid(); origin = 'caller-trusted-chart-export'; }
    else if (flow.diagram !== undefined) { diagram = flow.diagram; origin = 'caller-declared'; }
    if (diagram !== undefined) { text(diagram, 'flow diagram', 1000000); diagrams.set(flow.id, diagram); }
    topology.push({ flowId: flow.id, origin, ...(diagram !== undefined ? { sha256: sha(diagram) } : {}) });
  }
  const indexLines = [`# ${name}: application context index`, '', 'Explicit admitted application sources; diagrams are caller-trusted static topology, not execution evidence.', `Source identity: ${tree}`, '', ...flows.map(f => `- ${f.id}: ${f.description ?? ''} — ${f.sources.map(s => `${s.file}${s.symbol ? '#' + s.symbol : ''}`).join(', ') || 'opaque implementation'}`), '', 'Admitted source files:', ...files.map(f => `- ${f}`), '', 'Use the goal-scoped packet for current editable code and the approved public test example. Other source inspection remains available for missing detail.'];
  const indexText = indexLines.join('\n') + '\n';
  if (indexText.length > 1000000) fail('APPLICATION_INDEX_LIMIT', 'Complete application index exceeds one million characters; nothing was clipped');
  let packetText = compact
    ? `# ${name}: source/test packet\n\nSelected flows: ${chosen.map(f => f.id).join(', ')}\nGoal SHA-256: ${sha(goal)} (full goal retained in manifest).\n\n`
    : `# ${name}: current source and development packet\n\nGoal: ${goal}\nSelected flows: ${chosen.map(f => f.id).join(', ')}\n\nPROJECT FACTS\nPublic entry (caller-declared contract): ${entry}#${dev.entry.exportName}${dev.entry.signature ? ' — ' + dev.entry.signature : ''}\nCommands (not executed): ${JSON.stringify(dev.commands)}\n${packageFacts ? 'Current package facts (dependency specs are declarations, not installed-version proof): ' + JSON.stringify(packageFacts) + '\n' : ''}${dev.regressionTestDirectory ? 'New regression tests: ' + dev.regressionTestDirectory + '\n' : ''}${dev.protectedFiles?.length ? 'Protected/generated-file rules supplied by application: ' + dev.protectedFiles.join(', ') + '\n' : ''}Admitted files: ${files.join(', ')}\nSource identity: ${tree}\n\n`;
  const appendDiagrams = () => { for (const flow of chosen) if (diagrams.has(flow.id)) packetText += `${flow.id} (${topology.find(t => t.flowId === flow.id)!.origin}; no runtime-effect claim)\n${fence(diagrams.get(flow.id)!, 'mermaid')}\n\n`; };
  if (!compact) appendDiagrams();
  const sourceProofs: ApplicationDeveloperSourceProof[] = [];
  for (const file of deliveredFiles) {
    const value = current.get(file)!, requests = selectors.filter(s => s.file === file), units = resolvedUnits(options.sourceManifest, requests, file, value);
    packetText += `${file} [COMPLETE MODULE; current imports/local helpers included]\n`;
    const mark = '`'.repeat(Math.max(3, ...[...value.text.matchAll(/`+/g)].map(m => m[0].length + 1))); packetText += mark + (/\.tsx?$/.test(file) ? 'ts' : 'js') + '\n';
    const start = packetText.length; packetText += value.text; const end = packetText.length; packetText += '\n' + mark + '\n\n';
    sourceProofs.push({ file, moduleSha256: value.sha256, sourceSha256: value.sha256, start: 0, end: value.text.length, startLine: 1, endLine: value.text.split('\n').length, packetStart: start, packetEnd: end, sourceForm: 'complete-module', requestedSelectors: requests, resolvedUnits: units });
  }
  let developmentFacts: ApplicationDeveloperContext['manifest']['developmentFacts'];
  const sourceReferences: ApplicationDeveloperReferenceProof[] = [];
  if (compact) {
    const { text: facts, regressionEntryImport } = compactDevelopmentFacts(dev);
    const start = packetText.length; packetText += facts; const end = packetText.length; packetText += '\n';
    developmentFacts = { entry: { file: entry, exportName: dev.entry.exportName, ...(dev.entry.signature ? { signature: dev.entry.signature } : {}) }, commands: { ...dev.commands }, ...(dev.regressionTestDirectory ? { regressionTestDirectory: dev.regressionTestDirectory } : {}), ...(regressionEntryImport ? { regressionEntryImport } : {}), packetStart: start, packetEnd: end, textSha256: sha(facts) };
    if (packageFacts?.scripts) packetText += `Current package script declarations: ${JSON.stringify(packageFacts.scripts)}\n`;
    packetText += `Protected paths: ${protectedPaths.join(', ') || '(none)'}\nAdmitted files: ${files.join(', ')}\nSource identity: ${tree}\n\n`;
    for (const file of selectedFiles.filter(file => referenceContracts.has(file))) {
      const value = current.get(file)!, contract = referenceContracts.get(file)!, requests = selectors.filter(s => s.file === file), units = resolvedUnits(options.sourceManifest, requests, file, value);
      packetText += `PROTECTED SOURCE REFERENCE: ${file} (body NOT supplied; current SHA-256 ${value.sha256})\nCaller-declared contract: `;
      const start = packetText.length; packetText += contract; const end = packetText.length; packetText += '\nInspect this file when its implementation is needed; its hash does not verify the contract.\n\n';
      sourceReferences.push({ file, moduleSha256: value.sha256, moduleCharacters: value.text.length, contract, contractOrigin: 'caller-declared', sourceDelivered: false, packetStart: start, packetEnd: end, requestedSelectors: requests, resolvedUnits: units });
    }
    appendDiagrams();
  }
  packetText += `APPROVED PUBLIC SMOKE EXAMPLE (${smoke.origin}${smoke.file ? ': ' + smoke.file : ''})\n`;
  const smokeFence = '`'.repeat(Math.max(3, ...[...smoke.text.matchAll(/`+/g)].map(m => m[0].length + 1)));
  packetText += smokeFence + 'js\n'; const smokeStart = packetText.length; packetText += smoke.text; const smokeEnd = packetText.length; packetText += '\n' + smokeFence + '\n\n';
  const supportProofs: ApplicationDeveloperSupportProof[] = [];
  for (const [file, value] of [...support].sort(([a], [b]) => compare(a, b))) {
    packetText += `APPROVED PUBLIC SUPPORT: ${file} — ${value.purpose}\n`;
    const mark = '`'.repeat(Math.max(3, ...[...value.text.matchAll(/`+/g)].map(m => m[0].length + 1))); packetText += mark + '\n';
    const start = packetText.length; packetText += value.text; const end = packetText.length; packetText += '\n' + mark + '\n\n';
    supportProofs.push({ file, purpose: value.purpose, sha256: value.sha256, characters: value.text.length, packetStart: start, packetEnd: end });
  }
  if (boundaries.length) packetText += `EXPLICIT OPAQUE BOUNDARIES\n${boundaries.map(b => '- ' + b).join('\n')}\n\n`;
  packetText += compact
    ? 'Supplied bodies are complete current modules. Protected references are not supplied source or verified semantics. Unshown imports and host/provider effects remain boundaries; inspect missing or changed detail when needed.\n'
    : 'These are current complete selected modules, not a proof of all external dependencies or runtime business effects. Imports into unshown/host/provider implementations remain boundaries. Use supplied current code for the first patch when sufficient; inspect only concrete missing or changed details. No hidden grader, runtime customer values or application callback is collected.\n';
  if (packetText.length > budget) fail('APPLICATION_CONTEXT_BUDGET_EXCEEDED', `Complete packet requires ${packetText.length} characters; budget is ${budget}. Nothing was truncated. Refine the declared flow/source selection or explicitly increase the budget.`);
  // A chart exporter or concurrent editor may have changed inputs while building the packet.
  for (const file of files) if ((await read(root, file)).sha256 !== hashes[file]) fail('SOURCE_CHANGED_DURING_CONTEXT_BUILD', `Application source changed during context build: ${file}`);
  if (smoke.file && (await read(root, smoke.file)).sha256 !== smoke.sha256 || packageFile && (await read(root, packageFile.file)).sha256 !== packageFile.sha256) fail('SOURCE_CHANGED_DURING_CONTEXT_BUILD', 'Public development inputs changed during context build');
  for (const [file, value] of support) if ((await read(root, file)).sha256 !== value.sha256) fail('SOURCE_CHANGED_DURING_CONTEXT_BUILD', `Approved public support changed during context build: ${file}`);
  return { indexText, packetText, manifest: { schemaVersion: 1, producer: PRODUCER, applicationName: name, goal, sourceTreeSha256: tree, sourceHashes: hashes, indexSha256: sha(indexText), packetSha256: sha(packetText), indexCharacters: indexText.length, packetCharacters: packetText.length, characterBudget: budget, selectedFlowIds: chosen.map(f => f.id), selection: ranking.map(r => ({ ...r, selected: selectedIds.has(r.id) })), sources: sourceProofs, ...(compact ? { packetFormat: 'compact' as const, sourceReferences, developmentFacts } : {}), ...(dev.supportFiles !== undefined ? { supportFiles: supportProofs } : {}), publicSmoke: { origin: smoke.origin, ...(smoke.file ? { file: smoke.file } : {}), sha256: smoke.sha256, characters: smoke.text.length, packetStart: smokeStart, packetEnd: smokeEnd }, ...(packageFile ? { packageFile } : {}), coverage: { scope: 'admitted-application-source', allAdmittedSourceDelivered: deliveredFiles.length === files.length, completeApplication: false, semantics: 'source-not-runtime-proof' }, topology, protectedPaths, boundaries } };
}

export type ApplicationDeveloperOutputOptions = {
  readonly root: string; readonly context: ApplicationDeveloperContext;
  readonly outputDir?: string; readonly readmeFile?: string; readonly agentFile?: string;
};
async function existing(root: string, file: string): Promise<string | undefined> { try { return (await read(root, file)).text; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; } }
function marked(original: string | undefined, section: string, title: string): string {
  const value = original ?? `# ${title}\n`;
  const starts = value.split(BEGIN).length - 1, ends = value.split(END).length - 1;
  if (starts !== ends || starts > 1 || starts === 1 && value.indexOf(BEGIN) > value.indexOf(END)) fail('INVALID_GENERATED_MARKERS', 'Application context markers are missing, duplicated or out of order');
  const block = `${BEGIN}\n${section}\n${END}`;
  return starts === 0 ? value + (value.endsWith('\n') ? '\n' : '\n\n') + block + '\n' : value.slice(0, value.indexOf(BEGIN)) + block + value.slice(value.indexOf(END) + END.length);
}
async function validateContext(root: string, context: ApplicationDeveloperContext): Promise<void> {
  const m = context.manifest;
  if (!Array.isArray(m.protectedPaths) || m.protectedPaths.some(p => typeof p !== 'string')) fail('INVALID_CONTEXT_PROOF', 'Context must retain explicit protected development paths');
  for (const p of m.protectedPaths) relative(p.endsWith('/') ? p.slice(0, -1) : p, 'protected development path');
  if (!Array.isArray(m.sources) || !m.sources.length || new Set(m.sources.map(s => s.file)).size !== m.sources.length) fail('INVALID_CONTEXT_PROOF', 'Context must retain distinct complete selected source proofs');
  if (m.schemaVersion !== 1 || m.producer !== PRODUCER || sha(context.packetText) !== m.packetSha256 || sha(context.indexText) !== m.indexSha256 || context.packetText.length !== m.packetCharacters || context.indexText.length !== m.indexCharacters || context.packetText.length > m.characterBudget) fail('INVALID_CONTEXT_PROOF', 'Context text or producer identity differs from its proof');
  const files = Object.keys(m.sourceHashes).sort(compare), hashes: Record<string, string> = {};
  for (const file of files) { relative(file, 'manifest source', true); const value = await read(root, file); hashes[file] = value.sha256; if (value.sha256 !== m.sourceHashes[file]) fail('STALE_APPLICATION_CONTEXT', `Application context is stale: ${file}`); for (const proof of m.sources.filter(s => s.file === file)) if (proof.start !== 0 || proof.end !== value.text.length || proof.sourceForm !== 'complete-module' || proof.sourceSha256 !== value.sha256 || proof.moduleSha256 !== value.sha256 || context.packetText.slice(proof.packetStart, proof.packetEnd) !== value.text) fail('INVALID_CONTEXT_PROOF', 'Packet source span does not match current complete module'); }
  if (sha(JSON.stringify(Object.entries(hashes))) !== m.sourceTreeSha256 || m.sources.some(s => !files.includes(s.file))) fail('INVALID_CONTEXT_PROOF', 'Admitted source identity differs');
  if (!plain(m.coverage) || m.coverage.scope !== 'admitted-application-source' || m.coverage.semantics !== 'source-not-runtime-proof' || m.coverage.completeApplication !== false || m.coverage.allAdmittedSourceDelivered !== (m.sources.length === files.length)) fail('INVALID_CONTEXT_PROOF', 'Coverage must match physically supplied admitted source, never complete application semantics');
  if (m.packetFormat !== undefined && m.packetFormat !== 'compact' || m.sourceReferences !== undefined && !Array.isArray(m.sourceReferences) || m.supportFiles !== undefined && !Array.isArray(m.supportFiles)) fail('INVALID_CONTEXT_PROOF', 'Optional packet proofs must retain their declared formats');
  const references = m.sourceReferences ?? [], support = m.supportFiles ?? [];
  if (references.length > 512 || new Set(references.map(s => s.file)).size !== references.length || references.length && m.coverage.allAdmittedSourceDelivered) fail('INVALID_CONTEXT_PROOF', 'Protected references are distinct omissions, not delivered source');
  for (const reference of references) {
    const file = relative(reference.file, 'referenced source', true), value = await read(root, file);
    if (m.packetFormat !== 'compact' || !files.includes(file) || m.sources.some(s => s.file === file) || !protectedSource(file, m.protectedPaths) || reference.sourceDelivered !== false || reference.contractOrigin !== 'caller-declared' || reference.moduleSha256 !== value.sha256 || reference.moduleCharacters !== value.text.length || !Number.isSafeInteger(reference.packetStart) || !Number.isSafeInteger(reference.packetEnd) || reference.packetStart < 0 || reference.packetEnd > context.packetText.length || reference.packetEnd <= reference.packetStart || context.packetText.slice(reference.packetStart, reference.packetEnd) !== text(reference.contract, 'referenced contract', 8192)) fail('INVALID_CONTEXT_PROOF', 'Protected source reference does not match its declared omission/current source');
  }
  if (m.packetFormat === 'compact') {
    const facts = m.developmentFacts!;
    if (!Array.isArray(m.sourceReferences)) fail('INVALID_CONTEXT_PROOF', 'Compact contexts must retain their protected-reference inventory, including an empty one');
    if (!facts || !Number.isSafeInteger(facts.packetStart) || !Number.isSafeInteger(facts.packetEnd) || facts.packetStart < 0 || facts.packetEnd <= facts.packetStart || facts.packetEnd > context.packetText.length || sha(context.packetText.slice(facts.packetStart, facts.packetEnd)) !== facts.textSha256) fail('INVALID_CONTEXT_PROOF', 'Compact development facts must be physically supplied');
    if (!plain(facts.entry) || !plain(facts.commands) || !files.includes(relative(facts.entry.file, 'development entry', true))) fail('INVALID_CONTEXT_PROOF', 'Compact entry facts must refer to admitted source');
    if (!m.sources.some(s => s.file === facts.entry.file) && !references.some(s => s.file === facts.entry.file)) fail('INVALID_CONTEXT_PROOF', 'Compact public entry must retain its body or explicit protected reference');
    text(facts.entry.exportName, 'development entry export', 160); if (facts.entry.signature !== undefined) text(facts.entry.signature, 'development entry signature', 2048);
    for (const [key, value] of Object.entries(facts.commands)) if (!['test', 'build', 'typecheck'].includes(key) || typeof value !== 'string' || !value.length || value.length > 2048 || /[\n\r\0]/.test(value)) fail('INVALID_CONTEXT_PROOF', 'Compact command facts must retain their bounded declarations');
    text(facts.commands.test, 'development test command', 2048); if (facts.regressionTestDirectory !== undefined) relative(facts.regressionTestDirectory, 'regression test directory');
    const rendered = compactDevelopmentFacts(facts);
    if (rendered.text !== context.packetText.slice(facts.packetStart, facts.packetEnd) || rendered.regressionEntryImport !== facts.regressionEntryImport) fail('INVALID_CONTEXT_PROOF', 'Compact declaration metadata differs from its rendered facts');
  } else if (m.developmentFacts !== undefined) fail('INVALID_CONTEXT_PROOF', 'Compact development facts require the explicit compact format');
  if (support.length > 32 || new Set(support.map(s => s.file.toLowerCase())).size !== support.length) fail('INVALID_CONTEXT_PROOF', 'Approved support proofs must retain distinct public files');
  let supportCharacters = 0;
  for (const proof of support) {
    const file = supportPath(proof.file), value = await read(root, file);
    supportCharacters += value.text.length;
    text(proof.purpose, 'public support purpose', 2048);
    if (value.sha256 !== proof.sha256) fail('STALE_APPLICATION_CONTEXT', `Approved public support is stale: ${file}`);
    if (files.some(f => f.toLowerCase() === file.toLowerCase()) || file.toLowerCase() === m.publicSmoke.file?.toLowerCase() || file.toLowerCase() === 'package.json' || value.text.length > 32000 || supportCharacters > 128000 || proof.characters !== value.text.length || !Number.isSafeInteger(proof.packetStart) || !Number.isSafeInteger(proof.packetEnd) || proof.packetStart < 0 || proof.packetEnd > context.packetText.length || proof.packetEnd - proof.packetStart !== value.text.length || context.packetText.slice(proof.packetStart, proof.packetEnd) !== value.text) fail('INVALID_CONTEXT_PROOF', 'Approved public support bytes are not physically supplied');
  }
  if (m.publicSmoke.packetEnd - m.publicSmoke.packetStart !== m.publicSmoke.characters || sha(context.packetText.slice(m.publicSmoke.packetStart, m.publicSmoke.packetEnd)) !== m.publicSmoke.sha256) fail('INVALID_CONTEXT_PROOF', 'Approved smoke source is not physically supplied in packet');
  if (m.publicSmoke.file && (await read(root, relative(m.publicSmoke.file, 'public smoke'))).sha256 !== m.publicSmoke.sha256 || m.packageFile && (await read(root, relative(m.packageFile.file, 'package file'))).sha256 !== m.packageFile.sha256) fail('STALE_APPLICATION_CONTEXT', 'Public development context is stale');
}
const BLOCKED_OUTPUT_SCOPES = new Set(['src', 'source', 'sources', 'lib', 'app', 'apps', 'test', 'tests', '__tests__', 'fixture', 'fixtures', '__fixtures__', 'node_modules', 'dist', 'build', 'coverage', 'scripts', 'vendor']);
const inProtectedOutputScope = (file: string) => file.split('/').some(segment => BLOCKED_OUTPUT_SCOPES.has(segment.toLowerCase()));
function pathOverlaps(a: string, b: string): boolean {
  const left = a.replace(/\/$/, '').toLowerCase(), right = b.replace(/\/$/, '').toLowerCase();
  return left === right || left.startsWith(right + '/') || right.startsWith(left + '/');
}
function overlapsProtectedInput(file: string, context: ApplicationDeveloperContext): boolean {
  const m = context.manifest;
  const inputs = [...Object.keys(m.sourceHashes), ...(m.publicSmoke.file ? [m.publicSmoke.file] : []), ...(m.packageFile ? [m.packageFile.file] : []), ...(m.supportFiles ?? []).map(s => s.file), ...m.protectedPaths];
  return inputs.some(input => pathOverlaps(file, input));
}
function instructionTarget(file: string, context: ApplicationDeveloperContext): void {
  // Case-fold guards deliberately cover aliases on case-insensitive project filesystems too.
  if (!/\.(?:md|markdown)$/i.test(file) || inProtectedOutputScope(file)) fail('UNSAFE_INSTRUCTION_TARGET', 'Instruction targets must be Markdown outside production, test, fixture and generated-code scopes');
  if (overlapsProtectedInput(file, context)) fail('UNSAFE_INSTRUCTION_TARGET', 'Instruction target overlaps an admitted source or protected development input');
}
async function expectedOutputs(options: ApplicationDeveloperOutputOptions) {
  staticData(options);
  const root = await fs.realpath(options.root); await validateContext(root, options.context);
  const outputDir = relative(options.outputDir ?? 'docs/application-context', 'output directory', false, true);
  if (inProtectedOutputScope(outputDir)) fail('UNSAFE_OUTPUT', 'Generated application context must remain outside production, test, fixture and generated-code scopes');
  const entryFiles = [options.readmeFile, options.agentFile].filter((f): f is string => f !== undefined).map(f => relative(f, 'instruction file', false, true));
  for (const file of entryFiles) instructionTarget(file, options.context);
  if (entryFiles.some(f => pathOverlaps(f, outputDir)) || entryFiles.some((f, i) => entryFiles.some((g, j) => j > i && pathOverlaps(f, g)))) fail('UNSAFE_OUTPUT', 'Instruction paths must be distinct and outside managed output directories');
  const outputs: Record<string, string> = Object.assign(Object.create(null), { [`${outputDir}/index.md`]: options.context.indexText, [`${outputDir}/packet.md`]: options.context.packetText, [`${outputDir}/manifest.json`]: JSON.stringify(options.context.manifest, null, 2) + '\n' });
  for (const file of Object.keys(outputs)) if (overlapsProtectedInput(file, options.context)) fail('UNSAFE_OUTPUT', 'Generated output overlaps an admitted source or protected development input');
  const ownershipPath = `${outputDir}/${OWNERSHIP}`;
  if (overlapsProtectedInput(ownershipPath, options.context)) fail('UNSAFE_OUTPUT', 'Output ownership overlaps a protected development input');
  let old: { producer: string; files: string[] } | undefined;
  const oldText = await existing(root, ownershipPath);
  if (oldText !== undefined) { try { old = JSON.parse(oldText); } catch { fail('INVALID_OUTPUT_OWNERSHIP', 'Invalid application context ownership file'); } if (!old || old.producer !== PRODUCER || !Array.isArray(old.files) || old.files.some(f => !GENERATED.includes(f as typeof GENERATED[number]))) fail('INVALID_OUTPUT_OWNERSHIP', 'Unknown application context output ownership'); }
  // A new output directory must be empty. Never adopt or erase arbitrary documents.
  const names = await fs.readdir(await target(root, outputDir, true)).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return [] as string[]; throw e; });
  if (names.some(n => n !== OWNERSHIP && !(old?.files ?? []).includes(n))) fail('UNOWNED_OUTPUT', 'Generated output directory contains an unowned file');
  for (const file of entryFiles) {
    const links = ['index.md', 'packet.md'].map(name => path.relative(path.posix.dirname(file), `${outputDir}/${name}`).split(path.sep).join('/'));
    const section = `Start with the [application index](${links[0]}) and [current source/test packet](${links[1]}).\nUse supplied current code when sufficient; inspect concrete missing or changed source and run the application-approved checks.\nGenerated by the explicit application-context build integration; source/host boundaries and hashes are in the packet manifest.`;
    outputs[file] = marked(await existing(root, file), section, file === options.agentFile ? 'Application working context' : options.context.manifest.applicationName);
  }
  outputs[ownershipPath] = JSON.stringify({ schemaVersion: 1, producer: PRODUCER, files: [...GENERATED] }, null, 2) + '\n';
  for (const file of Object.keys(outputs)) await target(root, file, true);
  return { root, outputDir, outputs, oldFiles: old?.files ?? [] };
}
/** Read-only check; never rebuilds, executes commands or updates documentation. */
export async function checkApplicationDeveloperContext(options: ApplicationDeveloperOutputOptions): Promise<{ valid: boolean; differences: readonly string[]; files: readonly string[] }> {
  const expected = await expectedOutputs(options), differences: string[] = [];
  for (const [file, content] of Object.entries(expected.outputs)) if (await existing(expected.root, file) !== content) differences.push(file);
  return { valid: differences.length === 0, differences, files: Object.keys(expected.outputs).sort(compare) };
}
/** Explicit opt-in writer. Validates current inputs/ownership before mutation; each changed file is replaced atomically. */
export async function writeApplicationDeveloperContext(options: ApplicationDeveloperOutputOptions): Promise<{ changed: readonly string[]; files: readonly string[] }> {
  const expected = await expectedOutputs(options), changed: string[] = [], staged: { temp: string; file: string }[] = [];
  try {
    for (const [file, content] of Object.entries(expected.outputs)) {
      if (await existing(expected.root, file) === content) continue;
      const filename = await target(expected.root, file, true); await fs.mkdir(path.dirname(filename), { recursive: true });
      const temp = filename + '.smallbusiness-' + randomUUID() + '.tmp'; await fs.writeFile(temp, content, { flag: 'wx', mode: 0o644 }); staged.push({ temp, file });
    }
    await validateContext(expected.root, options.context);
    for (const item of staged) { const filename = await target(expected.root, item.file, true); await fs.rename(item.temp, filename); changed.push(item.file); }
  } finally { for (const item of staged) await fs.rm(item.temp, { force: true }); }
  return { changed, files: Object.keys(expected.outputs).sort(compare) };
}
