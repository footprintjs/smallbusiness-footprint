import { describe, expect, it } from 'vitest';
import { diagnoseFailureRecording } from 'footprint-blueprint/diagnostics';
import { commerceFailureExplanationTemplates } from '../../../diagnostics.js';
import { runBoundaryEvidenceScenario } from '../../../testing/boundaryScenarios.js';
import { runFailureScenario } from '../../../testing/runner.js';

describe('optional commerce explanation wording', () => {
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
