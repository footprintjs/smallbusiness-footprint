import { flowChart } from 'footprintjs';
import { bindRunbook } from './binding.js';
import { readChecks } from './checks/index.js';
import { checkEligibility } from './eligibility/index.js';
import { recordUnavailable } from './unavailable/index.js';
import { requestApproval } from './approval/index.js';
import { authorizeAction } from './authorization/index.js';
import { applyAction } from './action/index.js';
import { closeWithoutAction } from './close/index.js';
import type { RunbookDefinition, RunbookPorts, RunbookState, RunbookTarget } from './types.js';

export function createRunbookChart(definition: RunbookDefinition, target: RunbookTarget, ports: RunbookPorts) {
  const book = bindRunbook(definition, target, ports);
  const approval = flowChart<RunbookState>('Request owner approval', requestApproval(book), 'owner-approval')
    .addDeciderFunction('Route owner decision', authorizeAction, 'authorize')
    .addFunctionBranch('apply', 'Apply scoped action', applyAction(book), undefined, {
      touches: { system: book.action, idempotencyKey: () => book.key },
    })
    .addFunctionBranch('close', 'Close without action', closeWithoutAction)
    .end().build();

  return flowChart<RunbookState>('Read required checks', readChecks(book), 'read-checks')
    .addDeciderFunction('Check eligibility', checkEligibility, 'eligibility')
    .addSubFlowChartBranch('eligible', approval, 'Owner approval', {
      inputMapper: (parent: RunbookState) => ({ binding: parent.binding }),
      outputMapper: (child: RunbookState) => ({ decision: child.decision, outcome: child.outcome }),
    })
    .addFunctionBranch('unavailable', 'Record unmet checks', recordUnavailable)
    .end().build();
}
