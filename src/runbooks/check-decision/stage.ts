import { decide, type TypedScope } from 'footprintjs';
import type { State } from '../contract.js';

export function routeApproval(scope: TypedScope<State>) {
  return decide(
    scope,
    [
      {
        when: { approved: { eq: true } },
        then: 'apply',
        label: 'Owner approved',
      },
    ],
    'stop'
  );
}
