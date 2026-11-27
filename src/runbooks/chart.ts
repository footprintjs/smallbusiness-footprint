import { flowChart } from 'footprintjs';
import type {
  Runbook,
  RunbookPorts,
  RunbookTarget,
  State,
} from './contract.js';
import { routeProposal } from './select-proposal/stage.js';
import { routeApproval } from './check-decision/stage.js';
import { bindRunbook, bindRunbookPorts } from './definition.js';
import { inspect } from './inspect/stage.js';
import { askOwner } from './approval/stage.js';
import { applyApproved } from './apply/stage.js';

/** Build once for one trusted incident. Reconstruct with the same binding to resume a saved checkpoint. */
export function ownerRunbookChart(
  book: Runbook,
  target: RunbookTarget,
  ports: RunbookPorts
) {
  const binding = bindRunbook(book, target);
  const boundPorts = bindRunbookPorts(ports);
  return flowChart<State>(
    'Inspect incident',
    inspect(binding, boundPorts),
    'inspect-incident',
    { description: 'Read authoritative facts for the bound subject' }
  )
    .addDeciderFunction('Select proposal', routeProposal, 'select-proposal')
    .addFunctionBranch(
      'ask',
      'Ask owner',
      askOwner(binding),
      'Pause for the owner decision'
    )
    .addFunctionBranch('unresolved', 'Finish with unresolved finding', () => {})
    .setDefault('unresolved')
    .end()
    .addDeciderFunction(
      'Check owner decision',
      routeApproval,
      'check-owner-decision'
    )
    .addFunctionBranch(
      'apply',
      'Apply approved action',
      applyApproved(binding, boundPorts),
      'Apply once while the recorded condition holds'
    )
    .addFunctionBranch('stop', 'Finish without action', () => {})
    .setDefault('stop')
    .end()
    .build();
}
