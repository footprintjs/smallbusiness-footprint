import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {buildApplicationSourceManifest,analyzeDeveloperSource} from '../../examples/developer/application-source-catalog.mjs';
import {analyzeDeveloperSource as originalAnalyze} from './build-manifest.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
async function fixture(sources,work){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'application-catalog-test-'));
 try{for(const [file,text]of Object.entries(sources)){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),text);}return await work(root);}
 finally{await fs.rm(root,{recursive:true,force:true});}
}
const applicationUnits=m=>m.units.filter(u=>u.id.startsWith('application-'));
const actualShape=`import {flowChart} from 'smallbusiness-footprint/native';
import {check,childChart} from './helpers.mjs';
const stage=fn=>fn,choose=fn=>fn;
// UTF-8 source geometry: café 📦.
throw new Error('APPLICATION_MODULE_MUST_NOT_BE_IMPORTED');
export function stockFlow(session){
 return flowChart('Initialize',stage(scope=>{scope.setValue('index',0);}), 'start')
 .addDeciderFunction('Iterate',choose(scope=>scope.getValue('index')<session.keys.length?'item':'done'),'loop')
 .addFunctionBranch('item','Read one availability fact',stage(scope=>{const sku=session.keys[scope.getValue('index')];scope.setValue('allowed',check(session.stock,{[sku]:session.demand[sku]},session.command));}))
 .loopTo('loop').addFunctionBranch('done','Complete',stage(()=>{})).end()
 .addSubFlowChartNext('child',childChart(session),'Continue',{inputMapper:parent=>({command:parent.command}),outputMapper:child=>({done:child.done})})
 .build();
}
`;

test('actual native-shaped stage callbacks and mount mappers retain exact complete source and owner',async()=>fixture({'src/flow.mjs':actualShape,'src/helpers.mjs':"throw Error('HELPER_MUST_NOT_IMPORT'); export const check=()=>true; export const childChart=()=>null;\n"},async root=>{
 const m=await buildApplicationSourceManifest(root,['src/flow.mjs','src/helpers.mjs']),record=m.files['src/flow.mjs'];
 assert.equal(record.parseStatus,'parsed');assert.equal(record.sha256,sha(Buffer.from(actualShape)));
 const callback=applicationUnits(record).filter(u=>u.stageId==='item'&&u.role==='stage-callback');assert.equal(callback.length,1);assert.equal(callback[0].owner,'stockFlow');
 const body=actualShape.slice(callback[0].start,callback[0].end),arrow="scope=>{const sku=session.keys[scope.getValue('index')];scope.setValue('allowed',check(session.stock,{[sku]:session.demand[sku]},session.command));}";assert.ok([arrow,'stage('+arrow+')'].includes(body),'Select the complete inline callback or its complete handler expression');
 const input=applicationUnits(record).filter(u=>u.stageId==='child'&&u.role==='inputMapper');assert.equal(input.length,1);assert.equal(actualShape.slice(input[0].start,input[0].end),'parent=>({command:parent.command})');
 const output=applicationUnits(record).filter(u=>u.stageId==='child'&&u.role==='outputMapper');assert.equal(output.length,1);assert.equal(actualShape.slice(output[0].start,output[0].end),'child=>({done:child.done})');
 for(const u of record.units){assert.equal(u.textSha256,sha(actualShape.slice(u.start,u.end)));assert.equal(u.byteStart,Buffer.byteLength(actualShape.slice(0,u.start)));assert.equal(u.byteEnd,Buffer.byteLength(actualShape.slice(0,u.end)));assert.equal(u.startLine,actualShape.slice(0,u.start).split('\n').length);assert.equal(u.endLine,actualShape.slice(0,u.end).split('\n').length);}
}));

test('unrelated fluent APIs and shadowed factory bindings are not assigned SDK stage IDs',async()=>{
 const sources={
  'src/fake.mjs':"const unrelated={addFunction(){}}; const stage=fn=>fn; unrelated.addFunction('x',stage(()=>42),'collision');\n",
  'src/shadow.mjs':"import {flowChart as chart} from 'smallbusiness-footprint/native'; const stage=fn=>fn; export function f(chart){return chart('root',stage(()=>42),'collision').build();}\n",
 };
 await fixture(sources,async root=>{const m=await buildApplicationSourceManifest(root,Object.keys(sources));for(const record of Object.values(m.files))assert.equal(applicationUnits(record).filter(u=>u.stageId).length,0);});
});

test('only direct native mount options are mapper bindings, not similarly named objects inside a handler',async()=>fixture({'src/flow.mjs':"import {flowChart} from 'smallbusiness-footprint/native'; const stage=fn=>fn; export function f(){return flowChart('Root',stage(()=>{const settings={inputMapper:()=>({unexpected:1})};return settings;}),'root').build();}\n"},async root=>{
 const m=await buildApplicationSourceManifest(root,['src/flow.mjs']);assert.equal(applicationUnits(m.files['src/flow.mjs']).filter(u=>u.role==='inputMapper').length,0);
 assert.equal(applicationUnits(m.files['src/flow.mjs']).filter(u=>u.role==='stage-callback').length,1);
}));

test('relative imported callsite names obey lexical shadowing',async()=>fixture({'src/flow.mjs':"import {remote} from './port.mjs'; export function genuine(){return remote(1);} export function shadow(remote){return remote(2);}\n"},async root=>{
 const m=await buildApplicationSourceManifest(root,['src/flow.mjs']);const calls=applicationUnits(m.files['src/flow.mjs']).filter(u=>u.role==='callsite'&&u.symbol==='remote');assert.equal(calls.length,1);assert.equal(calls[0].owner,'genuine');
}));

test('valid TypeScript type assertions use the same grammar as the canonical source analyzer',async()=>fixture({'src/flow.ts':'export const value = <number>1;\n'},async root=>{
 const m=await buildApplicationSourceManifest(root,['src/flow.ts']);assert.equal(m.files['src/flow.ts'].parseStatus,'parsed');
}));

test('existing canonical callable identities remain usable and no source symlinks/traversal are admitted',async()=>{
 const source='export function outer(x){const object={run(value){return value+x;}};return object.run(x);}\n';
 const before=originalAnalyze('src/flow.mjs',Buffer.from(source)),after=analyzeDeveloperSource('src/flow.mjs',Buffer.from(source));
 for(const u of before.units)assert.ok(after.units.some(v=>JSON.stringify(v)===JSON.stringify(u)),'Canonical source unit lost: '+u.id);
 await fixture({'src/flow.mjs':source},async root=>{
  await assert.rejects(()=>buildApplicationSourceManifest(root,['src/../escape.mjs']),/production source/);
  await fs.symlink(path.join(root,'src/flow.mjs'),path.join(root,'src/linked.mjs'));await assert.rejects(()=>buildApplicationSourceManifest(root,['src/linked.mjs']),/symlink/);
 });
});

test('module-level native chart callbacks carry nonempty module ownership for the wiring API',async()=>fixture({'src/top.mjs':"import {flowChart} from 'smallbusiness-footprint/native';const stage=fn=>fn;export const chart=flowChart('Root',stage(()=>{}),'root').build();\n"},async root=>{
 const m=await buildApplicationSourceManifest(root,['src/top.mjs']);const callback=applicationUnits(m.files['src/top.mjs']).find(u=>u.role==='stage-callback'&&u.stageId==='root');assert.ok(callback);assert.equal(callback.owner,'<module>');assert.ok(callback.symbol.startsWith('<module>/'));
}));

test('dynamic native stage IDs stay unresolved while exact handler callsite arguments remain available',async()=>fixture({'src/dynamic.mjs':"import {flowChart} from 'smallbusiness-footprint/native';const stage=fn=>fn;export function build(kind,session){return flowChart('Read',stage(async()=>{session.result=await session.ports.read(kind);}),kind+'-read').build();}\n"},async root=>{
 const m=await buildApplicationSourceManifest(root,['src/dynamic.mjs']),units=applicationUnits(m.files['src/dynamic.mjs']);
 const call=units.find(u=>u.role==='callsite'&&u.symbol==='session.ports.read');assert.ok(call);assert.equal(call.stageId,undefined);assert.ok((await fs.readFile(path.join(root,'src/dynamic.mjs'),'utf8')).slice(call.start,call.end).includes('session.result=await session.ports.read(kind)'));
}));

test('imported construction wrappers never swallow their nested runtime calls or mount arguments',async()=>{
 const wrapped=actualShape.replace('import {check,childChart}', 'import {check,childChart,register}').replace("return flowChart('Initialize'", "return register('arbitrary-registry-key',flowChart('Initialize'").replace('.build();','.build());');
 await fixture({'src/flow.mjs':wrapped},async root=>{
  const record=(await buildApplicationSourceManifest(root,['src/flow.mjs'])).files['src/flow.mjs'],units=applicationUnits(record);
  assert.equal(units.some(u=>u.role==='callsite'&&u.symbol==='register'),false);
  const call=units.find(u=>u.role==='callsite'&&u.symbol==='check');assert.ok(call);assert.equal(call.owner,'stockFlow');assert.equal(call.stageId,'item');
  const body=wrapped.slice(call.start,call.end);assert.ok(body.includes('check(session.stock,{[sku]:session.demand[sku]},session.command)'));assert.ok(!body.includes('flowChart('));
  const mount=units.find(u=>u.role==='chartExpression'&&u.stageId==='child');assert.ok(mount);assert.equal(wrapped.slice(mount.start,mount.end),'childChart(session)');
  const constructorCall=units.find(u=>u.role==='callsite'&&u.symbol==='childChart');assert.ok(constructorCall);assert.equal(wrapped.slice(constructorCall.start,constructorCall.end),'childChart(session)');
  assert.ok(units.filter(u=>u.role==='callsite').every(u=>u.end-u.start<500));
 });
});

test('dynamic stage callers stay bounded inside an arbitrarily named construction wrapper',async()=>fixture({'src/dynamic.mjs':"import {flowChart} from 'smallbusiness-footprint/native';import {keep} from './helpers.mjs';const stage=fn=>fn;export function dynamic(kind,session){return keep(flowChart('Read',stage(async()=>{session.result=await session.ports.read(kind);}),kind+'-read').build());}\n"},async root=>{
 const text=await fs.readFile(path.join(root,'src/dynamic.mjs'),'utf8'),units=applicationUnits((await buildApplicationSourceManifest(root,['src/dynamic.mjs'])).files['src/dynamic.mjs']);
 assert.equal(units.some(u=>u.role==='callsite'&&u.symbol==='keep'),false);
 const call=units.find(u=>u.role==='callsite'&&u.symbol==='session.ports.read');assert.ok(call);assert.equal(call.stageId,undefined);assert.equal(text.slice(call.start,call.end),'session.result=await session.ports.read(kind)');
}));
