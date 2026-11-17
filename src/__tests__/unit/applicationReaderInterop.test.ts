import {describe,it,expect,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import{createHash}from'node:crypto';
import{buildApplicationDeveloperContext}from'../../developer/application.js';
import{createDeveloperSourceReader}from'../../developer/node.js';
import type{DeveloperSourceManifest}from'../../developer/types.js';
import{analyzeDeveloperSource}from'../../../scripts/developer/build-manifest.mjs';
const roots:string[]=[];afterEach(async()=>{for(const r of roots.splice(0))await fs.rm(r,{recursive:true,force:true});});
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
describe('application packet / follow-up reader formats',()=>{
 for(const[extension,body]of Object.entries({cjs:'module.exports={run(v){return v;}};',mts:'export function run(v:number){return v;}',cts:'function run(v:number){return v;} export = run;',jsx:'export const run=v=><span>{v}</span>;',tsx:'export const run=(v:number)=><span>{v}</span>;'}))it(`reuses current complete ${extension} packet spans without loading application code`,async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'smb-app-interop-'));roots.push(root);await fs.mkdir(path.join(root,'src'));
  const file=`src/app.${extension}`,source='throw new Error("must not execute");\n'+body;await fs.writeFile(path.join(root,file),source);
  const context=await buildApplicationDeveloperContext({root,goal:'run',index:{applicationName:'Interop',sourceFiles:[file],flows:[{id:'run',sources:[{file}]}],development:{entry:{file,exportName:'run'},commands:{test:'application-approved test'},smokeTest:{text:'// public application-approved example\n'}}}});
  const record=analyzeDeveloperSource(file,Buffer.from(source));expect(record.parseStatus).toBe('parsed');
  const manifest:DeveloperSourceManifest={schemaVersion:1,scope:'source-only-static-syntax',package:{name:'app',version:'1'},parser:{name:'@babel/parser',version:'test'},sourceTreeSha256:sha(JSON.stringify([[file,record.sha256]])),files:{[file]:record}};
  const reader=await createDeveloperSourceReader({root,manifest,characterBudget:16000});
  const knownSpans=context.manifest.sources.map(s=>({file:s.file,moduleSha256:s.moduleSha256,start:s.start,end:s.end,textSha256:s.sourceSha256}));
  const result=await reader.inspectBatch([{file}],{includeSource:true,knownSpans});expect(result.sourceChars).toBe(0);expect(JSON.stringify(result)).not.toContain(source);
  const reread=await reader.inspectBatch([{file}],{includeSource:true,knownSpans,reread:true});expect(reread.sourceChars).toBe(source.length);
  await fs.appendFile(path.join(root,file),'\n// changed');const stale=await reader.inspectBatch([{file}],{includeSource:true,knownSpans});expect(stale.sourceChars).toBe(0);expect(JSON.stringify(stale)).toContain('stale');
 });
});
