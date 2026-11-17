import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runApplicationContextCLI } from '../../developer/application-cli.js';
describe('explicit application context CLI', () => {
  it('builds/checks JSON without executing source, preserves instructions and detects stale code', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smb-app-cli-'));
    try {
      await fs.mkdir(path.join(root,'src')); await fs.mkdir(path.join(root,'test'));
      await fs.writeFile(path.join(root,'src/app.mjs'),'throw new Error("must not execute");\nexport function run(v){return v;}\n');
      await fs.writeFile(path.join(root,'test/smoke.mjs'),'import {run} from "../src/app.mjs";\n');
      await fs.writeFile(path.join(root,'README.md'),'# User guide\nKeep this.\n');
      const config={index:{applicationName:'Example',sourceFiles:['src/app.mjs'],flows:[{id:'run',sources:[{file:'src/app.mjs'}]}],development:{entry:{file:'src/app.mjs',exportName:'run'},commands:{test:'node --test test/*.mjs'},smokeTest:{file:'test/smoke.mjs'}}},goal:'run',readmeFile:'README.md',agentFile:'AGENTS.md'};
      await fs.writeFile(path.join(root,'context.json'),JSON.stringify(config));
      const call=(mode:string)=>runApplicationContextCLI([mode,'--root',root,'--config','context.json']);
      expect((await call('check')).exitCode).toBe(1);expect((await call('build')).exitCode).toBe(0);expect((await call('check')).exitCode).toBe(0);
      expect(await fs.readFile(path.join(root,'README.md'),'utf8')).toContain('# User guide\nKeep this.');
      expect(JSON.parse((await call('build')).output).changed).toEqual([]);
      const packet=await fs.readFile(path.join(root,'docs/application-context/packet.md'),'utf8');await fs.appendFile(path.join(root,'src/app.mjs'),'// changed\n');
      expect((await call('check')).exitCode).toBe(1);expect(await fs.readFile(path.join(root,'docs/application-context/packet.md'),'utf8')).toBe(packet);
    }finally{await fs.rm(root,{recursive:true,force:true});}
  });
  it('provides help and rejects unsupported/repeated flags',async()=>{
    expect((await runApplicationContextCLI(['--help'])).exitCode).toBe(0);expect((await runApplicationContextCLI(['execute','--config','x'])).exitCode).toBe(1);expect((await runApplicationContextCLI(['build','--config','x','--config','y'])).exitCode).toBe(1);
  });
});
