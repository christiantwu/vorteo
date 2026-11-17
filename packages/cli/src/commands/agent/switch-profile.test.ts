import { expect, test, vi } from "vitest";
import { Command } from "commander";
import { AgentSnapshotPayloadSchema } from "@getpaseo/protocol/messages";
import { addSwitchProfileOptions, switchProfiles } from "./switch-profile.js";

function makeAgent(id: string, workspaceId?: string, provider = "source") {
  return AgentSnapshotPayloadSchema.parse({
    id,
    workspaceId,
    provider,
    title: id,
    status: "idle",
    archivedAt: null,
    cwd: "/work",
    createdAt: "2026-11-17T00:00:00Z",
    updatedAt: "2026-11-17T00:00:00Z",
    labels: {},
    model: null,
    lastUserMessageAt: null,
    currentModeId: "bypassPermissions",
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
  });
}

test("switch CLI preserves batch refusals, source preconditions and dry-run intent", async () => {
  const candidates = [
    makeAgent("eligible", "selected"),
    makeAgent("busy", "selected"),
    makeAgent("other-workspace", "other"),
    makeAgent("other-account", "selected", "other"),
    makeAgent("unassigned"),
  ];
  let mutations = 0;
  const switchAgentProfile = vi.fn(async (id: string, target: { dryRun?: boolean }) => {
    if (!target.dryRun) mutations++;
    return {
      agentId: id,
      outcome: id === "busy" ? ("refused" as const) : ("would-switch" as const),
      modeId: "bypassPermissions",
      ...(id === "busy" ? { error: "Current turn is running" } : {}),
    };
  });
  const client = {
    fetchAgents: vi.fn(async () => ({
      entries: candidates.map((agent) => ({ agent })),
      pageInfo: { nextCursor: null },
    })),
    fetchWorkspaces: vi.fn(async () => ({
      entries: [{ id: "selected", projectId: "project" }],
      pageInfo: { nextCursor: null },
    })),
    switchAgentProfile,
    close: vi.fn(async () => {}),
  };
  const command = addSwitchProfileOptions(new Command()).exitOverride();
  command.parse(
    [
      "--project",
      "project",
      "--source",
      "source",
      "--provider",
      "target",
      "--reason",
      "Continue work",
      "--dry-run",
    ],
    { from: "user" },
  );
  const result = await switchProfiles(undefined, command.opts(), async () => client);
  expect(result.data).toEqual([
    { agentId: "eligible", outcome: "would-switch", modeId: "bypassPermissions" },
    {
      agentId: "busy",
      outcome: "refused",
      modeId: "bypassPermissions",
      error: "Current turn is running",
    },
  ]);
  expect(switchAgentProfile).toHaveBeenCalledTimes(2);
  expect(switchAgentProfile).toHaveBeenNthCalledWith(
    1,
    "eligible",
    expect.objectContaining({
      dryRun: true,
      explanation: "Continue work",
      sourceScope: {
        provider: "source",
        cwd: "/work",
        workspaceId: "selected",
        projectId: "project",
      },
    }),
  );
  expect(mutations).toBe(0);
  expect(client.close).toHaveBeenCalledOnce();
  const single = addSwitchProfileOptions(new Command()).exitOverride();
  single.parse(["unassigned", "--provider", "target", "--reason", "Continue work", "--dry-run"], {
    from: "user",
  });
  await switchProfiles(single.args[0], single.opts(), async () => client);
  expect(switchAgentProfile).toHaveBeenLastCalledWith(
    "unassigned",
    expect.objectContaining({
      sourceScope: {
        provider: "source",
        cwd: "/work",
        workspaceId: undefined,
        projectId: undefined,
      },
    }),
  );
  await expect(
    switchProfiles(
      "eligible",
      { ...command.opts(), provider: "target", reason: "Continue work" },
      async () => client,
    ),
  ).rejects.toThrow("not both");
});
