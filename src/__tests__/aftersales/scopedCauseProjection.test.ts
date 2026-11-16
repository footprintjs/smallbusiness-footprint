import {describe, expect, it} from 'vitest';
import {createRecordGraph, type RecordScope} from 'foottrace/cause';
import {createAfterSalesCauseReader, recordedAfterSalesCauseScopes} from '../../diagnostics/aftersalesCause.js';
import {nativeFixture, owner, customer} from './nativeFixture.js';
import type {AfterSalesTrace} from '../../aftersales.js';

type Row = {runtimeStageId:string; stage:string; overwrite:Record<string,unknown>; trace:{readKeys?:string[]}[]};
type RawScope = {address:RecordScope['address']; log:Row[]; tree:any};
const saved = (trace:AfterSalesTrace):any => JSON.parse(JSON.stringify(trace));
const context = () => ({signal:new AbortController().signal});
const sameAddress = (a:unknown,b:unknown) => JSON.stringify(a)===JSON.stringify(b);
function rawScopes(trace:any):RawScope[] {
  const raw=trace.nativeSnapshot;
  return [{address:raw.logAddress, log:raw.commitLog, tree:raw.executionTree},
    ...Object.values(raw.subflowResults??{}).map((value:any)=>({address:value.treeContext.logAddress,log:value.treeContext.history,tree:value.treeContext.stageContexts}))];
}
function treeNodes(tree:any):any[] {
  const nodes:any[]=[],pending=tree?[tree]:[];
  while(pending.length){const node=pending.pop();nodes.push(node);if(node.next)pending.push(node.next);if(node.children)pending.push(...node.children);}
  return nodes;
}
async function approved() {
  const f=nativeFixture(1),request=await f.service.request(f.command,customer);
  await f.service.action({caseId:request.caseId,expectedVersion:request.version,action:'approve'},owner);
  return {f,trace:saved(f.traces.at(-1)!)};
}
function approval(trace:any) {
  const source=recordedAfterSalesCauseScopes(trace);
  const scope=source.scopes.find(value=>value.commitLog.some((raw:any)=>Object.hasOwn(raw.overwrite,'ownerActionEligible')))!;
  const log=scope.commitLog as Row[];
  const writer=log.findIndex(row=>Object.hasOwn(row.overwrite,'ownerActionEligible'));
  const guard=log.findIndex(row=>row.stage.endsWith('approval-eligible'));
  expect(guard).toBeGreaterThan(writer);
  return {source,scope,log,writer,guard};
}
const error=(code='CAUSE_RECORD_INVALID')=>expect.objectContaining({code});

describe('source-preserving bounded after-sales cause projection',()=>{
  it.each([14,100])('opens actual saved %i-item request and refund scopes and follows their latest real loop writer',async count=>{
    const f=nativeFixture(count),request=await f.service.request(f.command,customer);
    const approvedCase=await f.service.action({caseId:request.caseId,expectedVersion:request.version,action:'approve'},owner);
    const refunded=await f.service.action({caseId:approvedCase.caseId,expectedVersion:approvedCase.version,action:'refund',amountCents:count*100,restock:true},owner);
    expect(refunded.state).toBe('REFUNDED');expect(f.refunds).toBe(1);
    for(const [trace,field,stage]of [[saved(f.traces[0]),'lineCheck','request-item-loop'],[saved(f.traces.at(-1)!),'restockLineCheck','restock-item-loop']]as const){
      const before=JSON.stringify(trace),source=recordedAfterSalesCauseScopes(trace);
      expect(source.scopes.length).toBeLessThanOrEqual(32);
      expect(new Set(source.scopes.map(scope=>JSON.stringify(scope.address))).size).toBe(source.scopes.length);
      expect(source.scopes.reduce((n,scope)=>n+scope.commitLog.length,0)).toBeLessThanOrEqual(1024);
      // Every projected log/address is an unchanged actual own native history.
      for(const scope of source.scopes){
        const original=rawScopes(trace).find(raw=>sameAddress(raw.address,scope.address));
        expect(original).toBeDefined();expect(scope.commitLog).toEqual(original!.log);
      }
      const scope=source.scopes.find(value=>value.commitLog.some((raw:any)=>Object.hasOwn(raw.overwrite,field)))!;
      const log=scope.commitLog as Row[],writer=log.findLastIndex(row=>Object.hasOwn(row.overwrite,field)),guard=log.findLastIndex(row=>scope.reads?.[row.runtimeStageId]?.includes(field)&&!Object.hasOwn(row.overwrite,field));
      expect(log[guard].stage).toContain(stage);
      expect(writer).toBeLessThan(guard);expect(scope.reads?.[log[guard].runtimeStageId]).toContain(field);
      const graph=createRecordGraph(source.scopes,{maxScopes:32,maxCommits:1024,maxFields:50000,maxEdges:128});
      const writerId=graph.nodeId(scope.address,{runtimeStageId:log[writer].runtimeStageId,commitIdx:writer,key:field});
      const guardId=graph.nodeId(scope.address,{runtimeStageId:log[guard].runtimeStageId,commitIdx:guard});
      expect((await graph.parents(guardId,context())).edges).toContainEqual(expect.objectContaining({kind:'data',nodeId:writerId}));
      const reader=createAfterSalesCauseReader(trace);
      expect(reader.nodes.length).toBeLessThanOrEqual(2048);
      expect(reader.nodes.some(node=>node.id===guardId)).toBe(true);
      const result=await reader.explain(guardId);
      expect(result.confidence).toBe('incomplete');expect(result.rootCause).toBeUndefined();
      expect(JSON.stringify(trace)).toBe(before);
      expect(JSON.stringify(source)).not.toMatch(/PRIVATE_CUSTOMER_REASON|private-line-|private-product-|private-payment|private-owner/);
    }
  });
  it('retains known reads when an unrelated empty frame has no collected read map',async()=>{
    const {trace}=await approved(),{source,scope,log,writer,guard}=approval(trace);
    expect(scope.reads?.[log[guard].runtimeStageId]).toContain('ownerActionEligible');
    const unrelated=rawScopes(trace).flatMap(raw=>treeNodes(raw.tree)).find(node=>node.runtimeStageId!==log[guard].runtimeStageId&&!node.stageReads);
    expect(unrelated).toBeDefined();
    expect(source.incomplete).toBe(true);
    const graph=createRecordGraph(source.scopes),id=(i:number,key?:string)=>graph.nodeId(scope.address,{runtimeStageId:log[i].runtimeStageId,commitIdx:i,...(key?{key}:{})});
    expect((await graph.parents(id(guard),context())).edges).toContainEqual(expect.objectContaining({kind:'data',nodeId:id(writer,'ownerActionEligible')}));
  });
  it('keeps actual per-write read prefixes when the stage-level read frame is absent',async()=>{
    const {trace}=await approved(),initial=approval(trace),id=initial.log[initial.guard].runtimeStageId;
    for(const scope of rawScopes(trace))for(const node of treeNodes(scope.tree))if(node.runtimeStageId===id)delete node.stageReads;
    const {source,scope,log,writer,guard}=approval(trace);
    expect(log[guard].trace.some(row=>row.readKeys?.includes('ownerActionEligible'))).toBe(true);
    expect(scope.reads?.[id]).toBeUndefined();expect(source.incomplete).toBe(true);
    const graph=createRecordGraph(source.scopes),nodeId=(i:number,key?:string)=>graph.nodeId(scope.address,{runtimeStageId:log[i].runtimeStageId,commitIdx:i,...(key?{key}:{})});
    expect((await graph.parents(nodeId(guard),context())).edges).toContainEqual(expect.objectContaining({kind:'data',nodeId:nodeId(writer,'ownerActionEligible')}));
  });
  it('never invents a guard read when both actual stage reads and write prefixes are missing',async()=>{
    const {trace}=await approved(),initial=approval(trace),id=initial.log[initial.guard].runtimeStageId;
    for(const scope of rawScopes(trace)){
      for(const node of treeNodes(scope.tree))if(node.runtimeStageId===id)delete node.stageReads;
      for(const row of scope.log)if(row.runtimeStageId===id)for(const write of row.trace)delete write.readKeys;
    }
    const {source,scope,log,guard}=approval(trace);expect(scope.reads?.[id]).toBeUndefined();expect(source.incomplete).toBe(true);
    const graph=createRecordGraph(source.scopes),nodeId=graph.nodeId(scope.address,{runtimeStageId:id,commitIdx:guard});
    expect((await graph.parents(nodeId,context())).edges.some(edge=>edge.kind==='data')).toBe(false);
    expect((await graph.gaps(nodeId,context())).some(gap=>gap.code==='not-collected')).toBe(true);
    expect(log[guard].trace.every(row=>row.readKeys===undefined)).toBe(true);
    const answer=await createAfterSalesCauseReader(trace).explain(nodeId);
    expect(answer.confidence).toBe('incomplete');expect(answer.rootCause).toBeUndefined();
  });
  it('retains the actual rejected eligibility value and no rejected approval write',async()=>{
    const f=nativeFixture(1),request=await f.service.request(f.command,customer);
    f.cases.set(request.caseId,{...request,state:'APPROVED'});
    await expect(f.service.action({caseId:request.caseId,expectedVersion:request.version,action:'approve'},owner)).rejects.toMatchObject({code:'AFTERSALES_INELIGIBLE'});
    const {scope,log,writer,guard}=approval(saved(f.traces.at(-1)!));
    expect(log[writer].overwrite.ownerActionEligible).toBe(false);
    expect(log.some(row=>row.stage.endsWith('save-owner-approval'))).toBe(false);
    expect(scope.reads?.[log[guard].runtimeStageId]).toContain('ownerActionEligible');
  });
  it('keeps capture absence incomplete without discarding actual native reads',async()=>{
    const {trace}=await approved();delete trace.causeCapture;
    const {source,scope,log,guard}=approval(trace);expect(source.incomplete).toBe(true);expect(scope.controlDeps).toBeUndefined();expect(scope.attention).toBeUndefined();
    expect(scope.reads?.[log[guard].runtimeStageId]).toContain('ownerActionEligible');
    const reader=createAfterSalesCauseReader(trace),node=reader.nodes.find(row=>row.selection.runtimeStageId===log[guard].runtimeStageId)!;
    const result=await reader.explain(node.id);expect(result.confidence).toBe('incomplete');expect(result.rootCause).toBeUndefined();
  });
  it('does not turn a missing native decision frame into a control edge from sidecar text alone',async()=>{
    const {trace}=await approved(),initial=approval(trace),guardId=initial.log[initial.guard].runtimeStageId;
    for(const scope of rawScopes(trace))for(const node of treeNodes(scope.tree))if(node.runtimeStageId===guardId)delete node.flowMessages;
    const {source,scope,log}=approval(trace),effect=log.findIndex(row=>row.stage.endsWith('save-owner-approval'));
    expect(source.incomplete).toBe(true);expect(scope.complete).toBe(false);
    expect(scope.controlDeps?.[log[effect].runtimeStageId]).toBeUndefined();
    const graph=createRecordGraph(source.scopes),effectId=graph.nodeId(scope.address,{runtimeStageId:log[effect].runtimeStageId,commitIdx:effect});
    expect((await graph.parents(effectId,context())).edges.some(edge=>edge.kind==='control')).toBe(false);
    const answer=await createAfterSalesCauseReader(trace).explain(effectId);
    expect(answer.confidence).toBe('incomplete');expect(answer.rootCause).toBeUndefined();
  });
  it('refuses getters, non-JSON prototypes and cycles without evaluating an accessor',async()=>{
    const {trace}=await approved();let getterCalls=0;
    Object.defineProperty(trace.nativeSnapshot.executionTree,'hostile',{enumerable:true,get(){getterCalls++;throw new Error('PRIVATE');}});
    expect(()=>recordedAfterSalesCauseScopes(trace)).toThrowError(error());expect(getterCalls).toBe(0);
    const a=(await approved()).trace;a.nativeSnapshot.executionTree=Object.create({inherited:true});expect(()=>recordedAfterSalesCauseScopes(a)).toThrowError(error());
    const b=(await approved()).trace;b.cycle=b;expect(()=>recordedAfterSalesCauseScopes(b)).toThrowError(error());
  });
  it('refuses wrong-run or corrupt mounted addresses and conflicting SDK aliases',async()=>{
    for(const corrupt of ['run','path','alias']as const){
      const {trace}=await approved(),entries=Object.values(trace.nativeSnapshot.subflowResults)as any[];
      if(corrupt==='run')for(const row of entries)row.treeContext.logAddress.logRunId='another-run';
      if(corrupt==='path')for(const row of entries)row.treeContext.logAddress.drillPath=['wrong#999'];
      if(corrupt==='alias')entries[0].treeContext.history[0].overwrite.forged=true;
      expect(()=>recordedAfterSalesCauseScopes(trace)).toThrowError(error());
    }
  });
  it('refuses a real root commit copied into another native scope instead of manufacturing scoped ancestry',async()=>{
    const {trace}=await approved(),rootRow=trace.nativeSnapshot.commitLog[0];
    for(const raw of Object.values(trace.nativeSnapshot.subflowResults)as any[])raw.treeContext.history.push(structuredClone(rootRow));
    expect(()=>recordedAfterSalesCauseScopes(trace)).toThrowError(error());
  });
  it('refuses mounted metadata attached to an actual ordinary native frame',async()=>{
    const f=nativeFixture(1);await f.service.request(f.command,customer);
    const trace=saved(f.traces[0]),snapshot=trace.nativeSnapshot;
    const ordinary=treeNodes(snapshot.executionTree).find(node=>node.name==='authorize-request'&&!node.subflowId);
    const child=structuredClone((Object.values(snapshot.subflowResults)as any[])[0]);
    expect(ordinary).toBeDefined();
    child.treeContext.logAddress.drillPath=[ordinary.runtimeStageId];
    snapshot.subflowResults={[ordinary.runtimeStageId]:child};
    expect(()=>recordedAfterSalesCauseScopes(trace)).toThrowError(error());
  });
  it('binds capture marks to their original fact and native execution, and refuses a future control',async()=>{
    const {trace}=await approved(),{log,writer,guard}=approval(trace);
    trace.causeCapture.facts=[{id:'capture:0',runtimeStageId:log[guard].runtimeStageId,kind:'error'}];
    trace.causeCapture.attention[log[writer].runtimeStageId]=[{kind:'error',reason:'ERROR_RECORDED',evidence:['capture:0']}];
    expect(()=>recordedAfterSalesCauseScopes(trace)).toThrowError(error());
    const b=(await approved()).trace,x=approval(b);b.causeCapture.controlDeps[x.log[x.writer].runtimeStageId]={deciderId:x.log[x.guard].runtimeStageId};
    expect(()=>recordedAfterSalesCauseScopes(b)).toThrowError(error());
  });
  it('refuses a captured control reassigned to an actual ordinary next-only stage',async()=>{
    const f=nativeFixture(1);await f.service.request(f.command,customer);
    const trace=saved(f.traces[0]),root=treeNodes(trace.nativeSnapshot.executionTree);
    const ordinary=root.find(node=>node.name==='authorize-request'),mount=root.find(node=>node.subflowId==='new');
    expect(ordinary.isDecider).toBe(false);expect(ordinary.flowMessages.some((message:any)=>message.type==='next')).toBe(true);
    trace.causeCapture.controlDeps[mount.runtimeStageId]={deciderId:ordinary.runtimeStageId};
    expect(()=>recordedAfterSalesCauseScopes(trace)).toThrowError(error());
  });
  it('reports raw admission and public query bounds explicitly',async()=>{
    const {trace}=await approved();let deep:any={};trace.deep=deep;for(let i=0;i<2050;i++){deep.next={};deep=deep.next;}
    expect(()=>recordedAfterSalesCauseScopes(trace)).toThrowError(error('CAUSE_RECORD_LIMIT'));
    const b=(await approved()).trace;b.nativeSnapshot.commitLog=Array.from({length:1025},()=>b.nativeSnapshot.commitLog[0]);
    expect(()=>recordedAfterSalesCauseScopes(b)).toThrowError(error('CAUSE_RECORD_LIMIT'));
    const c=(await approved()).trace;expect(()=>createAfterSalesCauseReader(c,{maxCatalogNodes:1})).toThrowError(error('CAUSE_RECORD_LIMIT'));
    expect(()=>createAfterSalesCauseReader(c,{maxScopes:33})).toThrowError(error('CAUSE_RECORD_LIMIT'));
  });
});
