import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {generateChartDocs,localGraph,renderNative,DOC_LIMITS} from './flow-docs.mjs';
import {annotateNativeMermaid,mermaidEdgeMultiset} from './native-mermaid.mjs';
import {flowChart} from 'footprintjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=value=>createHash('sha256').update(value).digest('hex');
async function fixture(run) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'smallbusiness-chart-test-'));
  try {
    for(const file of ['package.json','tsconfig.json','README.md'])await fs.copyFile(path.join(ROOT,file),path.join(root,file));
    for(const directory of ['src','scripts/developer','docs/flows'])await fs.cp(path.join(ROOT,directory),path.join(root,directory),{recursive:true});
    await fs.symlink(await fs.realpath(path.join(ROOT,'node_modules')),path.join(root,'node_modules'),'dir');
    return await run(root);
  } finally {await fs.rm(root,{recursive:true,force:true});}
}
async function generatedHashes(root,files) {return Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await fs.readFile(path.join(root,file)))])));}

test('actual registries produce complete bounded native views, source pointers and zero callback execution',async()=>{
  const result=await generateChartDocs(ROOT,{mode:'check'}),m=result.manifest;
  assert.equal(result.valid,true,'Run docs:flows before this test');
  assert.equal(m.coverage.registeredFlows,14);assert.equal(m.registry.defaultServices.length,12);assert.equal(m.registry.afterSales.length,2);
  assert.equal(m.coverage.executedCallbacks,0);assert.equal(m.coverage.completeApplication,false);assert.equal(m.coverage.customBuildersExecuted,false);
  assert.ok(m.coverage.actualRootAndMountInstances>m.coverage.topologyViews);
  assert.ok(result.sectionCharacters['README.md']<=DOC_LIMITS.rootSection);
  for(const[file,count]of Object.entries(result.sectionCharacters))if(file!=='README.md')assert.ok(count<=DOC_LIMITS.folderSection);
  for(const instance of m.instances)assert.ok(m.views.some(view=>view.id===instance.viewId));
  assert.ok(m.sourceFacts.guards['request-policy-eligible'].fact==='policySatisfied');
  assert.ok(m.sourceFacts.hooks['inspect-request-item'].writes.includes('lineCheck'));
  const pages=await Promise.all(m.views.map(view=>fs.readFile(path.join(ROOT,view.file),'utf8')));
  assert.ok(pages.some(page=>page.includes('item -->|"loop"| request_item_loop')),'Native loop back-edge retained');
  assert.ok(pages.some(page=>page.includes('| default |')),'Native default clone/branch retained');
  assert.ok(pages.some(page=>page.includes('inputMapper, outputMapper')));
  assert.ok(pages.every(page=>!page.includes('| unknown/unexpanded |')),'Every actual static mount has a drill link');
});

test('two generations are byte-identical and preserve handwritten README regions',async()=>fixture(async root=>{
  const marker='<!-- BEGIN GENERATED FLOW INDEX -->',readme=await fs.readFile(path.join(root,'README.md'),'utf8');
  const outside=readme.slice(0,readme.indexOf(marker));
  const first=await generateChartDocs(root,{mode:'write'}),before=await generatedHashes(root,first.files);
  const second=await generateChartDocs(root,{mode:'write'}),after=await generatedHashes(root,second.files);
  assert.deepEqual(after,before);assert.equal((await fs.readFile(path.join(root,'README.md'),'utf8')).slice(0,outside.length),outside);
  assert.equal((await generateChartDocs(root,{mode:'check'})).valid,true);
}));

test('fresh-source check detects a real loop-definition change without using stale dist, then write updates exact native edge',async()=>fixture(async root=>{
  const file=path.join(root,'src/aftersales/flowCharts.ts'),text=await fs.readFile(file,'utf8');
  assert.ok(text.includes(".loopTo('request-item-loop')"));
  await fs.writeFile(file,text.replace(".loopTo('request-item-loop')",".loopTo('request-order-eligible')"));
  await assert.rejects(()=>fs.stat(path.join(root,'dist')),/ENOENT/);
  const stale=await generateChartDocs(root,{mode:'check'});assert.equal(stale.valid,false);assert.ok(stale.staleFiles.includes('README.md'));
  const updated=await generateChartDocs(root,{mode:'write'});assert.equal(updated.valid,true);assert.equal((await generateChartDocs(root,{mode:'check'})).valid,true);
  const pages=await Promise.all(updated.manifest.views.map(view=>fs.readFile(path.join(root,view.file),'utf8')));
  assert.ok(pages.some(page=>page.includes('item -->|"loop"| request_order_eligible')));
  assert.ok(!pages.some(page=>page.includes('item -->|"loop"| request_item_loop')));
}));

test('missing exported builder membership and default action membership fail generation',async()=>fixture(async root=>{
  const chart=path.join(root,'src/aftersales/flowCharts.ts'),original=await fs.readFile(chart,'utf8');
  await fs.appendFile(chart,'\nexport function buildUnregisteredChart(hooks: AfterSalesHooks, wrap: AfterSalesWrap): AfterSalesChart { return buildRequestChart(hooks, wrap); }\n');
  await assert.rejects(()=>generateChartDocs(root,{mode:'check'}),/missing from the runtime\/chart-doc registry/);
  await fs.writeFile(chart,original);
  const composer=path.join(root,'src/flows/businessServiceComposer.ts'),text=await fs.readFile(composer,'utf8');
  await fs.writeFile(composer,text.replace('const DEFAULT_FLOWS: ActionFlowRegistry = {',"const DEFAULT_FLOWS: ActionFlowRegistry = { 'not-an-action': { default: extra('not-an-action') },"));
  await assert.rejects(()=>generateChartDocs(root,{mode:'check'}),/membership differs/);
}));

test('wrapper source links follow the actual declaration when its lines move',async()=>fixture(async root=>{
  const before=await generateChartDocs(root,{mode:'write'}),span=before.manifest.sourceFacts.sharedWrapper;
  assert.ok(span?.startLine);
  const file=path.join(root,span.file),text=await fs.readFile(file,'utf8');
  await fs.writeFile(file,'\n\n'+text);
  assert.equal((await generateChartDocs(root,{mode:'check'})).valid,false);
  const updated=await generateChartDocs(root,{mode:'write'}),next=updated.manifest.sourceFacts.sharedWrapper;
  assert.equal(next.startLine,span.startLine+2);
  const instance=updated.manifest.instances.find(instance=>instance.kind==='library-envelope');
  assert.ok(instance);
  const view=updated.manifest.views.find(view=>view.id===instance.viewId);
  assert.ok(view);
  const page=await fs.readFile(path.join(root,view.file),'utf8');
  assert.ok(page.includes(`businessFlow.ts#L${next.startLine}`));
}));

test('missing/corrupt generated files fail check and handwritten text outside markers survives repair',async()=>fixture(async root=>{
  const initial=await generateChartDocs(root,{mode:'write'}),target=initial.manifest.views[0].file;
  await fs.unlink(path.join(root,target));await fs.appendFile(path.join(root,'src/flows/README.md'),'\nHandwritten investigation note.\n');
  const stale=await generateChartDocs(root,{mode:'check'});assert.equal(stale.valid,false);assert.ok(stale.staleFiles.includes(target));
  await generateChartDocs(root,{mode:'write'});assert.ok((await fs.readFile(path.join(root,'src/flows/README.md'),'utf8')).endsWith('Handwritten investigation note.\n'));
}));

test('native rendering uses actual edges, stable prefix aliases and restores the chart root',()=>{
  const target={id:'mount/check',name:'mount/check',deciderFn:true},loop={id:'mount/check',name:'mount/check',isLoopRef:true};
  target.children=[{id:'mount/work',name:'mount/work',next:loop}];
  const graph=localGraph(target,'mount');assert.equal(graph.root.id,'check');assert.equal(graph.root.children[0].next.id,'check');assert.equal(graph.root.children[0].next.isLoopRef,true);
  const chart={root:target,toMermaid(){assert.equal(this.root,graph.root);return 'native result';}};
  assert.equal(renderNative(chart,graph.root),'native result');assert.equal(chart.root,target);
  chart.toMermaid=()=>{throw Error('renderer failure');};assert.throws(()=>renderNative(chart,graph.root),/renderer failure/);assert.equal(chart.root,target);
});

test('actual after-sales builders render decisions, branch keys, continuations, mounts and loops without topology changes',async()=>{
  const result=await generateChartDocs(ROOT,{mode:'check'});assert.equal(result.valid,true);
  for(const view of result.manifest.views){assert.equal(view.semanticProof.sdkTopologyVerified,true);assert.equal(view.semanticProof.rawEdgeMultisetSha256,view.semanticProof.annotatedEdgeMultisetSha256);assert.deepEqual(mermaidEdgeMultiset(view.rawSdkMermaid),view.semanticProof.edges.map(e=>[e.from,e.to]).sort(([a,b],[c,d])=>a.localeCompare(c)||b.localeCompare(d)));}
  const instance=result.manifest.instances.find(i=>i.flowId==='aftersales-action'&&i.mountPath===''),page=await fs.readFile(path.join(ROOT,instance.file),'utf8');
  assert.ok(page.includes('case_version_current{"case-version-current"}'));
  assert.ok(page.includes('case_version_current -->|"case-version-current-allowed"| case_version_current_allowed'));
  assert.ok(page.includes('case_version_current -.->|"after selected branch"| route_owner_action'));
  assert.ok(page.includes('approve[["owner-approve-flow"]]'));
  const pages=await Promise.all(result.manifest.views.map(v=>fs.readFile(path.join(ROOT,v.file),'utf8')));
  assert.ok(pages.some(p=>p.includes('prior_refund_status -->|"default"| default')));
  assert.ok(pages.some(p=>p.includes('request_item_loop -->|"item"| item')&&p.includes('item -->|"loop"| request_item_loop')));
});

test('real SDK builder collision/selector/fork/mount metadata annotates only the exact native edge multiset',()=>{
  let called=0;const sentinel=()=>{called++;throw Error('must not run');};
  const child=flowChart('Nested root',sentinel,'nested-root').build();
  const chart=flowChart('Start arrow --> remains a label',sentinel,'a-b')
    .addDeciderFunction('Choose "one"',sentinel,'a_b').addFunctionBranch('yes-branch','Yes',sentinel).loopTo('a_b').addFunctionBranch('no-branch','No',sentinel).setDefault('no-branch').end()
    .addSubFlowChartNext('mount',child,'Open nested chart')
    .addSelectorFunction('Choose many',sentinel,'pick-many').addFunctionBranch('left','Left',sentinel).addFunctionBranch('right','Right',sentinel).end()
    .addListOfFunction([{id:'p-a',name:'Parallel A',fn:sentinel},{id:'p_a',name:'Parallel B',fn:sentinel}]).build();
  const raw=chart.toMermaid(),result=annotateNativeMermaid(chart.root,raw);assert.equal(called,0);
  const lookup=new Map(result.proof.nodeIdMap.map(n=>[n.id,n]));assert.equal(lookup.get('a-b').mermaidId,'a_b');assert.equal(lookup.get('a_b').mermaidId,'a_b_2');
  assert.ok(result.mermaid.includes('a_b_2{"Choose #quot;one#quot;"}'));
  assert.ok(result.mermaid.includes('mount[["Open nested chart"]]'));assert.ok(result.mermaid.includes('pick_many{"Choose many"}'));
  assert.ok(result.proof.nodeIdMap.some(node=>node.kind==='parallel'));assert.ok(result.proof.edges.some(edge=>edge.kind==='loop'));assert.ok(result.proof.edges.some(edge=>edge.kind==='continuation'));assert.ok(result.proof.edges.some(edge=>edge.branchKey==='default'));
  for(const node of result.proof.nodeIdMap.filter(node=>node.kind==='parallel'))assert.ok(result.mermaid.includes(node.mermaidId+'{{"'));
  assert.deepEqual(mermaidEdgeMultiset(raw),mermaidEdgeMultiset(result.mermaid));assert.equal(result.proof.rawEdgeMultisetSha256,result.proof.annotatedEdgeMultisetSha256);
  assert.deepEqual(mermaidEdgeMultiset('flowchart TD\na --> b\na --> b'),[['a','b'],['a','b']],'Repeated native edges are a multiset, not a set');
  assert.throws(()=>annotateNativeMermaid(chart.root,raw+'\na_b --> invented'),/differ from the pinned native walker/);
});
