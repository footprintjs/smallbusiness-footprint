/** Optional Node-only source tooling. Never imports or executes application modules. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {describeDeveloperService, resolveDeveloperSource} from './index.js';
import type {DeveloperConfiguredFlowRegistry, DeveloperSourceManifest, DeveloperSourceSelector} from './types.js';
export type DeveloperReadResult = Readonly<Record<string, unknown>> & {
  readonly status: string; readonly sourceChars: number; readonly responseChars: number;
  readonly cumulativeChars: number; readonly remainingChars: number;
};
export class DeveloperBudgetError extends Error {
  readonly code = 'DEVELOPER_BUDGET_EXHAUSTED';
  constructor() { super('Developer response exceeds the remaining character budget'); this.name = 'DeveloperBudgetError'; }
}
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const defaultRoot = fileURLToPath(new URL('../../', import.meta.url));
function sourcePath(file: string): boolean { return typeof file === 'string' && /^src\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.ts$/.test(file) && !file.split('/').some(part => part === '..' || part === '.' || part === '__tests__' || part === '__fixtures__'); }
export async function loadDeveloperSourceManifest(root = defaultRoot): Promise<DeveloperSourceManifest> {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'dist/developer/source-manifest.json'), 'utf8')) as DeveloperSourceManifest;
  if (manifest.schemaVersion !== 1 || manifest.scope !== 'source-only-static-syntax' || !manifest.files || !/^[a-f0-9]{64}$/.test(manifest.sourceTreeSha256)) throw new Error('Unsupported developer source manifest');
  return manifest;
}
/** Every returned response is charged by JSON.stringify(result).length, including its own accounting metadata.
 * An oversized response throws a constant error before returning any source/hash payload; no partial source is emitted.
 * Manifest origin is caller-trusted. Current bytes establish freshness, not release authenticity or business semantics.
 */
export async function createDeveloperSourceReader(options: {
  readonly root?: string; readonly manifest?: DeveloperSourceManifest; readonly characterBudget?: number;
  readonly flowRegistry?: DeveloperConfiguredFlowRegistry;
} = {}) {
  const root = await fs.realpath(options.root ?? defaultRoot);
  const manifest = structuredClone(options.manifest ?? await loadDeveloperSourceManifest(root));
  if (manifest.schemaVersion !== 1 || manifest.scope !== 'source-only-static-syntax') throw new Error('Unsupported developer source manifest');
  const budget = options.characterBudget ?? 4000;
  if (!Number.isSafeInteger(budget) || budget < 0) throw new Error('Character budget must be a nonnegative integer');
  let used = 0;
  function admit(payload: Record<string, unknown> & {status: string; sourceChars: number}): DeveloperReadResult {
    let length = 0, result: DeveloperReadResult;
    for (let step = 0; step < 16; step++) {
      result = {...payload, responseChars: length, cumulativeChars: used + length, remainingChars: budget - used - length};
      const next = JSON.stringify(result).length;
      if (next === length) {
        if (length > budget - used) throw new DeveloperBudgetError();
        used += length;
        return result;
      }
      length = next;
    }
    throw new Error('Developer response accounting did not converge');
  }
  async function read(file: string) {
    if (!sourcePath(file)) throw new Error('Only admitted production source paths are allowed');
    const record = Object.getOwnPropertyDescriptor(manifest.files, file)?.value as DeveloperSourceManifest['files'][string] | undefined;
    if (!record || record.packagePath !== 'dist/source/' + file.slice(4)) return undefined;
    let target = path.join(root, file);
    try { await fs.lstat(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; target = path.join(root, record.packagePath); }
    let resolved: string;
    try { resolved = await fs.realpath(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    const relative = path.relative(root, resolved);
    if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('Source symlink escapes the package/workspace root');
    const bytes = await fs.readFile(resolved), text = bytes.toString('utf8');
    return {record, text, hash: sha(bytes), validEncoding: Buffer.from(text).equals(bytes)};
  }
  return {
    async verify(file: string, expectedHash?: string): Promise<DeveloperReadResult> {
      if (expectedHash !== undefined && !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Expected source hash must be SHA256');
      const current = await read(file);
      if (!current) return admit({status: 'unknown', file, reason: 'Source is not in this manifest or is unavailable', sourceChars: 0});
      return admit({status: current.hash === current.record.sha256 && (!expectedHash || expectedHash === current.hash) ? 'current' : 'stale', file, hash: current.hash, expectedHash: expectedHash ?? current.record.sha256, sourceChars: 0, authenticity: 'caller-trusted-build'});
    },
    async inspect(selector: DeveloperSourceSelector, options: {readonly includeSource?: boolean} = {}): Promise<DeveloperReadResult> {
      const current = await read(selector.file);
      if (!current) return admit({status: 'unknown', file: selector.file, reason: 'Source is not in this manifest or is unavailable', sourceChars: 0});
      if (current.hash !== current.record.sha256) return admit({status: 'stale', file: selector.file, hash: current.hash, expectedHash: current.record.sha256, sourceChars: 0});
      if (!current.validEncoding) return admit({status: 'unknown', file: selector.file, reason: 'Original source encoding is unsupported', sourceChars: 0});
      const selected = selector.symbol || selector.unitId || selector.role || selector.stageId;
      const reference = selected ? resolveDeveloperSource(manifest, selector) : undefined;
      if (reference?.status === 'unknown') return admit({status: 'unknown', file: selector.file, reason: reference.reason, sourceChars: 0});
      const unit = reference?.unit, start = unit?.start ?? 0, end = unit?.end ?? current.text.length;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > current.text.length) return admit({status: 'unknown', reason: 'Manifest source range is invalid', sourceChars: 0});
      const text = current.text.slice(start, end);
      if (unit && (sha(text) !== unit.textSha256 || unit.byteStart !== Buffer.byteLength(current.text.slice(0,start)) || unit.byteEnd !== Buffer.byteLength(current.text.slice(0,end)) || unit.startLine !== current.text.slice(0,start).split('\n').length || unit.endLine !== current.text.slice(0,end).split('\n').length)) return admit({status: 'unknown', reason: 'Manifest range proof does not match current source', sourceChars: 0});
      return admit({status: options.includeSource ? 'source' : 'metadata', file: selector.file, hash: current.hash, sourceTreeSha256: manifest.sourceTreeSha256, sourceForm: unit ? 'manifest-unit' : 'complete-module', span: {start,end,startLine:current.text.slice(0,start).split('\n').length,endLine:current.text.slice(0,end).split('\n').length}, ...(unit ? {unit} : {}), ...(options.includeSource ? {text} : {}), sourceChars: options.includeSource ? text.length : 0, authenticity: 'caller-trusted-build', semantics: 'static-source-not-execution-proof'});
    },
    describe(actionId: string, businessType?: string): DeveloperReadResult {
      const description = describeDeveloperService(actionId, {manifest, flowRegistry: options.flowRegistry, businessType});
      return admit(description ? {status: 'metadata', description, sourceChars: 0} : {status: 'unknown', reason: 'Action is not registered', sourceChars: 0});
    },
  };
}
