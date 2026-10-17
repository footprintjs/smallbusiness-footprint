/** Local commerce fault scenarios. Import explicitly in developer tools; never mount as a customer route. */
export { SCENARIOS, listFailureScenarios, runFailureScenario } from './testing/runner.js';
export type { FailureScenario, FailureTarget } from './testing/scenarios.js';
export type { FailureRecordingKey, FailureScenarioStorage, FailureScenarioOptions, FailureScenarioObserved, FailureScenarioResult } from './testing/runner.js';
