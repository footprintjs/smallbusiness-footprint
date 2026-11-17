/** Optional Node-only source tooling. Never imports or executes application modules. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {describeDeveloperService, resolveDeveloperSource} from './index.js';
import type {DeveloperConfiguredFlowRegistry, DeveloperSourceManifest, DeveloperSourceSelector, DeveloperInspectBatchOptions, DeveloperKnownSourceSpan} from './types.js';
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
function sourcePath(file: string): boolean { return typeof file === 'string' && /^src\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:[cm]?[jt]s|jsx|tsx)$/.test(file) && !file.split('/').some(part => part === '..' || part === '.' || part === '__tests__' || part === '__fixtures__'); }
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
  function staticRecord(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw new TypeError('Invalid '+label);
    const out: Record<string, unknown> = Object.create(null);
    for (const [key,d] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!allowed.includes(key) || !Object.hasOwn(d,'value')) throw new TypeError('Invalid '+label);
      out[key]=d.value;
    }
    return out;
  }
  function staticArray(value: unknown, maximum: number, label: string): unknown[] {
    if (!Array.isArray(value) || value.length>maximum) throw new TypeError('Invalid '+label);
    const out: unknown[]=[];
    for (let i=0;i<value.length;i++) { const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Invalid '+label);out.push(d.value); }
    return out;
  }
  const hashValue=(value: unknown): value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  return {
    /** One atomic admission. Explicit known spans suppress matching current bytes, not source access or model memory. */
    async inspectBatch(input: readonly DeveloperSourceSelector[], inputOptions: DeveloperInspectBatchOptions = {}): Promise<DeveloperReadResult> {
      const raw=staticArray(input,32,'source selection batch');if(!raw.length)throw new TypeError('Source selection batch is empty');
      const selectors=raw.map(value=>{
        const s=staticRecord(value,['file','symbol','unitId','stageId','role'],'source selector');
        if(typeof s.file!=='string'||!sourcePath(s.file)||Object.entries(s).some(([key,v])=>key!=='file'&&v!==undefined&&(typeof v!=='string'||!v.length||v.length>1024)))throw new TypeError('Invalid production source selector');
        return s as DeveloperSourceSelector;
      });
      const batchOptions=staticRecord(inputOptions,['includeSource','knownSpans','reread'],'batch options');
      for(const flag of ['includeSource','reread'])if(batchOptions[flag]!==undefined&&typeof batchOptions[flag]!=='boolean')throw new TypeError('Invalid batch option');
      const known=staticArray(batchOptions.knownSpans??[],512,'known source spans').map(value=>{
        const s=staticRecord(value,['file','moduleSha256','start','end','textSha256'],'known source span');
        if(typeof s.file!=='string'||!sourcePath(s.file)||!hashValue(s.moduleSha256)||!hashValue(s.textSha256)||!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||(s.start as number)<0||(s.end as number)<(s.start as number))throw new TypeError('Invalid known source span');
        return s as DeveloperKnownSourceSpan;
      });
      const reads=new Map<string,Awaited<ReturnType<typeof read>>>();
      for(const file of [...new Set(selectors.map(s=>s.file))])reads.set(file,await read(file));
      const failures: {index:number;file:string;status:string;reason:string}[]=[];
      const chosen: {selector:DeveloperSourceSelector;unit?:import('./types.js').DeveloperSourceUnit;start:number;end:number}[]=[];
      for(const [index,selector] of selectors.entries()) {
        const current=reads.get(selector.file);
        const fail=(status:string,reason:string)=>failures.push({index,file:selector.file,status,reason});
        if(!current){fail('unknown','Source is not admitted or unavailable');continue;}
        if(current.hash!==current.record.sha256){fail('stale','Current source differs from its manifest');continue;}
        if(!current.validEncoding){fail('unknown','Source encoding is unsupported');continue;}
        const selected=selector.symbol||selector.unitId||selector.role||selector.stageId;
        const reference=selected?resolveDeveloperSource(manifest,selector):undefined;
        if(reference?.status==='unknown'){fail('unknown',reference.reason??'Source selector was not resolved');continue;}
        const unit=reference?.unit,start=unit?.start??0,end=unit?.end??current.text.length;
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>current.text.length){fail('unknown','Manifest source range is invalid');continue;}
        if(unit&&(sha(current.text.slice(start,end))!==unit.textSha256||unit.byteStart!==Buffer.byteLength(current.text.slice(0,start))||unit.byteEnd!==Buffer.byteLength(current.text.slice(0,end))||unit.startLine!==current.text.slice(0,start).split('\n').length||unit.endLine!==current.text.slice(0,end).split('\n').length)){fail('unknown','Manifest range proof does not match current source');continue;}
        chosen.push({selector,unit,start,end});
      }
      if(failures.length)return admit({status:'batch-unavailable',reason:'No source returned: every selection must be current and resolved',failures,sourceChars:0});
      // Detect source changes during this multi-file read before publishing any payload.
      for(const [file,before]of reads){const after=await read(file);if(!before||!after||after.hash!==before.hash)return admit({status:'batch-unavailable',reason:'Source changed during the batch read',sourceChars:0});}
      const files=[...reads].map(([file,current])=>({file,hash:current!.hash}));
      const ranges: {file:string;start:number;end:number}[]=[];
      for(const item of [...chosen].sort((a,b)=>a.selector.file.localeCompare(b.selector.file)||a.start-b.start||b.end-a.end)){
        const previous=ranges.at(-1);if(previous&&previous.file===item.selector.file&&item.start<previous.end){previous.end=Math.max(previous.end,item.end);}else if(!previous||previous.file!==item.selector.file||previous.start!==item.start||previous.end!==item.end)ranges.push({file:item.selector.file,start:item.start,end:item.end});
      }
      let sourceChars=0,omittedKnownSourceChars=0;
      const fragments=ranges.map(range=>{
        const current=reads.get(range.file)!,text=current.text.slice(range.start,range.end),textSha256=sha(text);
        const covered=known.some(k=>k.file===range.file&&k.moduleSha256===current.hash&&k.start<=range.start&&k.end>=range.end&&k.end<=current.text.length&&sha(current.text.slice(k.start,k.end))===k.textSha256);
        const print=batchOptions.includeSource===true&&(!covered||batchOptions.reread===true);
        if(print)sourceChars+=text.length;else if(covered&&batchOptions.includeSource===true)omittedKnownSourceChars+=text.length;
        return {file:files.findIndex(f=>f.file===range.file),span:{start:range.start,end:range.end,startLine:current.text.slice(0,range.start).split('\n').length,endLine:current.text.slice(0,range.end).split('\n').length},textSha256,status:print?'source':covered?'known-current':'metadata',...(print?{text}:{})};
      });
      const selections=chosen.map((item,index)=>({index,file:files.findIndex(f=>f.file===item.selector.file),fragment:ranges.findIndex(r=>r.file===item.selector.file&&r.start<=item.start&&r.end>=item.end),span:{start:item.start,end:item.end},...(item.unit?{unitId:item.unit.id,symbol:item.unit.symbol,...(item.unit.sourceForm?{sourceForm:item.unit.sourceForm}:{})}:{sourceForm:'complete-module'})}));
      return admit({status:'batch',sourceTreeSha256:manifest.sourceTreeSha256,files,selections,fragments,sourceChars,omittedKnownSourceChars,authenticity:'caller-trusted-build',semantics:'static-source-not-execution-proof',reuse:'known-current matches current bytes to caller-declared spans; it does not assert memory or prove prior delivery. Use reread:true to request source again.'});
    },
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
