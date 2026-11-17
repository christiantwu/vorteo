import type {
  AgentProfileSwitchRequestMessage,
  AgentProfileSwitchResult,
  MutableDaemonConfig,
} from "@getpaseo/protocol/messages";
import { ProfileSwitchError, type AgentProfileSwitchInput } from "../agent-manager.js";
import type { AgentSessionConfig, AgentRuntimeInfo } from "../agent-sdk-types.js";
import { buildConfigOverrides } from "../../persistence-hooks.js";
import type { ProviderSnapshotManager } from "../provider-snapshot-manager.js";
import {
  resolveProfileSwitchConfig,
  type CreateAgentCommandDependencies,
} from "../create-agent/create.js";
import { formatSwitchInstructions } from "./context.js";
import type { StoredAgentRecord } from "../agent-storage.js";
import type { PersistedWorkspaceRecord } from "../../workspace-registry.js";
import { randomUUID } from "node:crypto";

export interface ProfileSwitchBatchSelection {
  sourceProvider: string;
  workspaceId?: string;
  projectId?: string;
}

interface ProfileSwitchCandidatesInput {
  agents: Pick<StoredAgentRecord, "id" | "provider" | "workspaceId">[];
  workspaces: Pick<PersistedWorkspaceRecord, "workspaceId" | "projectId">[];
  selection: ProfileSwitchBatchSelection;
}

export function selectProfileSwitchCandidates(input: ProfileSwitchCandidatesInput): string[] {
  const { agents, workspaces, selection } = input;
  if (
    !selection.sourceProvider.trim() ||
    Boolean(selection.workspaceId) === Boolean(selection.projectId)
  ) {
    throw new ProfileSwitchError("Select exactly one workspace or project and a source account.");
  }
  const selectedWorkspaces = workspaces.filter((workspace) =>
    selection.workspaceId
      ? workspace.workspaceId === selection.workspaceId
      : workspace.projectId === selection.projectId,
  );
  const workspaceIds = new Set(selectedWorkspaces.map((workspace) => workspace.workspaceId));
  return agents
    .filter(
      (agent) =>
        agent.provider === selection.sourceProvider &&
        agent.workspaceId !== undefined &&
        workspaceIds.has(agent.workspaceId),
    )
    .map((agent) => agent.id);
}

export type ProfileSwitchTarget = Pick<
  AgentProfileSwitchRequestMessage,
  | "agentId"
  | "provider"
  | "profileId"
  | "model"
  | "thinkingOptionId"
  | "reason"
  | "dryRun"
  | "explanation"
>;

function describeAccount(
  settings: MutableDaemonConfig | undefined,
  provider: string,
  model: string | null | undefined,
): string {
  const label = settings?.providers?.[provider]?.label;
  const account = typeof label === "string" && label ? label : provider;
  return model ? `${account} (${model})` : account;
}

type ProfileSwitchDependencies = CreateAgentCommandDependencies & {
  providerSnapshotManager: Pick<
    ProviderSnapshotManager,
    "resolveCreateConfig" | "readSessionHistory"
  >;
};

interface ProfileSwitchOptions {
  /** Instructions retained ahead of the carried context, such as a daemon role charter. */
  standingInstructions?: string;
  actor?: { kind: "agent" | "principal"; id: string; label?: string };
  includeResult?: boolean;
  validateScope?: AgentProfileSwitchInput["validateScope"];
}

export function switchAgentProfileCommand(
  dependencies: ProfileSwitchDependencies,
  target: ProfileSwitchTarget,
  options: ProfileSwitchOptions & { includeResult: true },
): Promise<AgentProfileSwitchResult>;
export function switchAgentProfileCommand(
  dependencies: ProfileSwitchDependencies,
  target: ProfileSwitchTarget,
  options?: ProfileSwitchOptions & { includeResult?: false },
): Promise<void>;
export function switchAgentProfileCommand(
  dependencies: ProfileSwitchDependencies,
  target: ProfileSwitchTarget,
  options: ProfileSwitchOptions,
): Promise<AgentProfileSwitchResult | void>;
export async function switchAgentProfileCommand(
  dependencies: ProfileSwitchDependencies,
  target: ProfileSwitchTarget,
  options?: ProfileSwitchOptions,
): Promise<AgentProfileSwitchResult | void> {
  let refusal: AgentProfileSwitchResult = { agentId: target.agentId, outcome: "refused" };
  try {
    const result = await executeSwitchCommand(dependencies, target, options, (source) => {
      refusal = source;
    });
    return options?.includeResult ? result : undefined;
  } catch (error) {
    if (!options?.includeResult) throw error;
    return { ...refusal, error: error instanceof Error ? error.message : String(error) };
  }
}

async function executeSwitchCommand(
  dependencies: ProfileSwitchDependencies,
  target: ProfileSwitchTarget,
  options: ProfileSwitchOptions | undefined,
  captureSource: (result: AgentProfileSwitchResult) => void,
): Promise<AgentProfileSwitchResult> {
  const { agentManager } = dependencies;
  const { input, record, settings } = await prepareCommand(
    dependencies,
    target,
    options ?? {},
    captureSource,
  );
  const switched = await agentManager.switchAgentProfile(target.agentId, input);
  const result = switchResult(
    target.agentId,
    "switched",
    switched.config,
    switched.lifecycle,
    switched.runtimeInfo,
  );
  if (options?.actor && target.explanation) {
    try {
      await agentManager.appendJournal(target.agentId, {
        entryId: randomUUID(),
        text: `${describeActor(dependencies, options.actor)} switched the account to ${describeAccount(settings, switched.provider, result.model)}. ${target.explanation}`,
        machineContext: JSON.stringify({
          actor: options.actor,
          reason: target.explanation,
          from: record.provider,
          to: switched.provider,
        }),
      });
    } catch (error) {
      result.auditError = error instanceof Error ? error.message : String(error);
    }
  }
  return result;
}

function switchResult(
  agentId: string,
  outcome: AgentProfileSwitchResult["outcome"],
  config: AgentSessionConfig,
  status: string,
  runtime?: AgentRuntimeInfo,
): AgentProfileSwitchResult {
  return {
    agentId,
    outcome,
    provider: config.provider,
    status,
    model: runtime?.model ?? config.model ?? null,
    modeId: runtime?.modeId ?? config.modeId ?? null,
    thinkingOptionId: runtime?.thinkingOptionId ?? config.thinkingOptionId ?? null,
    features: config.featureValues ?? {},
  };
}

async function prepareCommand(
  dependencies: ProfileSwitchDependencies,
  target: ProfileSwitchTarget,
  options: ProfileSwitchOptions,
  captureSource: (result: AgentProfileSwitchResult) => void,
) {
  const { agentManager, agentStorage, providerSnapshotManager } = dependencies;
  await agentManager.waitForAgentClose(target.agentId);
  const record = await agentStorage.get(target.agentId);
  if (!record) throw new Error(`Agent not found: ${target.agentId}`);
  const live = agentManager.getAgent(target.agentId);
  const expectedSource = live
    ? structuredClone({
        config: live.config,
        runtimeInfo: live.runtimeInfo,
        workspaceId: live.workspaceId,
        currentModeId: live.currentModeId,
        features: live.features,
      })
    : undefined;
  const sourceConfig = expectedSource?.config ?? {
    ...buildConfigOverrides(record),
    provider: record.provider,
    cwd: record.cwd,
    title: record.title ?? undefined,
  };
  const sourceResult = structuredClone(
    switchResult(
      target.agentId,
      "refused",
      sourceConfig,
      live ? live.lifecycle : "closed",
      expectedSource?.runtimeInfo,
    ),
  );
  captureSource(sourceResult);
  if (record.archivedAt)
    throw new ProfileSwitchError("Restore this thread before switching accounts.");
  if (record.internal || record.config?.controllerExecutionId)
    throw new ProfileSwitchError("This thread is managed by Vorteo and cannot switch accounts.");
  const preservedSettings = effectiveSwitchSettings(sourceConfig, expectedSource, record);
  captureSource({
    ...sourceResult,
    ...switchResult(
      target.agentId,
      "refused",
      { ...sourceConfig, ...preservedSettings },
      sourceResult.status ?? "closed",
    ),
  });
  if (target.dryRun) {
    return agentManager.previewAgentProfile(target.agentId, {
      expectedSource,
      validateScope: options.validateScope,
      storedSource: live ? undefined : { record },
    });
  }
  const history = (async function* () {
    if (record.persistence) {
      yield* providerSnapshotManager.readSessionHistory(record.persistence, sourceConfig);
    }
  })();
  const storedSource = live
    ? undefined
    : {
        record,
        rows: await agentManager.readStoredSwitchHistory(record, history),
      };
  const settings = dependencies.getSharedProviderConfig?.();
  const config: AgentSessionConfig = {
    provider: target.provider,
    cwd: record.cwd,
    title: sourceConfig.title,
    mcpServers: sourceConfig.mcpServers,
    systemPrompt: options.standingInstructions,
    profileId: target.profileId,
    model: target.model ?? undefined,
  };
  const input = {
    validateScope: options.validateScope,
    expectedSource,
    preservedSettings,
    storedSource,
    config: await resolveProfileSwitchConfig(dependencies, config, preservedSettings),
    reason: target.reason ?? ("manual" as const),
    carriedContextChars: 0,
    carryContext: (context: string) =>
      formatSwitchInstructions({
        from: describeAccount(
          settings,
          record.provider,
          expectedSource?.runtimeInfo?.model ?? sourceConfig.model,
        ),
        to: describeAccount(settings, target.provider, target.model),
        context,
      }),
  };
  return { input, record, settings };
}

function describeActor(
  dependencies: ProfileSwitchDependencies,
  actor: NonNullable<ProfileSwitchOptions["actor"]>,
): string {
  if (actor.kind === "agent") {
    const title = dependencies.agentManager.getAgent(actor.id)?.config.title;
    return title ? `Thread “${title}”` : "The requesting thread";
  }
  return actor.id === "owner"
    ? "The owner"
    : `Service principal “${actor.label ?? "unavailable label"}”`;
}

function effectiveSwitchSettings(
  config: AgentSessionConfig,
  source: AgentProfileSwitchInput["expectedSource"],
  record: StoredAgentRecord,
): NonNullable<AgentProfileSwitchInput["preservedSettings"]> {
  const runtime = source ? source.runtimeInfo : record.runtimeInfo;
  const currentModeId = source ? source.currentModeId : record.lastModeId;
  const features = source ? source.features : record.features;
  const featureValues = { ...config.featureValues };
  for (const feature of features ?? []) featureValues[feature.id] = feature.value;
  for (const [id, value] of Object.entries(featureValues)) {
    if (typeof value !== "boolean" && typeof value !== "string") {
      throw new ProfileSwitchError(
        `Cannot preserve feature '${id}': its effective value is unknown.`,
      );
    }
  }
  return {
    modeId: currentModeId ?? runtime?.modeId ?? config.modeId,
    thinkingOptionId:
      runtime?.thinkingOptionId === null
        ? undefined
        : (runtime?.thinkingOptionId ?? config.thinkingOptionId),
    featureValues,
  };
}
