import { expect, vi } from 'vitest';
import { FlowChartExecutor } from 'footprintjs';
import { ownerRunbookChart, type RunbookDecision, type RunbookPorts } from '../../runbooks.js';

export const subject = {
  tenant: 'shop-a',
  incident: 'incident-1',
  subject: 'order-1',
};
export const book = {
  id: 'settlement',
  version: '1',
  actions: { unpaid: 'release-stock', paid: 'confirm-order' },
};

export function answer(
  decision: RunbookDecision['decision'] = 'approve',
  action = 'release-stock'
): RunbookDecision {
  return { decision, incident: subject.incident, action };
}

export function fixture() {
  let finding: string | undefined = 'unpaid';
  let effects = 0;
  const committed = new Map<string, string>();
  const applyOnce = vi.fn<RunbookPorts['applyOnce']>(async (command) => {
    const claim = JSON.stringify([
      command.subject,
      command.runbook,
      command.version,
      command.finding,
      command.action,
    ]);
    const previous = committed.get(command.operationKey);
    if (previous !== undefined)
      return previous === claim ? 'already-applied' : 'conflict';
    if (finding !== command.finding) return 'stale';
    committed.set(command.operationKey, claim);
    effects++;
    return 'applied';
  });
  const inspect = vi.fn<RunbookPorts['inspect']>(async () => finding ?? null);
  const ports = { inspect, applyOnce };
  const chart = ownerRunbookChart(book, subject, ports);
  function runner() {
    return new FlowChartExecutor(chart);
  }
  async function pause() {
    const run = runner();
    await run.run();
    expect(run.isPaused()).toBe(true);
    expect(applyOnce).not.toHaveBeenCalled();
    return JSON.parse(JSON.stringify(run.getCheckpoint()));
  }
  return {
    runner,
    ports,
    pause,
    change: (next?: string) => {
      finding = next;
    },
    effects: () => effects,
  };
}
