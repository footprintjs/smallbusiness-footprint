import { FlowChartExecutor, ManifestFlowRecorder } from "footprintjs";
import type { FlowChart } from "footprintjs";

import type { BusinessRepository, BusinessFlowContext, BusinessType } from "../types.js";
import { businessTerminology } from "../terminology/businessTerms.js";
import { createProductCreateFlow } from "./catalog/productCreateFlow.js";
import { createProductUpdateFlow } from "./catalog/productUpdateFlow.js";
import { createOrderCreateFlow } from "./orders/orderCreateFlow.js";
import { createSubscriberCreateFlow } from "./subscribers/subscriberCreateFlow.js";
import { createSubscriberUnsubscribeFlow } from "./subscribers/subscriberUnsubscribeFlow.js";
import { createCampaignCreateFlow } from "./campaigns/campaignCreateFlow.js";
import { createCampaignScheduleFlow } from "./campaigns/campaignScheduleFlow.js";
import { createCampaignSendBatchFlow } from "./campaigns/campaignSendBatchFlow.js";

export type BusinessServiceRegistry = {
  getFlow(actionId: string): FlowChart | undefined;
  getTypedFlow(actionId: string, businessType: BusinessType): FlowChart | undefined;
  serviceIds(): readonly string[];
  executeService(
    actionId: string,
    input: Record<string, unknown>,
    context: BusinessFlowContext,
  ): Promise<BusinessServiceResult>;
  buildServiceFlow(
    actionId: string,
    context: BusinessFlowContext,
  ): BuiltServiceFlow | undefined;
  describeService(actionId: string, businessType?: BusinessType): ServiceDescription | undefined;
  describeAllServices(businessType?: BusinessType): readonly ServiceDescription[];
};

export type BuiltServiceFlow = {
  readonly flow: FlowChart;
  readonly flowMeta: {
    readonly flowId: string;
    readonly description?: string;
    readonly stageDescriptions: Record<string, string>;
    readonly buildTimeStructure: unknown;
  };
};

export type BusinessServiceResult = {
  readonly status: "success" | "error";
  readonly result?: Record<string, unknown>;
  readonly error?: string;
  readonly manifest: readonly ManifestEntry[];
  readonly narrative: readonly string[];
  readonly flowMeta?: {
    readonly flowId: string;
    readonly description?: string;
    readonly stageDescriptions?: Record<string, string>;
    readonly snapshot?: Record<string, unknown>;
    readonly buildTimeStructure?: unknown;
  };
};

export type ServiceDescription = {
  readonly actionId: string;
  readonly description: string;
  readonly stages: readonly { name: string; id: string; description: string }[];
};

type ManifestEntry = {
  subflowId: string;
  name: string;
  description?: string;
  children: ManifestEntry[];
};

function createTermResolver(businessType: BusinessType): (key: string) => string {
  return (key: string) => {
    const entry = businessTerminology[key as keyof typeof businessTerminology];
    if (!entry) return key;
    return entry[businessType] ?? entry.default ?? key;
  };
}

// ---------------------------------------------------------------------------
// ActionFlowRegistry
// ---------------------------------------------------------------------------

export type FlowBuilder = (repo: BusinessRepository, t?: (key: string) => string) => any;

export type ActionFlowEntry = {
  readonly default: FlowBuilder;
  readonly variants?: Partial<Readonly<Record<BusinessType, FlowBuilder>>>;
};

export type ActionFlowRegistry = Readonly<Record<string, ActionFlowEntry>>;

const ACTION_FLOW_REGISTRY: ActionFlowRegistry = {
  "create-product": { default: createProductCreateFlow },
  "update-product": { default: createProductUpdateFlow },
  "create-order": { default: createOrderCreateFlow },
  "create-subscriber": { default: createSubscriberCreateFlow },
  "unsubscribe": { default: createSubscriberUnsubscribeFlow },
  "create-campaign": { default: createCampaignCreateFlow },
  "schedule-campaign": { default: createCampaignScheduleFlow },
  "send-campaign-batch": { default: createCampaignSendBatchFlow },
};

export function resolveFlowBuilder(actionId: string, businessType?: BusinessType): FlowBuilder | undefined {
  const entry = ACTION_FLOW_REGISTRY[actionId];
  if (!entry) return undefined;
  if (businessType && entry.variants?.[businessType]) {
    return entry.variants[businessType]!;
  }
  return entry.default;
}

export function resolveActionBranchId(actionId: string, businessType?: BusinessType): string {
  const entry = ACTION_FLOW_REGISTRY[actionId];
  if (!entry) return actionId;
  if (businessType && entry.variants?.[businessType]) {
    return `${actionId}:${businessType}`;
  }
  return actionId;
}

export function getRegisteredActionIds(): readonly string[] {
  return Object.freeze(Object.keys(ACTION_FLOW_REGISTRY));
}

export function getActionFlowEntry(actionId: string): ActionFlowEntry | undefined {
  if (!Object.hasOwn(ACTION_FLOW_REGISTRY, actionId)) return undefined;
  return ACTION_FLOW_REGISTRY[actionId];
}

// ---------------------------------------------------------------------------
// ActionDispatch
// ---------------------------------------------------------------------------

export type ActionBranch = {
  readonly resolver: () => FlowChart;
  readonly mountOptions?: {
    readonly inputMapper?: (parentScope: unknown) => unknown;
    readonly outputMapper?: (subflowOutput: unknown, parentScope: unknown) => Record<string, unknown>;
  };
};

export type ActionDispatch = {
  readonly actionId: string;
  readonly deciderFn: (scope: any) => string | Promise<string>;
  readonly branches: ReadonlyMap<string, ActionBranch>;
  readonly input: Record<string, unknown>;
  readonly meta: {
    readonly resolvedBusinessType: BusinessType;
    readonly availableVariants: readonly string[];
    readonly selectedBranch: string;
    readonly description: string;
  };
};

export function buildActionDispatch(
  actionId: string,
  businessType: BusinessType,
  repo: BusinessRepository,
): ActionDispatch | undefined {
  const entry = getActionFlowEntry(actionId);
  if (!entry) return undefined;

  const termResolver = createTermResolver(businessType);
  const branches = new Map<string, ActionBranch>();

  const extractInput = (parentScope: unknown) => {
    const s = parentScope as any;
    const requestInput = typeof s?.getValue === "function"
      ? s.getValue("requestInput") ?? s.getValue("input")
      : s?.requestInput ?? s?.input;
    return { input: requestInput };
  };

  branches.set(actionId, {
    resolver: () => entry.default(repo, termResolver),
    mountOptions: { inputMapper: extractInput },
  });

  if (entry.variants) {
    for (const [type, builder] of Object.entries(entry.variants)) {
      if (!builder) continue;
      const variantId = `${actionId}:${type}`;
      const variantTermResolver = createTermResolver(type as BusinessType);
      branches.set(variantId, {
        resolver: () => builder(repo, variantTermResolver),
        mountOptions: { inputMapper: extractInput },
      });
    }
  }

  const selectedBranch = resolveActionBranchId(actionId, businessType);

  return {
    actionId,
    deciderFn: async (scope: Record<string, unknown>) => {
      const scopeBusinessType = scope?.businessType as string | undefined;
      if (scopeBusinessType) {
        const variantKey = `${actionId}:${scopeBusinessType}`;
        if (branches.has(variantKey)) return variantKey;
      }
      return actionId;
    },
    branches,
    input: { businessType },
    meta: {
      resolvedBusinessType: businessType,
      availableVariants: Object.freeze([...branches.keys()]),
      selectedBranch,
      description: `Select ${actionId} variant for ${businessType} business type`,
    },
  };
}

// ---------------------------------------------------------------------------
// Service Registry
// ---------------------------------------------------------------------------

const FLOW_BUILDERS: Record<string, FlowBuilder> = Object.fromEntries(
  Object.entries(ACTION_FLOW_REGISTRY).map(([id, entry]) => [id, entry.default]),
);

export function createBusinessServiceRegistry(repo: BusinessRepository): BusinessServiceRegistry {
  const genericFlows = new Map<string, FlowChart>();
  for (const [actionId, builder] of Object.entries(FLOW_BUILDERS)) {
    genericFlows.set(actionId, builder(repo));
  }

  const typedFlowCache = new Map<string, FlowChart>();

  function getTypedFlow(actionId: string, businessType: BusinessType): FlowChart | undefined {
    const key = `${actionId}:${businessType}`;
    if (typedFlowCache.has(key)) return typedFlowCache.get(key)!;
    const builder = FLOW_BUILDERS[actionId];
    if (!builder) return undefined;
    const t = createTermResolver(businessType);
    const flow = builder(repo, t);
    typedFlowCache.set(key, flow);
    return flow;
  }

  function describeFlow(flow: FlowChart, actionId: string): ServiceDescription {
    return {
      actionId,
      description: flow.description ?? actionId,
      stages: Array.from(flow.stageDescriptions?.entries() ?? []).map(([id, desc]) => ({
        name: id,
        id,
        description: desc,
      })),
    };
  }

  return {
    getFlow(actionId) {
      return genericFlows.get(actionId);
    },

    getTypedFlow,

    serviceIds() {
      return Object.freeze(Array.from(genericFlows.keys()));
    },

    describeService(actionId, businessType) {
      const flow = businessType ? getTypedFlow(actionId, businessType) : genericFlows.get(actionId);
      if (!flow) return undefined;
      return describeFlow(flow, actionId);
    },

    describeAllServices(businessType) {
      return Array.from(genericFlows.keys()).flatMap((actionId) => {
        const flow = businessType ? getTypedFlow(actionId, businessType) : genericFlows.get(actionId);
        if (!flow) return [];
        return [describeFlow(flow, actionId)];
      });
    },

    buildServiceFlow(actionId, context) {
      const builder = FLOW_BUILDERS[actionId];
      if (!builder) return undefined;

      const t = context.businessType ? createTermResolver(context.businessType) : undefined;
      const flow = builder(repo, t);

      const rawStageDescs = (flow as any).stageDescriptions as Map<string, string> | undefined;
      const stageDescriptions: Record<string, string> = {};
      if (rawStageDescs) {
        for (const [id, desc] of rawStageDescs.entries()) {
          stageDescriptions[id] = desc;
        }
      }

      return {
        flow,
        flowMeta: {
          flowId: actionId,
          description: (flow as any).description as string | undefined,
          stageDescriptions,
          buildTimeStructure: (flow as any).buildTimeStructure ?? null,
        },
      };
    },

    async executeService(actionId, input, context) {
      const flow = context.businessType
        ? getTypedFlow(actionId, context.businessType) ?? genericFlows.get(actionId)
        : genericFlows.get(actionId);

      if (!flow) {
        return {
          status: "error",
          error: `No service flow registered for action: ${actionId}`,
          manifest: [],
          narrative: [],
        };
      }

      const flowDescription = (flow as any).description as string | undefined;
      const rawStageDescs = (flow as any).stageDescriptions as Map<string, string> | undefined;
      const stageDescriptions: Record<string, string> = {};
      if (rawStageDescs) {
        for (const [id, desc] of rawStageDescs.entries()) {
          stageDescriptions[id] = desc;
        }
      }

      const manifest = new ManifestFlowRecorder();
      const initialState = { input: { ...input, businessType: context.businessType, unitId: context.unitId } };
      const executor = new FlowChartExecutor(flow, { initialContext: initialState });
      executor.enableNarrative();
      executor.attachFlowRecorder(manifest);

      const buildTimeStructure = (flow as any).buildTimeStructure ?? null;
      const flowMeta = { flowId: actionId, description: flowDescription, stageDescriptions, buildTimeStructure };

      try {
        await executor.run();
        const snapshot = executor.getSnapshot();

        return {
          status: "success",
          result: snapshot.sharedState as Record<string, unknown>,
          manifest: manifest.getManifest(),
          narrative: executor.getNarrative(),
          flowMeta: { ...flowMeta, snapshot: snapshot.sharedState as Record<string, unknown> },
        };
      } catch (err) {
        return {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          manifest: manifest.getManifest(),
          narrative: executor.getNarrative(),
          flowMeta,
        };
      }
    },
  };
}
