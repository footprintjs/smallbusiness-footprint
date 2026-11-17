/** Optional build-time documentation. Trusted chart exporters are called; stages and providers are never executed. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { DeveloperSourceSelector } from './types.js';

export type ApplicationDocumentationChart = {
  toMermaid(): string;
  readonly root?: unknown;
  readonly description?: string;
  readonly stageDescriptions?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  readonly inputSchema?: unknown; readonly outputSchema?: unknown;
  /** Formatting only. A caller-trusted exporter, never a server, executor or action-discovery call. */
  toMCPTool?(): { readonly name: string; readonly description: string; readonly inputSchema: unknown };
};
export type ApplicationDocumentationFlow = {
  readonly id: string;
  readonly chart: ApplicationDocumentationChart;
  /** Optional caller-declared purpose; generated chart algorithm remains separately attributed. */
  readonly description?: string;
  readonly sources?: readonly DeveloperSourceSelector[];
  /** Explicit construction-time mount relationship, not inferred from matching names. */
  readonly parentId?: string; readonly mountId?: string;
  readonly opaqueBoundaries?: readonly string[];
};
export type ApplicationFlowDocumentationIndex = {
  readonly applicationName: string; readonly sourceFiles: readonly string[];
  readonly flows: readonly ApplicationDocumentationFlow[];
  readonly protectedPaths?: readonly string[];
};
export type ApplicationFlowDocumentation = {
  /** Relative to the explicitly managed output directory. Manifest is supplied separately. */
  readonly files: Readonly<Record<string, string>>;
  readonly manifest: {
    readonly schemaVersion: 1; readonly producer: 'smallbusiness-application-flow-docs-v1';
    readonly applicationName: string; readonly outputDir: string; readonly sourceTreeSha256: string;
    readonly sourceHashes: Readonly<Record<string, string>>; readonly protectedPaths: readonly string[];
    readonly flows: readonly {
      readonly id: string; readonly file: string; readonly parentId?: string; readonly mountId?: string;
      readonly chartSha256: string; readonly algorithmSha256: string;
      readonly algorithmOrigin: 'chart-metadata' | 'constructed-topology' | 'mcp-export-description' | 'unavailable';
    }[];
    readonly files: Readonly<Record<string, { readonly sha256: string; readonly characters: number }>>;
    readonly coverage: { readonly scope: 'explicitly-registered-construction-time-charts'; readonly completeApplication: false; readonly executedCallbacks: false; readonly semantics: 'metadata-and-topology-not-runtime-proof' };
  };
};
export type ApplicationFlowDocumentationOutputOptions = {
  readonly root: string; readonly documentation: ApplicationFlowDocumentation;
  readonly outputDir?: string;
  /** Only the generated marker block is updated; existing surrounding prose is retained. */
  readonly readmeFile?: string;
};
export class ApplicationFlowDocumentationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'ApplicationFlowDocumentationError'; this.code = code; }
}
const PRODUCER = 'smallbusiness-application-flow-docs-v1' as const;
const OWNER = '.smallbusiness-flow-docs.json';
const BEGIN = '<!-- BEGIN SMALLBUSINESS GENERATED ALGORITHM INDEX -->';
const END = '<!-- END SMALLBUSINESS GENERATED ALGORITHM INDEX -->';
const HEADER = '<!-- Generated from explicitly registered runtime charts; do not edit generated content. -->';
const sha = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const fail = (code: string, message: string): never => { throw new ApplicationFlowDocumentationError(code, message); };
const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
function text(v: unknown, name: string, max = 8192): string {
  if (typeof v !== 'string' || !v.length || v.length > max || v.includes('\0')) fail('INVALID_FLOW_DOCUMENTATION', `${name} must be a bounded nonempty string`);
  return v as string;
}
/** Validate configuration without executing accessors; only an explicit chart is a trusted code boundary. */
function staticData(v: unknown, route: string[] = [], seen = new Set<object>()): void {
  if (route.length === 4 && route[0] === 'index' && route[1] === 'flows' && /^\d+$/.test(route[2]!) && route[3] === 'chart') return;
  if (v === undefined || v === null || ['string', 'boolean'].includes(typeof v) || typeof v === 'number' && Number.isFinite(v)) return;
  if (typeof v !== 'object' || !Array.isArray(v) && !plain(v) || Array.isArray(v) && Object.getPrototypeOf(v) !== Array.prototype || seen.has(v)) fail('INVALID_FLOW_DOCUMENTATION', 'Documentation configuration must be plain acyclic static data');
  seen.add(v);
  for (const key of Reflect.ownKeys(v)) {
    const d = Object.getOwnPropertyDescriptor(v, key)!;
    if (typeof key !== 'string' || !('value' in d)) fail('INVALID_FLOW_DOCUMENTATION', 'Documentation configuration must not execute getters');
    staticData(d.value, [...route, key as string], seen);
  }
  seen.delete(v);
}
function relative(v: unknown, source = false): string {
  const f = text(v, 'path', 1024);
  if (path.isAbsolute(f) || f.includes('\\') || f.split('/').some((p, i) => !/^[A-Za-z0-9_.-]+$/.test(p) || p === '.' || p === '..' || p.startsWith('.') && !(i === 0 && p === '.work-tmp') || ['node_modules', 'dist', '.git', 'coverage', '__fixtures__'].includes(p.toLowerCase()))) fail('UNSAFE_PATH', 'Documentation paths must remain inside explicitly admitted project files');
  if (source && (!f.startsWith('src/') || !/\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/.test(f) || f.split('/').some(p => ['__tests__', 'test', 'tests', 'fixtures'].includes(p.toLowerCase())) || /\.(test|spec)\.[^.]+$/i.test(f))) fail('UNSAFE_SOURCE', 'Admit production src JS/TS files explicitly');
  return f;
}
async function target(root: string, file: string, missing = false): Promise<string> {
  let current = root;
  const parts = file.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]!);
    try { const s = await fs.lstat(current); if (s.isSymbolicLink()) fail('SYMLINK_NOT_ADMITTED', `Documentation tooling does not follow symlinks: ${file}`); if (i < parts.length - 1 && !s.isDirectory()) fail('UNSAFE_PATH', 'Documentation ancestor must be a directory'); }
    catch (e) { if (missing && (e as NodeJS.ErrnoException).code === 'ENOENT') continue; throw e; }
  }
  return current;
}
async function read(root: string, file: string): Promise<string> {
  const h = await fs.open(await target(root, file), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try { if (!(await h.stat()).isFile()) fail('UNSAFE_PATH', 'Documentation input must be a regular file'); const bytes = await h.readFile(), value = bytes.toString('utf8'); if (!Buffer.from(value).equals(bytes)) fail('UNSUPPORTED_ENCODING', 'Expected original UTF-8 bytes'); return value; }
  finally { await h.close(); }
}
async function existing(root: string, file: string): Promise<string | undefined> { try { return await read(root, file); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; } }
const html = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ');
function fence(v: string, lang = '') { const mark = '`'.repeat(Math.max(3, ...[...v.matchAll(/`+/g)].map(m => m[0].length + 1))); return `${mark}${lang}\n${v}\n${mark}`; }
function json(v: unknown): string {
  staticData(v);
  const sorted = (x: unknown): unknown => Array.isArray(x) ? x.map(sorted) : plain(x) ? Object.fromEntries(Object.keys(x).sort(compare).map(k => [k, sorted(x[k])])) : x;
  return JSON.stringify(sorted(v), null, 2) + '\n';
}
const flowFile = (id: string) => 'flows/' + (id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'flow') + '-' + sha(id).slice(0, 16) + '/README.md';
const pagePath = (file: string) => file === 'README.md' || /^flows\/[a-z0-9-]+-[a-f0-9]{16}\/README\.md$/.test(file);
const overlap = (a: string, b: string) => { const x = a.replace(/\/$/, '').toLowerCase(), y = b.replace(/\/$/, '').toLowerCase(); return x === y || x.startsWith(y + '/') || y.startsWith(x + '/'); };
const blockedOutput = (f: string) => f.split('/').some(p => ['src', 'source', 'sources', 'lib', 'app', 'apps', 'test', 'tests', '__tests__', 'fixture', 'fixtures', '__fixtures__', 'node_modules', 'dist', 'build', 'coverage', 'scripts', 'vendor'].includes(p.toLowerCase()));
function protectedPath(v: string): string { const directory = v.endsWith('/'); return relative(directory ? v.slice(0, -1) : v) + (directory ? '/' : ''); }
function constructedStages(root: unknown): { id: string; name: string; kind: string; edges: string }[] {
  const seen = new Set<object>(), out: { id: string; name: string; kind: string; edges: string }[] = [];
  function walk(node: unknown): void {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    if (seen.size >= 4096) fail('DOCUMENTATION_LIMIT', 'Constructed view exceeds 4096 stages');
    seen.add(node);
    const n = node as Record<string, unknown>, id = text(n.id, 'constructed stage ID', 1024), name = text(n.name ?? n.id, 'constructed stage name', 8192);
    const children = Array.isArray(n.children) ? n.children : [], next = n.next as Record<string, unknown> | undefined;
    const kind = n.isLoopRef ? 'loop reference' : n.deciderFn ? 'decision' : n.selectorFn ? 'parallel selector' : n.isSubflowRoot || n.subflowId ? 'mounted subflow' : children.length ? 'parallel fork' : 'stage';
    const edges = n.isLoopRef ? 'loop back → ' + id : [...children.map(c => { const x = c as Record<string, unknown>; return `${n.deciderFn || n.selectorFn ? 'branch ' + String(x.branchId ?? x.id) : 'parallel'} → ${String(x.id)}${x.isLoopRef ? ' (loop)' : ''}`; }), ...(next ? [(next.isLoopRef ? 'loop back' : children.length ? 'after selected/parallel branches' : 'next') + ' → ' + String(next.id)] : []), ...(n.subflowResolver || n.subflowDef ? ['dynamic child remains unexpanded'] : [])].join('; ');
    out.push({ id, name, kind, edges });
    if (n.isLoopRef) return;
    for (const child of children) walk(child); walk(next);
  }
  walk(root); return out;
}

/** Construct charts freshly using the application's runtime factories before this call. Never invokes those factories itself. */
export async function buildApplicationFlowDocumentation(options: { readonly root: string; readonly index: ApplicationFlowDocumentationIndex; readonly outputDir?: string }): Promise<ApplicationFlowDocumentation> {
  staticData(options);
  const root = await fs.realpath(options.root), index = options.index;
  if (!plain(index)) fail('INVALID_FLOW_DOCUMENTATION', 'Explicit chart index is required');
  const name = text(index.applicationName, 'application name', 160), outputDir = relative(options.outputDir ?? 'docs/application-flows');
  if (blockedOutput(outputDir)) fail('UNSAFE_OUTPUT', 'Generated docs must remain outside production/test/build scopes');
  if (!Array.isArray(index.sourceFiles) || !index.sourceFiles.length || index.sourceFiles.length > 512 || !Array.isArray(index.flows) || !index.flows.length || index.flows.length > 512) fail('INVALID_FLOW_DOCUMENTATION', 'Declare 1..512 source files and charts');
  const sourceFiles = index.sourceFiles.map(f => relative(f, true)).sort(compare), sourceSet = new Set(sourceFiles.map(f => f.toLowerCase()));
  if (sourceSet.size !== sourceFiles.length) fail('INVALID_FLOW_DOCUMENTATION', 'Admitted source paths must be distinct including case');
  const protectedPaths = [...new Set((index.protectedPaths ?? []).map(protectedPath))].sort(compare);
  const flows = index.flows.slice().sort((a, b) => compare(a.id, b.id)), ids = new Set<string>();
  for (const f of flows) {
    if (!plain(f) || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(f.id) || ids.has(f.id)) fail('INVALID_FLOW_DOCUMENTATION', 'Declare unique stable flow IDs');
    ids.add(f.id); if (!f.chart || typeof f.chart.toMermaid !== 'function') fail('INVALID_CHART_EXPORT', 'Each flow requires an explicit trusted chart');
    if (f.description !== undefined) text(f.description, 'caller-declared flow purpose');
    for (const b of f.opaqueBoundaries ?? []) text(b, 'opaque boundary');
    if (f.mountId !== undefined) text(f.mountId, 'construction mount ID', 1024);
    if (f.sources !== undefined && (!Array.isArray(f.sources) || f.sources.length > 512)) fail('INVALID_FLOW_DOCUMENTATION', 'Source owners must be a bounded explicit array');
    for (const s of f.sources ?? []) { if (!plain(s) || !sourceFiles.includes(relative(s.file, true)) || Object.keys(s).some(k => !['file', 'symbol', 'unitId', 'stageId', 'role'].includes(k))) fail('SOURCE_NOT_ADMITTED', 'Flow source must identify admitted source'); for (const k of ['symbol', 'unitId', 'stageId', 'role'] as const) if (s[k] !== undefined) text(s[k], 'source selector', 512); }
  }
  for (const f of flows) {
    const seen = new Set([f.id]); let parent = f.parentId;
    while (parent !== undefined) { if (!ids.has(parent) || seen.has(parent)) fail('INVALID_FLOW_HIERARCHY', 'Explicit parent links must form an acyclic registered hierarchy'); seen.add(parent); parent = flows.find(x => x.id === parent)!.parentId; }
    if (f.mountId !== undefined && f.parentId === undefined) fail('INVALID_FLOW_HIERARCHY', 'A mount ID requires an explicit parent flow');
  }
  let sourceCharacters = 0; const sourceHashes: Record<string, string> = Object.create(null);
  for (const file of sourceFiles) { const source = await read(root, file); sourceCharacters += source.length; if (sourceCharacters > 10000000) fail('DOCUMENTATION_LIMIT', 'Admitted source exceeds ten million characters'); sourceHashes[file] = sha(source); }
  const sourceTreeSha256 = sha(JSON.stringify(Object.entries(sourceHashes))), files: Record<string, string> = Object.create(null), rows: string[] = [];
  const proofs: ApplicationFlowDocumentation['manifest']['flows'][number][] = [];
  for (const f of flows) {
    const diagram = text(f.chart.toMermaid(), 'chart diagram', 1000000), exported = f.chart.toMCPTool?.();
    if (exported !== undefined) { if (!plain(exported)) fail('INVALID_CHART_EXPORT', 'MCP exporter must return plain tool metadata'); text(exported.name, 'MCP tool name', 160); text(exported.description, 'MCP description', 1000000); }
    const description = f.chart.description === undefined || f.chart.description === '' ? undefined : text(f.chart.description, 'chart description', 1000000);
    const constructed = constructedStages(f.chart.root);
    // Some SDK versions/views supply a title-only FlowChart description. Keep it verbatim,
    // but use actual constructed nodes for the outline instead of presenting a title as an algorithm.
    const meaningfulDescription = description && (!/^\s*FlowChart:/.test(description) || /\nSteps:\s*\n\S/.test(description)) ? description : undefined;
    const algorithm = meaningfulDescription ?? (constructed.length ? 'Constructed topology (callback semantics unresolved):\n' + constructed.map((n, i) => `${i + 1}. ${n.name} [${n.id}; ${n.kind}]${n.edges ? ' — ' + n.edges : ''}`).join('\n') : exported?.description) ?? 'No algorithm description supplied by this chart. Inspect the actual topology and owning source.';
    const origin = meaningfulDescription ? 'chart-metadata' as const : constructed.length ? 'constructed-topology' as const : exported ? 'mcp-export-description' as const : 'unavailable' as const;
    const file = flowFile(f.id), link = (id: string) => path.posix.relative(path.posix.dirname(file), flowFile(id));
    const compact = (f.description ?? algorithm).replace(/\s+/g, ' ').trim();
    const summary = compact.length > 280 ? compact.slice(0, 277) + '…' : compact;
    rows.push(`| [${html(f.id)}](${file}) | ${html(summary)} | ${f.parentId ? html(f.parentId) : 'entry'} |`);
    const children = flows.filter(c => c.parentId === f.id);
    const stages = f.chart.stageDescriptions instanceof Map ? [...f.chart.stageDescriptions.entries()] : f.chart.stageDescriptions === undefined ? [] : Object.entries(f.chart.stageDescriptions);
    if (stages.length > 4096) fail('DOCUMENTATION_LIMIT', 'Stage descriptions exceed 4096 entries');
    const stageLines = stages.sort(([a], [b]) => compare(a, b)).map(([id, value]) => `| ${html(text(id, 'stage description ID', 1024))} | ${html(text(value, 'stage description', 32000))} |`);
    const schema = (value: unknown) => { if (value === undefined || !plain(value) && !Array.isArray(value) && typeof value !== 'boolean') return 'Not supplied as exported JSON metadata.'; const out = json(value); if (out.length > 1000000) fail('DOCUMENTATION_LIMIT', 'Schema exceeds one million characters'); return fence(out.trimEnd(), 'json'); };
    let page = `${HEADER}\n# ${html(f.id)}\n\n[Application index](../../README.md)${f.parentId ? ` · [Parent: ${html(f.parentId)}](${link(f.parentId)})` : ''}\n\n${f.description ? `Caller-declared purpose: ${html(f.description)}\n\n` : ''}## Generated algorithm\n\nOrigin: ${origin}. Stage wording is construction-time metadata; it does not verify callback semantics.\n\n${fence(algorithm, 'text')}\n\n## Actual chart export\n\n${fence(diagram, 'mermaid')}\n\n`;
    if (description && description !== algorithm) page += `## Builder description (verbatim)\n\n${fence(description, 'text')}\n\n`;
    if (stageLines.length) page += `## Stage descriptions\n\n| Stage | Declared description |\n| --- | --- |\n${stageLines.join('\n')}\n\n`;
    if (constructed.length) page += `## Constructed stage inventory\n\nTraversal order below locates actual nodes; it is not an execution trace.\n\n| Stage ID | Name | Control | Outgoing edges |\n| --- | --- | --- | --- |\n${constructed.map(n => `| ${html(n.id)} | ${html(n.name)} | ${html(n.kind)} | ${html(n.edges)} |`).join('\n')}\n\n`;
    page += `## Contracts\n\n${exported ? 'Tool name: ' + html(exported.name) + '. Formatted metadata only.\n\n' + (exported.description !== algorithm ? 'MCP-exported description:\n\n' + fence(exported.description, 'text') + '\n\n' : '') : ''}Input schema:\n\n${schema(exported?.inputSchema ?? f.chart.inputSchema)}\n\nOutput schema:\n\n${schema(f.chart.outputSchema)}\n\n## Child flows\n\nRelationships are explicitly declared by the construction-time application index.\n\n${children.length ? '| Flow | Mount |\n| --- | --- |\n' + children.map(c => `| [${html(c.id)}](${link(c.id)}) | ${html(c.mountId ?? '(not supplied)')} |`).join('\n') : 'No child flow registered for this view; this is not proof that dynamic or host-owned work is absent.'}\n\n## Owning source\n\n`;
    page += (f.sources?.length ? f.sources.map(s => `- [${html(s.file)}](${path.posix.relative(path.posix.dirname(`${outputDir}/${file}`), s.file)})${s.symbol ? ' — declared symbol ' + html(s.symbol) : ''}; SHA-256 \`${sourceHashes[s.file]}\`.`).join('\n') : 'No owning source declared for this view; implementation remains unresolved.') + '\n\n';
    page += `## Boundaries\n\n${(f.opaqueBoundaries ?? []).map(b => '- ' + html(b)).join('\n') || 'Only explicitly admitted sources and registered chart exports are covered.'}\n\nSource tree: \`${sourceTreeSha256}\`. Topology is static; no stage, provider or executor was run.\n`;
    if (page.length > 2000000) fail('DOCUMENTATION_LIMIT', 'Complete flow page exceeds two million characters; nothing was clipped');
    files[file] = page; proofs.push({ id: f.id, file, ...(f.parentId ? { parentId: f.parentId } : {}), ...(f.mountId ? { mountId: f.mountId } : {}), chartSha256: sha(diagram), algorithmSha256: sha(algorithm), algorithmOrigin: origin });
  }
  files['README.md'] = `${HEADER}\n# ${html(name)}: generated algorithms\n\nStart with an entry flow, then open only the relevant child flow and owning source. Summaries come from chart metadata unless a caller-declared purpose is supplied; full algorithms and diagrams are on each page.\n\n| Flow | Summary | Parent |\n| --- | --- | --- |\n${rows.join('\n')}\n\nSource tree: \`${sourceTreeSha256}\`. Rebuild charts freshly using the runtime factories before generating or checking these pages. Metadata freshness does not establish semantic accuracy or runtime behavior.\n`;
  const total = Object.values(files).reduce((n, s) => n + s.length, 0); if (total > 16000000) fail('DOCUMENTATION_LIMIT', 'Generated documentation exceeds sixteen million characters; nothing was omitted');
  for (const f of sourceFiles) if (sha(await read(root, f)) !== sourceHashes[f]) fail('SOURCE_CHANGED_DURING_DOCUMENTATION_BUILD', `Admitted source changed during chart export: ${f}`);
  return { files, manifest: { schemaVersion: 1, producer: PRODUCER, applicationName: name, outputDir, sourceTreeSha256, sourceHashes, protectedPaths, flows: proofs, files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => compare(a, b)).map(([f, value]) => [f, { sha256: sha(value), characters: value.length }])), coverage: { scope: 'explicitly-registered-construction-time-charts', completeApplication: false, executedCallbacks: false, semantics: 'metadata-and-topology-not-runtime-proof' } } };
}

async function validate(root: string, d: ApplicationFlowDocumentation): Promise<void> {
  staticData(d);
  const m = d.manifest;
  if (!plain(m) || m.schemaVersion !== 1 || m.producer !== PRODUCER || !plain(d.files) || !plain(m.sourceHashes) || !plain(m.files) || !Array.isArray(m.flows) || !Array.isArray(m.protectedPaths)) fail('INVALID_DOCUMENTATION_PROOF', 'Expected generated flow documentation and manifest');
  const files = Object.keys(d.files).sort(compare), declared = Object.keys(m.files).sort(compare), hashes: Record<string, string> = Object.create(null);
  if (!files.length || JSON.stringify(files) !== JSON.stringify(declared) || !files.includes('README.md')) fail('INVALID_DOCUMENTATION_PROOF', 'Generated file inventory differs');
  for (const f of files) if (!pagePath(f) || typeof d.files[f] !== 'string' || !d.files[f]!.startsWith(HEADER) || sha(d.files[f]!) !== m.files[f]?.sha256 || d.files[f]!.length !== m.files[f]?.characters) fail('INVALID_DOCUMENTATION_PROOF', 'Generated page differs from its bounded proof');
  if (m.flows.length < 1 || m.flows.length > 512 || new Set(m.flows.map(f => f.id)).size !== m.flows.length || m.flows.some(f => flowFile(f.id) !== f.file || !files.includes(f.file)) || files.length !== m.flows.length + 1) fail('INVALID_DOCUMENTATION_PROOF', 'Flow page membership differs');
  const sources = Object.keys(m.sourceHashes).sort(compare); if (!sources.length || sources.length > 512) fail('INVALID_DOCUMENTATION_PROOF', 'Expected explicitly admitted source inventory');
  for (const f of sources) { relative(f, true); const value = await read(root, f); hashes[f] = sha(value); if (hashes[f] !== m.sourceHashes[f]) fail('STALE_APPLICATION_FLOW_DOCUMENTATION', `Admitted source changed: ${f}`); }
  if (sha(JSON.stringify(Object.entries(hashes))) !== m.sourceTreeSha256) fail('INVALID_DOCUMENTATION_PROOF', 'Source tree proof differs');
  for (const p of m.protectedPaths) protectedPath(p);
  if (!plain(m.coverage) || m.coverage.scope !== 'explicitly-registered-construction-time-charts' || m.coverage.completeApplication !== false || m.coverage.executedCallbacks !== false || m.coverage.semantics !== 'metadata-and-topology-not-runtime-proof') fail('INVALID_DOCUMENTATION_PROOF', 'Documentation must retain its construction-time boundary');
}
async function outputState(options: ApplicationFlowDocumentationOutputOptions) {
  staticData(options);
  const root = await fs.realpath(options.root), d = options.documentation; await validate(root, d);
  const outputDir = relative(options.outputDir ?? d.manifest.outputDir), blocked = [...Object.keys(d.manifest.sourceHashes), ...d.manifest.protectedPaths];
  if (outputDir !== relative(d.manifest.outputDir)) fail('OUTPUT_DIRECTORY_MISMATCH', 'Rebuild documentation for a changed output directory so source links remain correct');
  if (blockedOutput(outputDir) || blocked.some(p => overlap(p, outputDir))) fail('UNSAFE_OUTPUT', 'Generated docs must be outside source/protected scopes');
  const outputs: Record<string, string> = Object.create(null);
  for (const [file, value] of Object.entries(d.files)) outputs[`${outputDir}/${file}`] = value;
  outputs[`${outputDir}/manifest.json`] = json(d.manifest);
  const ownershipPath = `${outputDir}/${OWNER}`, oldText = await existing(root, ownershipPath);
  let oldFiles: Record<string, string> = Object.create(null);
  if (oldText !== undefined) {
    let old: unknown; try { old = JSON.parse(oldText); } catch { fail('INVALID_OUTPUT_OWNERSHIP', 'Invalid documentation ownership file'); }
    if (!plain(old) || old.schemaVersion !== 1 || old.producer !== PRODUCER || !plain(old.files) || Object.entries(old.files).some(([f, hash]) => !(pagePath(f) || f === 'manifest.json') || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) fail('INVALID_OUTPUT_OWNERSHIP', 'Unknown documentation output ownership');
    oldFiles = (old as Record<string, unknown>).files as Record<string, string>;
  }
  // Do not adopt arbitrary output or remove manually edited obsolete pages.
  const onDisk: string[] = [];
  async function walk(dir: string) { for (const e of await fs.readdir(await target(root, dir, true), { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; })) { const f = `${dir}/${e.name}`; await target(root, f); if (e.isDirectory()) await walk(f); else { if (!e.isFile()) fail('UNOWNED_OUTPUT', 'Non-file documentation output'); onDisk.push(f.slice(outputDir.length + 1)); } } }
  await walk(outputDir);
  if (onDisk.some(f => f !== OWNER && !Object.hasOwn(oldFiles, f))) fail('UNOWNED_OUTPUT', 'Generated output directory contains unowned files');
  const removed: string[] = [];
  for (const [file, hash] of Object.entries(oldFiles)) if (!Object.hasOwn(outputs, `${outputDir}/${file}`)) { const value = await existing(root, `${outputDir}/${file}`); if (value !== undefined && sha(value) !== hash) fail('MODIFIED_OBSOLETE_OUTPUT', `Preserve modified obsolete page: ${file}`); if (value !== undefined) removed.push(`${outputDir}/${file}`); }
  if (options.readmeFile !== undefined) {
    const file = relative(options.readmeFile);
    if (!/\.(?:md|markdown)$/i.test(file) || blockedOutput(file) || overlap(file, outputDir) || blocked.some(p => overlap(p, file))) fail('UNSAFE_OUTPUT', 'README target overlaps generated/source/protected scopes');
    const original = await existing(root, file) ?? `# ${html(d.manifest.applicationName)}\n`, start = original.split(BEGIN).length - 1, end = original.split(END).length - 1;
    if (start !== end || start > 1 || start === 1 && original.indexOf(BEGIN) > original.indexOf(END)) fail('INVALID_GENERATED_MARKERS', 'Generated README markers are invalid');
    const link = path.posix.relative(path.posix.dirname(file), `${outputDir}/README.md`), block = `${BEGIN}\nGenerated algorithms and child-flow links: [application flow index](${link}).\nSource identity: \`${d.manifest.sourceTreeSha256}\`.\n${END}`;
    outputs[file] = start ? original.slice(0, original.indexOf(BEGIN)) + block + original.slice(original.indexOf(END) + END.length) : original + (original.endsWith('\n') ? '\n' : '\n\n') + block + '\n';
  }
  outputs[ownershipPath] = json({ schemaVersion: 1, producer: PRODUCER, files: Object.fromEntries(Object.entries(outputs).filter(([f]) => f.startsWith(outputDir + '/')).map(([f, value]) => [f.slice(outputDir.length + 1), sha(value)])) });
  for (const f of [...Object.keys(outputs), ...removed]) await target(root, f, true);
  return { root, outputs, removed };
}
/** Read-only freshness check. Pass documentation reconstructed from fresh runtime charts to detect chart/metadata changes. */
export async function checkApplicationFlowDocumentation(options: ApplicationFlowDocumentationOutputOptions): Promise<{ valid: boolean; differences: readonly string[]; files: readonly string[] }> {
  const state = await outputState(options), differences = [...state.removed];
  for (const [file, value] of Object.entries(state.outputs)) if (await existing(state.root, file) !== value) differences.push(file);
  return { valid: differences.length === 0, differences: differences.sort(compare), files: Object.keys(state.outputs).sort(compare) };
}
/** Explicit build-time writer; validates all inputs/ownership before writes and replaces each changed file atomically. */
export async function writeApplicationFlowDocumentation(options: ApplicationFlowDocumentationOutputOptions): Promise<{ changed: readonly string[]; removed: readonly string[]; files: readonly string[] }> {
  const state = await outputState(options), changed: string[] = [], staged: { file: string; temp: string }[] = [];
  try {
    for (const [file, value] of Object.entries(state.outputs)) {
      if (await existing(state.root, file) === value) continue;
      const filename = await target(state.root, file, true); await fs.mkdir(path.dirname(filename), { recursive: true });
      const temp = filename + '.smallbusiness-' + randomUUID() + '.tmp'; await fs.writeFile(temp, value, { flag: 'wx', mode: 0o644 }); staged.push({ file, temp });
    }
    await validate(state.root, options.documentation);
    for (const { file, temp } of staged) { await fs.rename(temp, await target(state.root, file, true)); changed.push(file); }
    for (const file of state.removed) await fs.unlink(await target(state.root, file));
  } finally { for (const { temp } of staged) await fs.rm(temp, { force: true }); }
  return { changed: changed.sort(compare), removed: state.removed.sort(compare), files: Object.keys(state.outputs).sort(compare) };
}
