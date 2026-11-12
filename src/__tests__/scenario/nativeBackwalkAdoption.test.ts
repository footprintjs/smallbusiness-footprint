import { describe, expect, it, vi } from 'vitest';
import { flowChart, type RuntimeSnapshot } from 'footprintjs';
import type { ScopeFacade } from 'footprintjs/advanced';
import { keysReadFromExecutionTree, commitValueAt } from 'foottrace';
import { createRecordGraph } from 'foottrace/cause';
import { createRecordedCauseReader, recordedCauseScopes } from 'footprint-blueprint/diagnostics/cause';
import { diagnoseFailureRecording } from 'footprint-blueprint/diagnostics';
import type { BusinessFlowDependencies } from '../../flows/shared/businessFlow.js';
import type { BusinessServiceResult } from '../../flows/businessServiceComposer.js';
import { runFailureScenario } from '../../testing.js';
import { createFixturePlatform, fixtureContext } from '../helpers.js';

const command = { name: 'Recorded product', basePrice: 20 };

function savedSnapshot(result: BusinessServiceResult): RuntimeSnapshot {
  expect(result.executionSnapshot).toBeDefined();
  // Exercise ordinary saved JSON, not a live engine object or a hand-authored graph.
  return JSON.parse(JSON.stringify(result.executionSnapshot)) as RuntimeSnapshot;
}

function assembledFlow(dependencies: BusinessFlowDependencies) {
  return flowChart<unknown, ScopeFacade>('Seed value', scope => {
    scope.setValue('assembled', { original: 1 });
  }, 'seed-value')
    .addFunction('Add part', scope => {
      scope.updateValue('assembled', { added: 2 });
    }, 'add-part')
    .addFunction('Read assembled value and execute', async scope => {
      scope.setValue('observed', scope.getValue('assembled'));
      const input = scope.getValue('input') as { requestRef: string };
      const request = dependencies.requests.get(input.requestRef);
      if (!request || !dependencies.operation) throw new Error('Missing prepared operation');
      request.receipt = await dependencies.operation(request.input, request.context);
    }, 'read-assembled')
    .build();
}

describe('native record and backward-reader adoption', () => {
  it('keeps the earlier writer behind a partial write in a real saved business flow', async () => {
    const operation = vi.fn(async () => ({
      acknowledgement: 'committed' as const,
      output: { productId: 'product-assembled' },
    }));
    const platform = createFixturePlatform({
      operations: { 'create-product': operation },
      flowRegistry: { 'create-product': { default: assembledFlow } },
    });
    const result = await platform.executeServiceFlow(fixtureContext, 'create-product', command);
    expect(result.status).toBe('success');
    expect(result.result).toEqual({ productId: 'product-assembled' });
    expect(operation).toHaveBeenCalledOnce();
    const snapshot = savedSnapshot(result);
    const source = recordedCauseScopes(snapshot, result.causeCapture);
    expect(source.scopes).toHaveLength(1);
    const reads = keysReadFromExecutionTree(snapshot.executionTree);
    const added = snapshot.commitLog.findIndex(row => row.stageId === 'add-part');
    const seed = snapshot.commitLog.findIndex(row => row.stageId === 'seed-value');
    const used = snapshot.commitLog.find(row => row.stageId === 'read-assembled');
    expect(added).toBeGreaterThan(seed);
    expect(reads.lookup(snapshot.commitLog[added].runtimeStageId)).toEqual([]);
    expect(reads.lookup(used!.runtimeStageId)).toContain('assembled');
    expect(commitValueAt(snapshot.commitLog, added, 'assembled')).toEqual({ original: 1, added: 2 });
    const scope = source.scopes[0];
    const graph = createRecordGraph(source.scopes);
    const node = (index: number) => graph.nodeId(scope.address, {
      runtimeStageId: snapshot.commitLog[index].runtimeStageId,
      commitIdx: index,
      key: 'assembled',
    });
    const parents = await graph.parents(node(added), { signal: new AbortController().signal });
    expect(parents.edges).toContainEqual(expect.objectContaining({
      nodeId: node(seed), kind: 'data', attribution: 'recorded-write',
    }));
    // The row says the value was built on an earlier write; it does not claim a JS expression used it.
    expect(JSON.stringify(result)).not.toContain('requestRef');
  });

  it('keeps a missing recording boundary unknown instead of naming a successful step as the cause', async () => {
    const result = await createFixturePlatform().executeServiceFlow(fixtureContext, 'create-product', command);
    expect(result.status).toBe('success');
    const snapshot = savedSnapshot(result);
    const { executionTree: _missing, ...withoutTree } = snapshot;
    const source = recordedCauseScopes(withoutTree);
    expect(source.incomplete).toBe(true);
    const reader = createRecordedCauseReader(source);
    const selected = reader.nodes.find(node => node.selection.key === 'output');
    expect(selected).toBeDefined();
    const finding = await reader.explain(selected!.id);
    expect(finding.confidence).toBe('incomplete');
    expect(finding.rootCause).toBeUndefined();
    expect(finding.gaps).toContainEqual(expect.objectContaining({ code: 'not-collected' }));
  });

  it('keeps concurrent success and failure observations bound to their own native runs', async () => {
    const failure = 'PRIVATE_CONCURRENT_OPERATION_ERROR';
    const operation = vi.fn(async input => {
      await Promise.resolve();
      if (input.name === 'fails') throw new Error(failure);
      return { acknowledgement: 'committed' as const, output: { productId: input.name } };
    });
    const platform = createFixturePlatform({ operations: { 'create-product': operation } });
    const results = await Promise.all(['first', 'fails', 'last'].map(name =>
      platform.executeServiceFlow(fixtureContext, 'create-product', { ...command, name })));
    expect(operation).toHaveBeenCalledTimes(3);
    expect(results.map(result => result.status)).toEqual(['success', 'error', 'success']);
    expect(results[0].result).toEqual({ productId: 'first' });
    expect(results[2].result).toEqual({ productId: 'last' });
    const snapshots = results.map(savedSnapshot);
    expect(new Set(snapshots.map(snapshot => snapshot.runId)).size).toBe(3);
    for (const [index, result] of results.entries()) {
      expect(result.causeCapture?.runId).toBe(snapshots[index].runId);
      expect(recordedCauseScopes(snapshots[index], result.causeCapture).scopes[0].address.logRunId)
        .toBe(snapshots[index].runId);
    }
    const failed = createRecordedCauseReader(recordedCauseScopes(snapshots[1], results[1].causeCapture));
    expect(failed.nodes.length).toBeGreaterThan(0);
    const finding = await failed.explain(failed.nodes[0].id);
    expect(finding.confidence).toBe('incomplete');
    expect(finding.rootCause).toBeUndefined();
    expect(JSON.stringify(results)).not.toContain(failure);
  });

  it('preserves the real successful native answer vocabulary through storage and diagnosis', async () => {
    const { record, observed } = await runFailureScenario('success');
    expect(observed).toMatchObject({ businessResult: 'ok', networkCalls: 0, modelCalls: 0, cloudCalls: 0 });
    const completed = record.boundaryEvidence.filter(row => row.outcome === 'ok');
    expect(completed).toHaveLength(3);
    expect(completed.every(row => row.decision.reason === 'answered')).toBe(true);
    const report = diagnoseFailureRecording(JSON.parse(JSON.stringify(record)));
    expect(report.status).toBe('ok');
    expect(report.coverage.upstreamRootCause).toBe('unknown');
  });
});
