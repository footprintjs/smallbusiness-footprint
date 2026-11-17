import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildDeveloperManifest} from './build-manifest.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),sha=b=>createHash('sha256').update(b).digest('hex');
test('actual packed source maps and manifest resolve to one exact production source copy',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'smb-packed-source-'));
 try{
  execFileSync('npm',['run','build'],{cwd:root,stdio:'pipe'});
  const [packed]=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--cache',path.join(temp,'npm-cache'),'--pack-destination',temp],{cwd:root,encoding:'utf8'}));
  const archive=path.join(temp,packed.filename),names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');
  assert.ok(names.every(name=>name.startsWith('package/')&&!name.split('/').includes('..')));
  assert.ok(!names.some(name=>/(?:^|\/)(__tests__|__fixtures__|node_modules|work|research|benchmark)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]s$/.test(name)),'No tests, benchmark/research data or dependencies enter the package');
  const unpacked=path.join(temp,'unpacked');await fs.mkdir(unpacked);execFileSync('tar',['-xzf',archive,'-C',unpacked]);
  const pkgRoot=path.join(unpacked,'package'),manifest=JSON.parse(await fs.readFile(path.join(pkgRoot,'dist/developer/source-manifest.json'),'utf8'));
  assert.deepEqual(manifest,await buildDeveloperManifest(root));
  for(const[file,record]of Object.entries(manifest.files)){
   const copy=await fs.readFile(path.join(pkgRoot,record.packagePath));assert.equal(sha(copy),record.sha256,file);assert.deepEqual(copy,await fs.readFile(path.join(root,file)));assert.ok(!names.includes('package/'+file),'Do not duplicate original source at a second package path');
   for(const unit of record.units){const text=copy.toString('utf8');assert.equal(sha(text.slice(unit.start,unit.end)),unit.textSha256);assert.equal(Buffer.byteLength(text.slice(0,unit.start)),unit.byteStart);assert.equal(Buffer.byteLength(text.slice(0,unit.end)),unit.byteEnd);}
  }
  const maps=names.filter(name=>name.endsWith('.map'));
  assert.ok(maps.some(name=>name.endsWith('.js.map'))&&maps.some(name=>name.endsWith('.d.ts.map')));
  for(const member of maps){const target=path.join(unpacked,member),map=JSON.parse(await fs.readFile(target,'utf8'));assert.equal(map.sourcesContent,undefined,'Use one source copy, not inline duplicates');for(const source of map.sources){const actual=path.resolve(path.dirname(target),map.sourceRoot??'',source),relative=path.relative(pkgRoot,actual);assert.ok(!relative.startsWith('..'));assert.ok(names.includes('package/'+relative.split(path.sep).join('/')),member+' source resolves inside the actual archive');}}
  for(const file of ['dist/index.js','dist/metadata.js','dist/flows/businessServiceComposer.js'])assert.doesNotMatch(await fs.readFile(path.join(pkgRoot,file),'utf8'),/from\s+['"][^'"]*developer/,'Existing runtime entries do not import developer tooling');
  // Exercise the actual public exports and packaged-source fallback, with only
  // declared production dependencies available to this extracted consumer.
  await fs.mkdir(path.join(pkgRoot,'node_modules'));
  const packedManifest=JSON.parse(await fs.readFile(path.join(pkgRoot,'package.json'),'utf8'));
  for(const name of Object.keys(packedManifest.dependencies)){
   const destination=path.join(pkgRoot,'node_modules',name);
   await fs.mkdir(path.dirname(destination),{recursive:true});
   await fs.symlink(await fs.realpath(path.join(root,'node_modules',name)),destination,'dir');
  }
  execFileSync(process.execPath,['--input-type=module','-e',`
   import assert from 'node:assert/strict';
   const main=await import('smallbusiness-footprint');
   const metadata=await import('smallbusiness-footprint/metadata');
   const developer=await import('smallbusiness-footprint/developer');
   const source=await import('smallbusiness-footprint/developer/node');
   const application=await import('smallbusiness-footprint/developer/application');
   const native=await import('smallbusiness-footprint/native');
   assert.equal(typeof native.createNativeBusinessFlow,'function');
   assert.equal(typeof native.safeNativeStage,'function');
   assert.equal(typeof native.getNativeBusinessPolicy,'function');
   const nativeAction='packed-native-policy';
   const nativeScope={tenantId:'packed-tenant',unitId:'packed-unit'};
   const nativeContext={...nativeScope,businessType:'field-service'};
   const wrapped=fn=>native.safeNativeStage(nativeAction,fn);
   const nativeRegistry=main.createBusinessServiceRegistry(undefined,{
    scope:nativeScope,includeResponse:true,
    prepare:async()=>({input:{},context:nativeContext}),
    flowRegistry:{[nativeAction]:{default:dependencies=>native.createNativeBusinessFlow(nativeAction,dependencies,{
     build:request=>native.flowChart('Initialize native iteration',wrapped(scope=>scope.setValue('position',0)),'packed-loop-start')
      .addDeciderFunction('Check native loop',wrapped(scope=>scope.getValue('position')<2?'packed-more':'packed-complete'),'packed-loop')
       .addFunctionBranch('packed-more','Advance native iteration',wrapped(scope=>scope.setValue('position',scope.getValue('position')+1))).loopTo('packed-loop')
       .addFunctionBranch('packed-complete','Acknowledge native result',wrapped(scope=>{request(scope).acknowledge({acknowledgement:'accepted',output:{status:'done'},response:{ok:true}});})).end().build(),
    })}},
   });
   const packedNativeChart=nativeRegistry.buildServiceFlow(nativeAction,nativeContext).flow;
   const packedPolicy=native.getNativeBusinessPolicy(packedNativeChart);
   assert.ok(packedPolicy.toMermaid().includes('Check native loop'));
   const nativeResult=await nativeRegistry.executeService(nativeAction,{},nativeContext);
   assert.equal(nativeResult.status,'success');assert.equal(nativeResult.acknowledgement,'accepted');
   assert.deepEqual(nativeResult.response,{ok:true});assert.equal(nativeResult.result.status,'done');
   assert.equal(nativeResult.observationError,undefined);
   assert.ok(JSON.stringify(nativeResult.executionSnapshot).includes('packed-loop'));
   assert.equal(typeof application.buildApplicationDeveloperContext,'function');
   assert.equal(typeof application.writeApplicationDeveloperContext,'function');
   assert.equal(typeof application.checkApplicationDeveloperContext,'function');
   const cause=await import('smallbusiness-footprint/diagnostics/cause');
   const aftersales=await import('smallbusiness-footprint/aftersales/runtime');
   const manifest=await import('smallbusiness-footprint/developer/source-manifest.json',{with:{type:'json'}});
   assert.equal(typeof main.createBusinessPlatform,'function');
   assert.equal(metadata.allBusinessActions.length,12);
   assert.equal(developer.describeDeveloperServices().length,12);
   assert.equal(typeof aftersales.createAfterSalesService,'function');
   assert.equal(typeof cause.createAfterSalesCauseReader,'function');
   assert.equal(manifest.default.schemaVersion,1);
   const reader=await source.createDeveloperSourceReader();
   const fresh=await reader.verify('src/flows/shared/businessFlow.ts');
   assert.equal(fresh.status,'current');assert.equal(fresh.sourceChars,0);
   const body=await reader.inspect({file:'src/flows/shared/businessFlow.ts',symbol:'createBusinessOperationFlow'},{includeSource:true});
   assert.equal(body.status,'source');
   assert.ok(body.text.includes('function createBusinessOperationFlow'));
   assert.ok(body.cumulativeChars<=4000);
  `],{cwd:pkgRoot,stdio:'pipe'});
  // Exercise the installed executable through a real bin symlink, with no dev parser installed.
  const app=path.join(temp,'consumer');await fs.mkdir(path.join(app,'src'),{recursive:true});await fs.mkdir(path.join(app,'test'));
  await fs.writeFile(path.join(app,'src/app.mjs'),'throw new Error("source must not execute");\nexport function run(input){return input;}\n');
  await fs.writeFile(path.join(app,'test/smoke.mjs'),'import {run} from "../src/app.mjs";\n');
  const config={index:{applicationName:'Packed consumer',sourceFiles:['src/app.mjs'],flows:[{id:'run',sources:[{file:'src/app.mjs'}]}],development:{entry:{file:'src/app.mjs',exportName:'run'},commands:{test:'node --test test/*.mjs'},smokeTest:{file:'test/smoke.mjs'}}},goal:'run',agentFile:'AGENTS.md'};
  await fs.writeFile(path.join(app,'context.json'),JSON.stringify(config));
  const bin=path.join(app,'smallbusiness-context');await fs.symlink(path.join(pkgRoot,packedManifest.bin['smallbusiness-context']),bin);
  assert.ok((await fs.stat(bin)).mode&0o111,'Packed bin must be executable');
  const cli=mode=>JSON.parse(execFileSync(process.execPath,[bin,mode,'--root',app,'--config','context.json'],{encoding:'utf8'}));
  assert.ok(cli('build').changed.length>0);assert.equal(cli('check').valid,true);assert.deepEqual(cli('build').changed,[]);
  assert.ok((await fs.readFile(path.join(app,'docs/application-context/packet.md'),'utf8')).includes('export function run(input)'));
  // The optional task packet must also work through the actual packed CLI,
  // with source and approved test tooling treated as bytes rather than imports.
  await fs.mkdir(path.join(app,'scripts'));
  const protectedEntry='throw new Error("protected entry must not execute");\nexport {run} from "./rules.mjs";\n';
  const editable='export function run(input){return input;}\n';
  const support='throw new Error("approved support must not execute");\n';
  await fs.writeFile(path.join(app,'src/app.mjs'),protectedEntry);
  await fs.writeFile(path.join(app,'src/rules.mjs'),editable);
  await fs.writeFile(path.join(app,'scripts/test.mjs'),support);
  const compactConfig={...config,index:{...config.index,sourceFiles:['src/app.mjs','src/rules.mjs'],flows:[{id:'run',sources:[{file:'src/app.mjs'},{file:'src/rules.mjs'}]}],development:{...config.index.development,regressionTestDirectory:'src/__tests__',protectedFiles:['src/app.mjs','scripts/'],supportFiles:[{file:'scripts/test.mjs',purpose:'Approved test runner'}]}},packetOptions:{format:'compact',referenceSources:[{file:'src/app.mjs',contract:'Protected public entry re-exports run from the editable rules module; full entry remains available.'}]}};
  await fs.writeFile(path.join(app,'context.json'),JSON.stringify(compactConfig));
  assert.ok(cli('build').changed.length>0);assert.equal(cli('check').valid,true);assert.deepEqual(cli('build').changed,[]);
  const compact=await fs.readFile(path.join(app,'docs/application-context/packet.md'),'utf8');
  assert.ok(compact.includes(editable)&&compact.includes(support)&&!compact.includes(protectedEntry));
  const compactManifest=JSON.parse(await fs.readFile(path.join(app,'docs/application-context/manifest.json'),'utf8'));
  assert.equal(compactManifest.coverage.allAdmittedSourceDelivered,false);
  await fs.appendFile(path.join(app,'scripts/test.mjs'),'// changed support\n');
  const stale=spawnSync(process.execPath,[bin,'check','--root',app,'--config','context.json'],{encoding:'utf8'});
  assert.equal(stale.status,1);assert.equal(JSON.parse(stale.stdout).valid,false);
  const info={archiveBytes:(await fs.stat(archive)).size,installedBytes:packed.unpackedSize,sourceFiles:Object.keys(manifest.files).length,mapsValidated:maps.length,manifestBytes:(await fs.stat(path.join(pkgRoot,'dist/developer/source-manifest.json'))).size,sourceTreeSha256:manifest.sourceTreeSha256};
  console.log(JSON.stringify(info));
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
