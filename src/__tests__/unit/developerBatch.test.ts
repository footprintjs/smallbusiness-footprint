import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {analyzeDeveloperSource} from '../../../scripts/developer/build-manifest.mjs';
import {createDeveloperSourceReader,DeveloperBudgetError} from '../../developer/node.js';
import {resolveDeveloperSource} from '../../developer/index.js';
import type {DeveloperSourceManifest,DeveloperKnownSourceSpan,DeveloperSourceUnit} from '../../developer/types.js';
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex'),temporary:string[]=[];
afterEach(async()=>{await Promise.all(temporary.splice(0).map(p=>fs.rm(p,{recursive:true,force:true})));});
async function fixture(files:Record<string,string>={'src/fixture.ts':`// 😀\nexport function first(x:number){return x+1;}\nexport function second(x:number){return first(x)*2;}\n`}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'smb-source-batch-'));temporary.push(root);
 const records=Object.fromEntries(await Promise.all(Object.entries(files).map(async([file,text])=>{await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),text);return[file,analyzeDeveloperSource(file,Buffer.from(text))];})));
 const manifest:DeveloperSourceManifest={schemaVersion:1,scope:'source-only-static-syntax',package:{name:'fixture',version:'1'},parser:{name:'@babel/parser',version:'8.1.2'},sourceTreeSha256:sha(JSON.stringify(Object.entries(records).map(([f,r])=>[f,(r as {sha256:string}).sha256]))),files:records};return{root,manifest,files};
}
const makeReader=(f:Awaited<ReturnType<typeof fixture>>,characterBudget=100_000)=>createDeveloperSourceReader({root:f.root,manifest:f.manifest,characterBudget});
describe('canonical hook sources and atomic batched reads',()=>{
 it('indexes complete method/property hooks with qualified symbols through TypeScript wrappers',()=>{
  const text=`export function configure(){const hooks=({run(x:number){return x+1;},check:(x:number)=>x>0,nested:{['guard-name'](){return true;}}} satisfies Record<string,unknown>);return hooks;}`,m=analyzeDeveloperSource('src/hook.ts',Buffer.from(text));
  for(const[symbol,body,form]of [['configure/hooks.run','run(x:number){return x+1;}','object-method'],['configure/hooks.check','check:(x:number)=>x>0','object-property'],['configure/hooks.nested["guard-name"]',"['guard-name'](){return true;}",'object-method']]){const u=m.units.find((u:DeveloperSourceUnit)=>u.symbol===symbol);expect(u?.sourceForm).toBe(form);expect(text.slice(u.start,u.end)).toBe(body);expect(u.textSha256).toBe(sha(body));}
 });
 it('resolves exact real chart hook method/property spans in the production source catalog',async()=>{
  const lib=fileURLToPath(new URL('../../../',import.meta.url)),d=JSON.parse(await fs.readFile(path.join(lib,'docs/flows/manifest.json'),'utf8')),m=analyzeDeveloperSource('src/aftersales/runtime.ts',await fs.readFile(path.join(lib,'src/aftersales/runtime.ts')));
  const hooks=Object.values(d.sourceFacts.hooks) as {source:{start:number;end:number}}[];expect(hooks.length).toBeGreaterThan(10);
  for(const h of hooks){const u=m.units.find((u:DeveloperSourceUnit)=>u.kind==='function'&&u.start===h.source.start&&u.end===h.source.end);expect(u,JSON.stringify(h.source)).toBeDefined();expect(u.sourceForm).toMatch(/object-/);}
 });
 it('keeps dynamic method identities unknown and rejects shadowed/reassigned native factories',()=>{
  const t=`import {flowChart as chart} from 'footprintjs'; const key='x';const hooks={ [key](){return true;},local(chart:any){return chart('fake',()=>1,'fake');}};chart=(()=>null) as any;chart('unproven',()=>1,'bad');`,m=analyzeDeveloperSource('src/fixture.ts',Buffer.from(t));expect(m.parseStatus).toBe('parsed');expect(m.units.some((u:DeveloperSourceUnit)=>u.symbol==='hooks.key')).toBe(false);expect(m.units.filter((u:DeveloperSourceUnit)=>u.kind==='callback')).toEqual([]);
 });
 it('reads admitted JavaScript without executing it and does not accept TypeScript grammar in .js',async()=>{
  const f=await fixture({'src/app.mjs':`throw new Error('APPLICATION_EXECUTED');\nexport function read(){return 7;}`}),r=await makeReader(f),v=await r.inspectBatch([{file:'src/app.mjs',symbol:'read'}],{includeSource:true});expect(v.status).toBe('batch');expect(JSON.stringify(v)).toContain('function read');expect(analyzeDeveloperSource('src/a.js',Buffer.from('const n:number=1;')).parseStatus).toBe('unsupported');
 });
 it('deduplicates repeated/nested selections and charges the whole shared response once',async()=>{
  const f=await fixture(),r=await makeReader(f),v=await r.inspectBatch([{file:'src/fixture.ts',symbol:'first'},{file:'src/fixture.ts',symbol:'first'},{file:'src/fixture.ts'}],{includeSource:true});expect(v.files).toHaveLength(1);expect(v.selections).toHaveLength(3);expect(v.fragments).toHaveLength(1);expect(v.sourceChars).toBe(f.files['src/fixture.ts'].length);expect((v.fragments as {text:string}[])[0].text).toBe(f.files['src/fixture.ts']);expect(v.responseChars).toBe(JSON.stringify(v).length);
 });
 it('omits verified caller-declared known spans, allows reread, and never asserts memory',async()=>{
  const f=await fixture(),r=await makeReader(f),u=f.manifest.files['src/fixture.ts'].units.find(u=>u.symbol==='first')!,k:DeveloperKnownSourceSpan={file:'src/fixture.ts',moduleSha256:f.manifest.files['src/fixture.ts'].sha256,start:u.start,end:u.end,textSha256:u.textSha256};
  const a=await r.inspectBatch([{file:k.file,symbol:'first'}],{includeSource:true,knownSpans:[k]});expect(a.sourceChars).toBe(0);expect(a.omittedKnownSourceChars).toBe(u.end-u.start);expect(a.fragments).toMatchObject([{status:'known-current'}]);expect(JSON.stringify(a)).not.toContain('function first');expect(a.reuse).toContain('does not assert memory');
  const b=await r.inspectBatch([{file:k.file,symbol:'first'}],{includeSource:true,knownSpans:[k],reread:true});expect(b.sourceChars).toBe(u.end-u.start);expect(JSON.stringify(b)).toContain('function first');
  for(const wrong of [{...k,moduleSha256:'0'.repeat(64)},{...k,textSha256:'0'.repeat(64)}])expect((await r.inspectBatch([{file:k.file,symbol:'first'}],{includeSource:true,knownSpans:[wrong]})).sourceChars).toBeGreaterThan(0);
 });
 it('withholds every body if any selection is missing, stale or forged',async()=>{
  const f=await fixture(),r=await makeReader(f);const missing=await r.inspectBatch([{file:'src/fixture.ts',symbol:'first'},{file:'src/missing.ts'}],{includeSource:true});expect(missing.status).toBe('batch-unavailable');expect(missing.sourceChars).toBe(0);expect(JSON.stringify(missing)).not.toContain('function first');expect(missing).not.toHaveProperty('fragments');
  await fs.appendFile(path.join(f.root,'src/fixture.ts'),'\n// changed');expect((await r.inspectBatch([{file:'src/fixture.ts'}],{includeSource:true})).status).toBe('batch-unavailable');
  await fs.writeFile(path.join(f.root,'src/fixture.ts'),f.files['src/fixture.ts']);const forged=structuredClone(f.manifest);(forged.files['src/fixture.ts'].units[0] as {textSha256:string}).textSha256='0'.repeat(64);const bad=await createDeveloperSourceReader({root:f.root,manifest:forged,characterBudget:10000});expect((await bad.inspectBatch([{file:'src/fixture.ts',unitId:forged.files['src/fixture.ts'].units[0].id}],{includeSource:true})).status).toBe('batch-unavailable');
 });
 it('rejects invalid selectors/accessors and leaves admission untouched after a budget refusal',async()=>{
  const f=await fixture(),r=await makeReader(f,900),get=vi.fn(()=>{throw Error('GETTER_EXECUTED');}),selector=Object.defineProperty({},'file',{enumerable:true,get});await expect(r.inspectBatch([selector as never],{includeSource:true})).rejects.toThrow('Invalid source selector');expect(get).not.toHaveBeenCalled();
  for(const xs of [[],Array.from({length:33},()=>({file:'src/fixture.ts'})),[{file:'../private.ts'}],[{file:'src/__tests__/private.ts'}]])await expect(r.inspectBatch(xs,{includeSource:true})).rejects.toBeInstanceOf(TypeError);
  await expect(r.inspectBatch([{file:'src/fixture.ts'}],{includeSource:true})).rejects.toBeInstanceOf(DeveloperBudgetError);const v=await r.verify('src/fixture.ts');expect(v.cumulativeChars).toBe(v.responseChars);
 });
 it('retains legacy nested-function and binding selectors while adding qualified method units',()=>{
  const nested='function internal(){function child(){return 2;}return child();}',t=`export function outer(){const hooks={run(){function helper(){return 1;}const setting=1;return helper();},named:${nested}};return hooks;}`,m=analyzeDeveloperSource('src/fixture.ts',Buffer.from(t));
  for(const symbol of ['outer/helper','outer/setting','outer/internal','outer/internal/child'])expect(m.units.some((u:DeveloperSourceUnit)=>u.symbol===symbol),symbol).toBe(true);
  const legacy=m.units.find((u:DeveloperSourceUnit)=>u.symbol==='outer/internal');expect(legacy.id).toBe(`function:${t.indexOf(nested)}:${t.indexOf(nested)+nested.length}`);expect(legacy.sourceForm).toBeUndefined();expect(m.units.some((u:DeveloperSourceUnit)=>u.symbol==='outer/hooks.named'&&u.sourceForm==='object-property')).toBe(true);
 });
 it('resolves same-named hooks by their qualified object scopes',async()=>{
  const f=await fixture({'src/fixture.ts':'export function outer(){const left={run(){return 1;}};const right={run(){return 2;}};return {left,right};}'}),r=await makeReader(f);expect(resolveDeveloperSource(f.manifest,{file:'src/fixture.ts',symbol:'run'}).status).toBe('unknown');const v=await r.inspectBatch([{file:'src/fixture.ts',symbol:'outer/left.run'},{file:'src/fixture.ts',symbol:'outer/right.run'}],{includeSource:true});expect(v.status).toBe('batch');expect(v.fragments).toHaveLength(2);expect(v.sourceChars).toBe('run(){return 1;}'.length+'run(){return 2;}'.length);
 });
});
