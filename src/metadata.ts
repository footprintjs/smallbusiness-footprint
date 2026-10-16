/** Configuration-only exports: importing this entry never loads a flow executor or provider. */
export { allBusinessModules } from './modules/index.js';
export { allBusinessProfiles, businessTypeConfigs, toBusinessTypeConfig } from './profiles/index.js';
export { allBusinessCapabilities } from './capabilities/index.js';
export { allBusinessActions } from './actions/index.js';
export { businessTerminology, businessTerminologyFull } from './terminology/businessTerms.js';
export type { BusinessType, DefaultBusinessType, BusinessTypeConfig } from './types.js';
