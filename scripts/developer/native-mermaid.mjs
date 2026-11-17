import {createHash} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
const sdkLabel=value=>String(value).replace(/"/g,'#quot;');
const edgeLabel=value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'#quot;').replace(/\|/g,'#124;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\r\n]/g,'#10;');
const multiset=edges=>edges.map(edge=>[edge.from,edge.to]).sort(([af,at],[bf,bt])=>af.localeCompare(bf)||at.localeCompare(bt));

/** Parse just this generator's SDK/annotated edge grammar; duplicates are retained. */
export function mermaidEdgeMultiset(text) {
  const edges=[];
  for(const line of text.split('\n')) {
    const match=/^([A-Za-z0-9_]+) (?:-->|-\.->)(?:\|"[^"\r\n]*"\|)? ([A-Za-z0-9_]+)$/.exec(line);
    if(match)edges.push({from:match[1],to:match[2]});
    else if(/^[A-Za-z0-9_]+ (?:-->|-\.->)/.test(line))throw new Error('Unsupported Mermaid edge syntax');
  }
  return multiset(edges);
}

/**
 * Annotate ONLY shapes and edge labels/styles after exact verification against
 * FootPrintJS12's native root walker. No callback/resolver is executed and no
 * edge is added, omitted, redirected or inferred from source descriptions.
 */
export function annotateNativeMermaid(root,rawSdkMermaid) {
  if(typeof rawSdkMermaid!=='string')throw new Error('Native SDK Mermaid text is required');
  const ids=new Map(),taken=new Set(),visited=new Set(),declarations=[],edges=[],items=[],raw=['flowchart TD'];
  function idOf(id) {
    if(ids.has(id))return ids.get(id);
    const base=(id||'').replace(/[^a-zA-Z0-9_]/g,'_')||'_';
    let value=base;for(let n=2;taken.has(value);n++)value=base+'_'+n;
    taken.add(value);ids.set(id,value);return value;
  }
  function walk(node) {
    if(node.isLoopRef||visited.has(node.id))return;
    visited.add(node.id);const id=idOf(node.id),label=sdkLabel(node.name);
    const kind=node.deciderFn?'decision':node.selectorFn?'selector':node.isSubflowRoot?'subflow':node.children?.length?'parallel':'stage';
    const declaration={id:node.id,mermaidId:id,name:String(node.name),kind};
    declarations.push(declaration);items.push({type:'node',...declaration,label});raw.push(`${id}["${label}"]`);
    for(const child of node.children??[]) {
      const target=idOf(child.id),kind=child.isLoopRef?'loop':node.deciderFn||node.selectorFn?'branch':'parallel';
      const edge={from:id,to:target,kind,...(node.deciderFn||node.selectorFn?{branchKey:String(child.branchId??child.id)}:{})};
      edges.push(edge);items.push({type:'edge',...edge});raw.push(`${id} --> ${target}`);walk(child);
    }
    if(node.next) {
      const target=idOf(node.next.id),kind=node.next.isLoopRef?'loop':node.children?.length?'continuation':'next';
      const edge={from:id,to:target,kind,...(kind==='continuation'?{continuation:node.deciderFn?'after selected branch':node.selectorFn?'after selected branches':'after parallel branches'}:{})};
      edges.push(edge);items.push({type:'edge',...edge});raw.push(`${id} --> ${target}`);walk(node.next);
    }
  }
  walk(root);
  const expected=raw.join('\n');
  if(rawSdkMermaid.replace(/\r\n/g,'\n').trimEnd()!==expected)throw new Error('Actual SDK declarations/edges differ from the pinned native walker; refuse semantic annotation');
  const rendered=['flowchart TD'];
  for(const item of items) {
    if(item.type==='node') {
      const body=`"${item.label}"`;
      rendered.push(item.mermaidId+(item.kind==='decision'||item.kind==='selector'?`{${body}}`:item.kind==='subflow'?`[[${body}]]`:item.kind==='parallel'?`{{${body}}}`:`[${body}]`));
    } else {
      const label=item.branchKey!==undefined?item.branchKey+(item.kind==='loop'?' (loop)':''):item.kind==='loop'?'loop':item.kind==='continuation'?item.continuation:item.kind==='parallel'?'parallel':undefined;
      rendered.push(`${item.from} ${item.kind==='continuation'?'-.->':'-->'}${label===undefined?'':'|"'+edgeLabel(label)+'"|'} ${item.to}`);
    }
  }
  const mermaid=rendered.join('\n'),rawEdges=mermaidEdgeMultiset(rawSdkMermaid),annotatedEdges=mermaidEdgeMultiset(mermaid);
  if(JSON.stringify(rawEdges)!==JSON.stringify(annotatedEdges)||JSON.stringify(rawEdges)!==JSON.stringify(multiset(edges)))throw new Error('Semantic annotation changed the native edge multiset');
  const drawnNodes=rendered.slice(1).flatMap(line=>{const match=/^([A-Za-z0-9_]+)(?:\[\["([^"\r\n]*)"\]\]|\["([^"\r\n]*)"\]|\{\{"([^"\r\n]*)"\}\}|\{"([^"\r\n]*)"\})$/.exec(line);return match?[[match[1],match[2]??match[3]??match[4]??match[5]]]:[];});
  const expectedNodes=items.filter(item=>item.type==='node').map(item=>[item.mermaidId,item.label]);
  if(JSON.stringify(drawnNodes)!==JSON.stringify(expectedNodes))throw new Error('Semantic annotation changed native node identities or labels');
  return {mermaid,proof:{version:'native-mermaid-semantic-v1',sdkTopologyVerified:true,nodeIdentitiesVerified:true,nodeCount:declarations.length,edgeCount:edges.length,rawSdkSha256:sha(rawSdkMermaid),annotatedSha256:sha(mermaid),nodeIdentitySha256:sha(JSON.stringify(expectedNodes)),rawEdgeMultisetSha256:sha(JSON.stringify(rawEdges)),annotatedEdgeMultisetSha256:sha(JSON.stringify(annotatedEdges)),nodeIdMap:declarations,edges}};
}

export const SEMANTIC_CAPTION='Native SDK topology with metadata-bound annotations: diamonds are actual decisions/selectors; double-sided boxes are subflows; hexagons are parallel forks; branch arrows show actual keys. Dashed “after selected/parallel branches” arrows are continuations after those branches complete, not bypass paths. Loop arrows are native back-edges. Callback exceptions, breaks, private predicates and host effects are not simulated; nested mounts open separate views.';
