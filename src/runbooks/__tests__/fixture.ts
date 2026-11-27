import { FlowChartExecutor, type FlowchartCheckpoint } from 'footprintjs';
import { expect, vi } from 'vitest';
import { createRunbookChart, type RunbookAction, type RunbookCheck, type RunbookDefinition } from '../../runbooks.js';

export const definition: RunbookDefinition = {
  id: 'test-runbook', revision: '1', guidanceKey: 'runbook.test',
  checks: ['eligible'], action: 'repair',
};
export const target = { tenantId: 'sample-tenant', incidentId: 'case-42', subjectId: 'item-7' };

export function fixture(read: RunbookCheck = async () => 'pass') {
  const check = vi.fn(read);
  const receipts = new Map<string, string>();
  const apply = vi.fn<RunbookAction>(async (subject, key) => {
    if (!receipts.has(key)) receipts.set(key, subject.subjectId);
    return 'applied';
  });
  const other = vi.fn<RunbookAction>();
  const ports = { checks: new Map([['eligible', check]]), actions: new Map([['repair', apply], ['other', other]]) };
  const executor = (book = definition, subject = target) =>
    new FlowChartExecutor(createRunbookChart(book, subject, ports));
  async function pause(): Promise<FlowchartCheckpoint> {
    const run = executor();
    await run.run();
    expect(run.getCheckpoint()?.pausedBy).toBe('interrupt');
    return JSON.parse(JSON.stringify(run.getCheckpoint()));
  }
  return { check, apply, other, ports, receipts, executor, pause };
}
