export { catalog } from "./catalog.js";
export { orders } from "./orders.js";
export { payments } from "./payments.js";
export { subscribers } from "./subscribers.js";
export { campaigns } from "./campaigns.js";
export { inventory } from "./inventory.js";
export { storefront } from "./storefront.js";

import { catalog } from "./catalog.js";
import { orders } from "./orders.js";
import { payments } from "./payments.js";
import { subscribers } from "./subscribers.js";
import { campaigns } from "./campaigns.js";
import { inventory } from "./inventory.js";
import { storefront } from "./storefront.js";

/**
 * All business modules in dependency order.
 */
export const allBusinessModules = [
  catalog,
  subscribers,
  orders,
  payments,
  campaigns,
  inventory,
  storefront,
] as const;
