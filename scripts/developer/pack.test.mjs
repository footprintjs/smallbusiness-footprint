import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
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
  const info={archiveBytes:(await fs.stat(archive)).size,installedBytes:packed.unpackedSize,sourceFiles:Object.keys(manifest.files).length,mapsValidated:maps.length,manifestBytes:(await fs.stat(path.join(pkgRoot,'dist/developer/source-manifest.json'))).size,sourceTreeSha256:manifest.sourceTreeSha256};
  console.log(JSON.stringify(info));
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
