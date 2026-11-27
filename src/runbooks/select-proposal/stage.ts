import { decide, type TypedScope } from 'footprintjs';
import type { State } from '../contract.js';

export function routeProposal(scope: TypedScope<State>) {
  return decide(
    scope,
    [
      {
        when: { ready: { eq: true } },
        then: 'ask',
        label: 'One configured action',
      },
    ],
    'unresolved'
  );
}
