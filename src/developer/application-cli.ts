#!/usr/bin/env node
/** Explicit JSON build tooling; never imports an application module or executes its commands. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplicationDeveloperContext, checkApplicationDeveloperContext, writeApplicationDeveloperContext } from './application.js';
import type { ApplicationDeveloperIndex } from './application.js';
import type { DeveloperSourceManifest } from './types.js';
const usage = 'smallbusiness-context build|check --config <application-context.json> [--root <project>] [--goal <public development goal>]';
export async function runApplicationContextCLI(args: readonly string[]): Promise<{ exitCode: number; output: string }> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) return { exitCode: 0, output: usage };
  try {
    const mode = args[0]; if (mode !== 'build' && mode !== 'check') throw new Error(usage);
    const flags: Record<string, string> = {};
    for (let i = 1; i < args.length; i += 2) {
      const key = args[i]!, value = args[i + 1];
      if (!['--config', '--root', '--goal'].includes(key) || Object.hasOwn(flags, key) || value === undefined || value.startsWith('--')) throw new Error(usage);
      flags[key] = value;
    }
    if (!flags['--config']) throw new Error(usage);
    const root = await fs.realpath(path.resolve(flags['--root'] ?? process.cwd()));
    const raw: unknown = JSON.parse(await fs.readFile(path.resolve(root, flags['--config']), 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Configuration must be an object');
    const c = raw as Record<string, unknown>;
    if (Object.keys(c).some(k => !['index','goal','characterBudget','sourceManifestFile','outputDir','readmeFile','agentFile'].includes(k))) throw new Error('Unknown configuration field');
    for (const k of ['goal','sourceManifestFile','outputDir','readmeFile','agentFile']) if (c[k] !== undefined && typeof c[k] !== 'string') throw new Error(`${k} must be a string`);
    if (c.characterBudget !== undefined && (!Number.isSafeInteger(c.characterBudget) || (c.characterBudget as number) < 0)) throw new Error('characterBudget must be a nonnegative integer');
    const sourceManifest = c.sourceManifestFile === undefined ? undefined : JSON.parse(await fs.readFile(path.resolve(root, c.sourceManifestFile as string), 'utf8')) as DeveloperSourceManifest;
    const context = await buildApplicationDeveloperContext({ root, index: c.index as ApplicationDeveloperIndex, goal: flags['--goal'] ?? (c.goal as string | undefined) ?? '', ...(sourceManifest ? { sourceManifest } : {}), ...(c.characterBudget === undefined ? {} : { characterBudget: c.characterBudget as number }) });
    const options = { root, context, ...(c.outputDir === undefined ? {} : { outputDir: c.outputDir as string }), ...(c.readmeFile === undefined ? {} : { readmeFile: c.readmeFile as string }), ...(c.agentFile === undefined ? {} : { agentFile: c.agentFile as string }) };
    if (mode === 'check') { const result = await checkApplicationDeveloperContext(options); return { exitCode: result.valid ? 0 : 1, output: JSON.stringify({ mode, ...result, packetCharacters: context.packetText.length }) }; }
    const result = await writeApplicationDeveloperContext(options); return { exitCode: 0, output: JSON.stringify({ mode, ...result, packetCharacters: context.packetText.length }) };
  } catch (error) { return { exitCode: 1, output: JSON.stringify({ error: error instanceof Error ? error.message : 'Application context failed' }) }; }
}
const invokedDirectly = process.argv[1] ? await fs.realpath(path.resolve(process.argv[1])).then(file => file === fileURLToPath(import.meta.url), () => false) : false;
if (invokedDirectly) {
  const result = await runApplicationContextCLI(process.argv.slice(2)); process.stdout.write(result.output + '\n'); process.exitCode = result.exitCode;
}
