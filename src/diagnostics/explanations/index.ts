/**
 * Optional commerce wording for Blueprint's evidence-preserving explanation formatter.
 * These are authored suggestions, not new findings, causal authority or executable actions.
 * The data shape is inferred so this entry adds no dependency on an unreleased formatter API.
 */
export const commerceFailureExplanationTemplates = Object.freeze([
  Object.freeze({
    id: 'commerce-access-rejected',
    when: Object.freeze({ findingCode: 'AUTH_REJECTION_RECORDED' }),
    problem: 'The business operation encountered an access problem.',
    suggestedNextStep: 'Ask an administrator to check credentials and access settings.',
  }),
  Object.freeze({
    id: 'commerce-write-uncertain',
    when: Object.freeze({ findingCode: 'UNKNOWN_EXTERNAL_EFFECT_RECORDED' }),
    problem: 'The result of a business update is uncertain.',
  }),
  Object.freeze({
    id: 'commerce-retry-recovered',
    when: Object.freeze({ status: 'recovered', findingCode: 'PHYSICAL_RECOVERY_RECORDED' }),
    problem: 'A service call answered after an earlier failed attempt.',
    suggestedNextStep: 'Check the customer-facing result separately before reporting the whole task as complete.',
  }),
  Object.freeze({
    id: 'commerce-record-unavailable',
    when: Object.freeze({ findingCode: 'TRACE_PERSISTENCE_FAILED' }),
    problem: 'We could not confirm the troubleshooting record was saved.',
    suggestedNextStep: 'Check the recording service separately; the business operation keeps its own recorded outcome.',
  }),
] as const);
