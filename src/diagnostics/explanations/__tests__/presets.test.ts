import { describe, expect, it } from 'vitest';
import { diagnoseFailureRecording } from 'footprint-blueprint/diagnostics';
import { commerceFailureExplanationTemplates } from '../../../diagnostics.js';
import { runBoundaryEvidenceScenario } from '../../../testing/boundaryScenarios.js';
import { runFailureScenario } from '../../../testing/runner.js';
import { flowChart, FlowChartExecutor } from 'footprintjs';
import { createCommerceBoundaryRecorder } from '../../../diagnostics/runtime.js';

describe('optional commerce explanation wording', () => {
  it('uses actor-neutral wording when credentials fail before any service dispatch', async () => {
    const recorder = createCommerceBoundaryRecorder();
    let dispatches = 0;
    const resolveCredentials = async () => { throw Object.assign(new Error('Private local setup'), { name: 'CredentialsProviderError' }); };
    const chart = flowChart('Read with local credentials', async scope => {
      try {
        await recorder.run(scope, { system: 'database', operation: 'read', target: 'database.read', effect: 'read' }, async () => {
          await resolveCredentials();
          dispatches++;
          return { found: true };
        });
      } catch { /* Preserve the native child failure without exposing private error text. */ }
    }, 'local-credentials').retry({ attempts: 1, timeoutMs: 2000 }).setLogger({ log() {}, info() {}, debug() {}, warn() {}, error() {} }).build();
    const executor = new FlowChartExecutor(chart);
    executor.attachFlowRecorder(recorder.flowRecorder);
    await executor.run();
    const captured = recorder.snapshot();
    const nativeSnapshot = executor.getSnapshot({ redact: true });
    const record = JSON.parse(JSON.stringify({ schemaVersion: 1, storeId: 'local', flowId: 'credentials', runId: nativeSnapshot.runId,
      nativeSnapshot, boundaryEvidence: captured.boundaryEvidence, physicalEvidence: captured.physicalEvidence,
      coverage: captured.coverage, diagnostics: { persistence: 'stored', ...captured.diagnostics } }));
    const diagnosis = diagnoseFailureRecording(record);
    expect(dispatches).toBe(0);
    expect(diagnosis.causes.find(row => row.code === 'AUTH_REJECTION_RECORDED')?.evidenceRefs.length).toBeGreaterThan(0);
    expect(diagnosis.coverage.upstreamRootCause).toBe('unknown');
    expect(commerceFailureExplanationTemplates.find(row => row.id === 'commerce-access-rejected')?.problem)
      .toBe('The business operation encountered an access problem.');
  });
  it('matches the actual recorded access rejection, without claiming an upstream root', async () => {
    const { record } = await runBoundaryEvidenceScenario('boundary-db-auth');
    const diagnosis = diagnoseFailureRecording(JSON.parse(JSON.stringify(record)));
    const finding = diagnosis.causes.find(row => row.code === 'AUTH_REJECTION_RECORDED');
    expect(finding?.evidenceRefs.length).toBeGreaterThan(0);
    expect(commerceFailureExplanationTemplates.find(row => row.id === 'commerce-access-rejected')?.when.findingCode).toBe(finding?.code);
    expect(diagnosis.coverage.upstreamRootCause).toBe('unknown');
  });

  it('offers reconciliation wording for a genuinely recorded unknown write effect', async () => {
    const { record, observed } = await runBoundaryEvidenceScenario('boundary-payment-unknown');
    const diagnosis = diagnoseFailureRecording(record);
    const finding = diagnosis.consequences.find(row => row.code === 'UNKNOWN_EXTERNAL_EFFECT_RECORDED');
    const preset = commerceFailureExplanationTemplates.find(row => row.id === 'commerce-write-uncertain');
    expect(observed.paymentWriteAttempts).toBe(1);
    expect(finding?.evidenceRefs.length).toBeGreaterThan(0);
    expect(preset?.when.findingCode).toBe(finding?.code);
    expect(preset).not.toHaveProperty('suggestedNextStep');
    expect(diagnosis.recommendations.join(' ')).toContain('original operation');
    expect(diagnosis.coverage.externalEffect).toBe('unknown');
  });

  it('describes recorded transport recovery without claiming customer delivery', async () => {
    const { record } = await runBoundaryEvidenceScenario('boundary-db-recovered');
    const diagnosis = diagnoseFailureRecording(record);
    const finding = diagnosis.consequences.find(row => row.code === 'PHYSICAL_RECOVERY_RECORDED');
    const preset = commerceFailureExplanationTemplates.find(row => row.id === 'commerce-retry-recovered');
    expect(finding?.evidenceRefs.length).toBeGreaterThan(0);
    expect(diagnosis.status).toBe('recovered');
    expect(preset?.when).toEqual({ status: 'recovered', findingCode: finding?.code });
    expect(preset?.suggestedNextStep).toContain('customer-facing result');
  });

  it('keeps a failed troubleshooting save separate from the original business operation', async () => {
    const { record } = await runFailureScenario('business-success-trace-store-fail');
    const diagnosis = diagnoseFailureRecording(record);
    const finding = diagnosis.diagnosticFailures.find(row => row.code === 'TRACE_PERSISTENCE_FAILED');
    const preset = commerceFailureExplanationTemplates.find(row => row.id === 'commerce-record-unavailable');
    expect(finding?.evidenceRefs.length).toBeGreaterThan(0);
    expect(preset?.when.findingCode).toBe(finding?.code);
    expect(preset?.problem).toBe('We could not confirm the troubleshooting record was saved.');
    expect(diagnosis.coverage.nativeRecording).toBe('missing');
  });

  it('does not turn a generic boundary error into a shipping or inventory explanation', () => {
    const codes = commerceFailureExplanationTemplates.map(row => row.when.findingCode);
    expect(codes).not.toContain('BOUNDARY_FAILURE_RECORDED');
    expect(codes).not.toContain('SHIPPING_NO_OPTIONS');
    expect(commerceFailureExplanationTemplates.every(row => !('recordedCause' in row))).toBe(true);
  });

  it('cannot be changed by one store for later callers', () => {
    expect(commerceFailureExplanationTemplates).toBeDefined();
    expect(() => (commerceFailureExplanationTemplates as unknown as unknown[]).pop()).toThrow();
    expect(() => Object.assign(commerceFailureExplanationTemplates[0]!.when, { findingCode: 'BOUNDARY_FAILURE_RECORDED' })).toThrow();
    expect(() => Object.assign(commerceFailureExplanationTemplates[0]!, { suggestedNextStep: 'Retry now' })).toThrow();
  });
});
