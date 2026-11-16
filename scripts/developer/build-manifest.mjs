import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
const sha = value => createHash('sha256').update(value).digest('hex');
const slash = value => value.split(path.sep).join('/');
const literal = node => node?.type === 'StringLiteral' ? node.value : null;
const unwrap = node => ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression'].includes(node?.type) ? unwrap(node.expression) : node;
const method = node => { const c=unwrap(node?.callee); return c?.type==='MemberExpression'&&!c.computed&&c.property.type==='Identifier'?c.property.name:null; };
function walk(node, visit, ancestors=[]) { if(!node||typeof node!=='object')return; if(typeof node.type==='string')visit(node,ancestors); for(const [key,value]of Object.entries(node)){if(['loc','start','end','comments','tokens','errors','extra'].includes(key))continue;if(Array.isArray(value))for(const item of value)walk(item,visit,[...ancestors,node]);else if(value&&typeof value==='object')walk(value,visit,[...ancestors,node]);} }
function functionName(node,parent) { return node.id?.name??(parent?.type==='VariableDeclarator'&&parent.id.type==='Identifier'?parent.id.name:undefined); }
const isFunction = node => ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type);
export function analyzeDeveloperSource(file, buffer) {
  const text=buffer.toString('utf8'), module={sha256:sha(buffer),characters:text.length,lines:text.split('\n').length,packagePath:'dist/source/'+file.slice('src/'.length),parseStatus:'parsed',units:[]};
  if(!Buffer.from(text).equals(buffer)){module.parseStatus='unsupported';return module;}
  let ast;try{ast=parse(text,{sourceType:'module',plugins:['typescript'],ranges:true,errorRecovery:false});}catch{module.parseStatus='unsupported';return module;}
  const scopes=new Map(),isScope=n=>n.type==='Program'||n.type==='BlockStatement'||n.type==='CatchClause'||isFunction(n);
  const bindingNames=n=>!n?[]:n.type==='Identifier'?[n.name]:n.type==='RestElement'?bindingNames(n.argument):n.type==='AssignmentPattern'?bindingNames(n.left):n.type==='ObjectPattern'?n.properties.flatMap(p=>bindingNames(p.value??p.argument)):n.type==='ArrayPattern'?n.elements.flatMap(bindingNames):[];
  const bind=(scope,name,kind='local')=>{if(!scope)return;const values=scopes.get(scope)??new Map();values.set(name,kind);scopes.set(scope,values);};
  walk(ast,(node,ancestors)=>{
    const scope=[...ancestors].reverse().find(isScope);
    if(node.type==='ImportDeclaration')for(const item of node.specifiers)bind(scope,item.local.name,node.source.value==='footprintjs'&&item.type==='ImportSpecifier'&&(item.imported.name??item.imported.value)==='flowChart'?'footprint-factory':'local');
    if(isFunction(node)){for(const p of node.params)for(const name of bindingNames(p))bind(node,name);if(node.type==='FunctionExpression'&&node.id)bind(node,node.id.name);}
    if(['FunctionDeclaration','ClassDeclaration'].includes(node.type)&&node.id)bind(scope,node.id.name);
    if(node.type==='CatchClause')for(const name of bindingNames(node.param))bind(node,name);
    if(node.type==='VariableDeclarator'){const declaration=ancestors.at(-1),target=declaration?.kind==='var'?[...ancestors].reverse().find(n=>n.type==='Program'||isFunction(n)):scope;for(const name of bindingNames(node.id))bind(target,name);}
  });
  const importedFactory=(name,ancestors)=>{for(const scope of [...ancestors].reverse().filter(isScope)){const binding=scopes.get(scope)?.get(name);if(binding)return binding==='footprint-factory';}return false;};
  const chartMethods=new Set(['addFunction','addDeciderFunction','addSelectorFunction','addFunctionBranch','addSubFlowChart','addSubFlowChartBranch','loopTo','end','build']);
  function chartCall(node,ancestors){node=unwrap(node);if(node?.type!=='CallExpression')return false;const callee=unwrap(node.callee);if(callee?.type==='Identifier')return importedFactory(callee.name,ancestors);return callee?.type==='MemberExpression'&&chartMethods.has(method(node))&&chartCall(callee.object,ancestors);}
  function owner(ancestors){return ancestors.flatMap((n,i)=>isFunction(n)?[functionName(n,ancestors[i-1])].filter(Boolean):[]).join('/');}
  function add(node,kind,symbol,extra={}){node=unwrap(node);if(!node||!Number.isInteger(node.start)||!Number.isInteger(node.end))return;const slice=text.slice(node.start,node.end);module.units.push({id:`${kind}:${node.start}:${node.end}`,kind,symbol: symbol||'<anonymous>',...extra,start:node.start,end:node.end,byteStart:Buffer.byteLength(text.slice(0,node.start)),byteEnd:Buffer.byteLength(text.slice(0,node.end)),startLine:node.loc.start.line,endLine:node.loc.end.line,textSha256:sha(slice)});}
  walk(ast,(node,ancestors)=>{
    const parent=ancestors.at(-1),own=owner(ancestors);
    if(isFunction(node)){const name=functionName(node,parent);if(name)add(node,'function',[own,name].filter(Boolean).join('/'),{...(own?{owner:own}:{})});}
    if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.init&&!isFunction(unwrap(node.init)))add(node,'binding',[own,node.id.name].filter(Boolean).join('/'),{...(own?{owner:own}:{}),role:'binding'});
    if(node.type!=='CallExpression')return;
    const callee=unwrap(node.callee),m=method(node);
    if(callee?.type==='MemberExpression'&&!callee.computed&&callee.object.type==='Identifier'&&callee.object.name==='scope'&&['setValue','getValue'].includes(m)&&literal(node.arguments[0]))add(node,'state-access',own,{owner:own,role:m==='setValue'?'writer':'reader',field:literal(node.arguments[0]),access:m==='setValue'?'write':'read',interpretation:'syntactic-call-not-runtime-effect'});
    if(!chartCall(node,ancestors))return;
    const name=callee.type==='Identifier'?'flowChart':m,args=node.arguments;
    const stageId=['addFunctionBranch','addSubFlowChartBranch'].includes(name)?literal(args[0]):literal(args[2]);
    if(['flowChart','addFunction','addDeciderFunction','addSelectorFunction','addFunctionBranch'].includes(name)){
      const target=unwrap(args[name==='addFunctionBranch'?2:1]);
      add(target,isFunction(target??{})?'callback':'expression',own,{owner:own,role:['addDeciderFunction','addSelectorFunction'].includes(name)?'guard':'handler',...(stageId?{stageId}:{})});
    }
    if(['addSubFlowChart','addSubFlowChartBranch'].includes(name)){
      add(args[1],'expression',own,{owner:own,role:'chartExpression',...(stageId?{stageId}:{})});
      const options=unwrap(args[3]);if(options?.type==='ObjectExpression')for(const item of options.properties){const key=item.key?.name??item.key?.value;if(item.type==='ObjectProperty'&&['inputMapper','outputMapper'].includes(key))add(item.value,'expression',own,{owner:own,role:key,...(stageId?{stageId}:{})});}
    }
    if(name==='loopTo')add(args[0],'expression',own,{owner:own,role:'loopTarget'});
  });
  for(const unit of module.units.filter(u=>u.kind==='state-access')){const callback=module.units.filter(c=>c.kind==='callback'&&c.start<=unit.start&&c.end>=unit.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];if(callback?.stageId)unit.stageId=callback.stageId;}
  // A function and its callback location may share a span; their roles are distinct.
  module.units.sort((a,b)=>a.start-b.start||a.end-b.end||a.kind.localeCompare(b.kind));
  return module;
}
export async function productionSources(root) {
  const files=[];async function visit(relative){for(const entry of(await fs.readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(['__tests__','__fixtures__'].includes(entry.name))continue;const name=slash(path.join(relative,entry.name));if(entry.isSymbolicLink())throw new Error('Source artifacts must not follow symlinks: '+name);if(entry.isDirectory())await visit(name);else if(entry.isFile()&&entry.name.endsWith('.ts')&&!/\.(test|spec)\.ts$/.test(entry.name))files.push(name);}}await visit('src');return files;
}
export async function buildDeveloperManifest(root) {
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')),files={};
  for(const file of await productionSources(root))files[file]=analyzeDeveloperSource(file,await fs.readFile(path.join(root,file)));
  return{schemaVersion:1,scope:'source-only-static-syntax',package:{name:pkg.name,version:pkg.version},parser:{name:'@babel/parser',version:'8.1.2'},sourceTreeSha256:sha(JSON.stringify(Object.entries(files).map(([file,unit])=>[file,unit.sha256]))),files};
}
export async function writeDeveloperArtifacts(root) {
  const manifest=await buildDeveloperManifest(root),dist=path.join(root,'dist');
  // One permitted source copy. Tests and customer/runtime values are not collected.
  await fs.rm(path.join(dist,'source'),{recursive:true,force:true});
  for(const [file,unit]of Object.entries(manifest.files)){const target=path.join(root,unit.packagePath);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,file),target);}
  const maps=[];async function visit(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(entry.name==='source')continue;const full=path.join(dir,entry.name);if(entry.isDirectory())await visit(full);else if(entry.name.endsWith('.map'))maps.push(full);}}await visit(dist);
  for(const file of maps){const map=JSON.parse(await fs.readFile(file,'utf8'));if(!Array.isArray(map.sources))throw new Error('Invalid compiler map: '+file);map.sources=map.sources.map(source=>{const original=path.resolve(path.dirname(file),map.sourceRoot??'',source),relative=slash(path.relative(root,original));const unit=manifest.files[relative];if(!unit)throw new Error('Compiler map source is not an admitted production source: '+relative);return slash(path.relative(path.dirname(file),path.join(root,unit.packagePath)));});delete map.sourceRoot;delete map.sourcesContent;await fs.writeFile(file,JSON.stringify(map)+'\n');}
  await fs.mkdir(path.join(dist,'developer'),{recursive:true});await fs.writeFile(path.join(dist,'developer/source-manifest.json'),JSON.stringify(manifest)+'\n');
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');const m=await writeDeveloperArtifacts(root);console.log(`Developer source: ${Object.keys(m.files).length} files; tree ${m.sourceTreeSha256}; unsupported ${Object.values(m.files).filter(f=>f.parseStatus!=='parsed').length}.`);}
