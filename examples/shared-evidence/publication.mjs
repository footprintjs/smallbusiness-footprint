/** Reduced Charming Cherubs boundary pattern, not the complete app workflow.
 * Actual Blueprint/FootPrint actions + SMB typed port; storage is in memory.
 * Every calls link points to a real nested action invocation and its native trace.
 */
import {
  createPlatform, createActionRegistry, createModuleRegistry,
  defineModule, defineProfile, createMemoryProfileStore,
} from '@footprint/platform';
import { createPublicationOperation } from 'smallbusiness-footprint';
import { assert, checkEvidence, checkPrivacy, summarize } from './shared.mjs';

const scope = Object.freeze({ tenantId: 'demo-shop', unitId: 'demo-shop' });
// Trusted application session fixture. A tool payload cannot choose this identity.
const context = Object.freeze({ ...scope, userId: 'verified-demo-editor' });
const PRIVATE_DRAFT = 'PRIVATE_EDITOR_CONTENT';
const state = { version: 0, themeRevision: 1, commits: 0, privateDraft: PRIVATE_DRAFT };
const registry = createModuleRegistry({
  modules: [defineModule({ id: 'storefront', name: 'Storefront', domain: 'commerce' })],
  profileTypes: [defineProfile({ type: 'demo-shop', displayName: 'Demo shop', modules: ['storefront'], roles: ['Editor'] })],
});
const inputSchema = { type: 'object', additionalProperties: false, required: ['kind', 'expectedVersion', 'expectedRevision', 'source'], properties: {
  kind: { const: 'activate' }, expectedVersion: { type: 'integer', minimum: 0 }, expectedRevision: { type: 'integer', minimum: 0 },
  source: { type: 'object', additionalProperties: false, required: ['kind', 'id'], properties: { kind: { const: 'theme' }, id: { const: 'spring' } } },
} };
const definition = id => ({ id, name: id, description: 'Publish a captured sample storefront revision', domain: 'storefront', category: 'workflow', parameters: [], requiredModules: ['storefront'], requiredPermissions: ['storefront:publish'], inputSchema });
const traces = [];
const platform = (id, handler) => createPlatform({
  registry,
  profileStore: createMemoryProfileStore([{ ...scope, profileType: 'demo-shop', revision: 0, createdAt: '2030-02-08T00:00:00Z' }]),
  actionRegistry: createActionRegistry({ actions: [definition(id)] }),
  authorizer: ({ action, context: caller }) => action.id === id && caller.userId === context.userId
    && caller.tenantId === scope.tenantId && caller.unitId === scope.unitId,
  handlers: { [id]: handler },
  traceRecorder: { async record(trace) { traces.push(trace); } },
  // No payload/actor projection: metadata-only receipts and private native context.
});

const inner = platform('commit-publication', async (_id, command, _context, evidence) => {
  evidence.observe({ kind: 'publication.current-version', operation: 'publication.read-guards', recordIds: [scope.unitId],
    data: { version: state.version, themeRevision: state.themeRevision, privateDraft: state.privateDraft } });
  if (command.expectedVersion !== state.version || command.expectedRevision !== state.themeRevision) {
    throw Object.assign(new Error('The captured publication or source revision is stale.'), { code: 'PUBLICATION_CONFLICT' });
  }
  // No await between checking and mutating: one authoritative in-memory commit.
  // A production port replaces this with a durable, conditional storage transaction.
  state.version++; state.themeRevision++; state.commits++;
  evidence.effect({ kind: 'storefront.publication', operation: 'publication.commit', phase: 'committed', count: 1, recordIds: [scope.unitId] });
  return { config: { version: state.version, publication: { storeId: scope.unitId, revision: state.version, publishedAt: '2030-02-08T00:00:00Z' } }, source: { revision: state.themeRevision } };
});

const outer = platform('publish-storefront', async (_id, input, resolved, evidence) => {
  evidence.observe({ kind: 'publication.request-guards', operation: 'publication.capture-guards',
    parameters: { expectedVersion: input.expectedVersion, expectedRevision: input.expectedRevision } });
  const operation = createPublicationOperation({ async publish(command) {
    const result = await inner.executeAction(context, 'commit-publication', command);
    if (result.executionTrace) evidence.link({ relation: 'calls', runId: result.executionTrace.runId });
    if (result.status !== 'success') throw result.cause ?? new Error('Publication failed.');
    assert.ok(result.executionTrace, 'This local run requires its actual inner trace.');
    return { ...result.result, traceRunId: result.executionTrace.runId };
  } });
  const acknowledged = await operation(input, { ...scope, businessType: resolved.profileType, userId: resolved.userId });
  assert.equal(acknowledged.acknowledgement, 'committed');
  // Report only after the authoritative port and typed receipt verification return.
  evidence.effect({ kind: 'storefront.publication', operation: 'publish-storefront', phase: 'committed', count: 1, recordIds: [scope.unitId] });
  return acknowledged.output;
});

async function publish(command) {
  const before = state.commits;
  const result = await outer.executeAction(context, 'publish-storefront', command);
  checkEvidence(result.evidence);
  assert.equal(result.evidence.engineRunId, result.executionTrace.executionSnapshot.runId);
  const [link] = result.evidence.links;
  const innerTrace = traces.find(trace => trace.runId === link?.runId && trace.flowId === 'commit-publication');
  assert.ok(innerTrace, 'The calls link must target an actual recorded nested invocation.');
  assert.notEqual(innerTrace.runId, result.executionTrace.runId);
  assert.equal(innerTrace.evidence.engineRunId, innerTrace.executionSnapshot.runId);
  checkEvidence(innerTrace.evidence);
  const delta = state.commits - before;
  assert.equal(delta, result.status === 'success' ? 1 : 0);
  for (const receipt of [innerTrace.evidence, result.evidence]) {
    assert.equal(receipt.effects.length, delta);
    if (delta) assert.equal(receipt.effects[0].phase, 'committed');
  }
  checkPrivacy([result.executionTrace, innerTrace], PRIVATE_DRAFT, context.userId);
  return { result, innerTrace, commits: delta };
}

const approved = Object.freeze({ kind: 'activate', source: Object.freeze({ kind: 'theme', id: 'spring' }), expectedVersion: 0, expectedRevision: 1 });
const successful = await publish(approved);
const stale = await publish(approved); // Exact replay: never silently substitute new guards.
const sourceStale = await publish({ ...approved, expectedVersion: 1 }); // Current pointer, stale source.
assert.equal(successful.result.status, 'success');
assert.equal(stale.result.errorCode, 'PUBLICATION_CONFLICT');
assert.equal(stale.result.evidence.outcome.status, 'failed'); // Domain failure inside execution, not schema denial.
assert.equal(sourceStale.result.errorCode, 'PUBLICATION_CONFLICT');
assert.equal(state.version, 1); assert.equal(state.themeRevision, 2); assert.equal(state.commits, 1);

const beforeDenied = state.commits;
const denied = await outer.executeAction({ ...scope, userId: 'unverified-caller' }, 'publish-storefront', approved);
assert.equal(denied.evidence.outcome.status, 'rejected');
assert.deepEqual(denied.evidence.links, []); assert.deepEqual(denied.evidence.effects, []);
assert.equal(state.commits, beforeDenied);
const tools = await outer.getAvailableActions(context);
assert.equal(tools.length, 1); // Discoverable schema only; no MCP transport or agent starts.

console.log(JSON.stringify({
  example: 'Reduced Charming Cherubs pattern: actual Blueprint actions + SMB port + in-memory guarded publisher',
  assertions: 'passed',
  note: 'Committed is the authoritative in-memory port acknowledgement, not proof of durable database storage. A future caller uses the same schema and trusted authorization boundary; no agent is included.',
  discoveredTools: tools.map(tool => tool.name),
  scenarios: [summarize('publication-committed', successful.result, { actualCommits: successful.commits, innerRunId: successful.innerTrace.runId }),
    summarize('exact-stale-request-failed', stale.result, { actualCommits: stale.commits, innerRunId: stale.innerTrace.runId }),
    summarize('stale-source-failed', sourceStale.result, { actualCommits: sourceStale.commits, innerRunId: sourceStale.innerTrace.runId }),
    summarize('unauthorized-request-rejected', denied, { actualCommits: 0 })],
}, null, 2));
