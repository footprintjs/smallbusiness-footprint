/** Static developer data. No request values, executors or provider closures belong here. */
export type DeveloperSourceSelector = { readonly file: string; readonly symbol?: string; readonly unitId?: string; readonly stageId?: string; readonly role?: string };
export type DeveloperSourceUnit = {
  readonly id: string; readonly kind: 'function' | 'binding' | 'callback' | 'expression' | 'state-access';
  readonly symbol: string; readonly owner?: string; readonly role?: string; readonly stageId?: string;
  readonly field?: string; readonly access?: 'read' | 'write';
  /** Offsets are JavaScript UTF-16 string offsets, not UTF-8 byte offsets. End is exclusive. */
  readonly start: number; readonly end: number; readonly byteStart: number; readonly byteEnd: number; readonly startLine: number; readonly endLine: number;
  readonly textSha256: string;
};
export type DeveloperSourceFile = {
  readonly sha256: string; readonly characters: number; readonly lines: number;
  readonly packagePath: string; readonly parseStatus: 'parsed' | 'unsupported';
  readonly units: readonly DeveloperSourceUnit[];
};
export type DeveloperSourceManifest = {
  readonly schemaVersion: 1; readonly scope: 'source-only-static-syntax';
  readonly package: { readonly name: string; readonly version: string };
  readonly parser: { readonly name: string; readonly version: string };
  /** Content identity of the actual source tree, not a Git-parent or release-authenticity claim. */
  readonly sourceTreeSha256: string; readonly files: Readonly<Record<string, DeveloperSourceFile>>;
};
export type DeveloperFieldContract = {
  readonly path: string; readonly owner: 'library' | 'host' | 'unknown';
  readonly access: 'read' | 'write' | 'input'; readonly source?: DeveloperSourceSelector;
};
export type DeveloperFlowRegistration = {
  readonly description?: string; readonly source?: DeveloperSourceSelector;
  readonly stages?: readonly { readonly id: string; readonly source?: DeveloperSourceSelector }[];
  readonly fields?: readonly DeveloperFieldContract[];
  /** A declared boundary, never inferred implementation or authoritative execution evidence. */
  readonly operation?: { readonly owner: string; readonly contract?: string };
};
export type DeveloperFlowRegistrations = { readonly default?: DeveloperFlowRegistration; readonly variants?: Readonly<Record<string, DeveloperFlowRegistration>> };
/** Compatible with ActionFlowRegistry, without importing runtime composition code. */
export type DeveloperConfiguredFlowRegistry = Readonly<Record<string, {
  readonly default: unknown; readonly variants?: Readonly<Record<string, unknown>>;
  readonly developer?: DeveloperFlowRegistrations;
}>>;
export type DeveloperSourceReference = {
  readonly status: 'build-manifest' | 'unknown'; readonly selector?: DeveloperSourceSelector;
  readonly file?: string; readonly moduleSha256?: string; readonly sourceTreeSha256?: string;
  readonly unit?: DeveloperSourceUnit; readonly reason?: string;
  readonly freshness: 'not-checked'; readonly authenticity: 'caller-trusted-build';
};
export type DeveloperFlowDescription = {
  readonly actionId: string; readonly selectedBranch: string; readonly availableVariants: readonly string[];
  readonly description: string;
  readonly coverage: { readonly scope: 'library-envelope' | 'custom-declared' | 'unknown'; readonly businessSemantics: 'opaque'; readonly completeApplication: false };
  readonly source: DeveloperSourceReference;
  readonly operation: { readonly owner: string; readonly contract?: string; readonly semantics: 'opaque' };
  readonly stages: readonly { readonly id: string; readonly source: DeveloperSourceReference }[];
  readonly fields: readonly (DeveloperFieldContract & { readonly verification: 'declared'; readonly location: DeveloperSourceReference })[];
  readonly stateAccesses: readonly { readonly field: string; readonly access: 'read' | 'write'; readonly owner: 'library'; readonly verification: 'syntactic-source'; readonly source: DeveloperSourceReference }[];
  readonly unknowns: readonly string[];
};
