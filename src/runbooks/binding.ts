import { createHash } from 'node:crypto';
import type { RunbookDefinition, RunbookPorts, RunbookTarget } from './types.js';

function digest(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function identifier(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new TypeError('Expected a runbook identifier.');
  }
  return value;
}

function targetRef(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) {
    throw new TypeError('Expected a scoped runbook reference.');
  }
  return value;
}

function requiredPort<T>(ports: ReadonlyMap<string, T>, id: string): T {
  const port = ports.get(id);
  if (typeof port !== 'function') throw new TypeError('A declared runbook port is missing.');
  return port;
}

/** Snapshot the trusted definition and its ports before an execution can pause. */
export function bindRunbook(definition: RunbookDefinition, subject: RunbookTarget, ports: RunbookPorts) {
  const id = identifier(definition.id);
  const revision = identifier(definition.revision);
  const guidanceKey = identifier(definition.guidanceKey);
  const action = identifier(definition.action);
  if (!Array.isArray(definition.checks) || !definition.checks.length) {
    throw new TypeError('Declare at least one runbook check.');
  }
  const ids = Array.from(definition.checks, identifier);
  if (new Set(ids).size !== ids.length) throw new TypeError('Runbook check IDs must be unique.');

  const target = Object.freeze({
    tenantId: targetRef(subject.tenantId), incidentId: targetRef(subject.incidentId), subjectId: targetRef(subject.subjectId),
  });
  const key = 'runbook-' + digest([target.tenantId, target.incidentId, target.subjectId]);
  return {
    id, revision, guidanceKey, action, target, key,
    binding: digest([key, id, revision, guidanceKey, ids, action]),
    checks: ids.map(check => ({ id: check, read: requiredPort(ports.checks, check) })),
    applyOnce: requiredPort(ports.actions, action),
  };
}

export type BoundRunbook = ReturnType<typeof bindRunbook>;
