import { runInNewContext } from "node:vm";
import type { BrowserContext } from "@playwright/test";
import { expect, it, vi } from "vitest";
import { createVorteoGuide } from "../../../src/onboarding/vorteo-guide/model";
import { guideStorage, guideStorageKey } from "../../../src/onboarding/vorteo-guide/storage";
import { completeInstallationSetupGuide } from "./installation-setup-guide";

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();
  get length() {
    return this.entries.size;
  }
  clear() {
    this.entries.clear();
  }
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  key(index: number) {
    return [...this.entries.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }
}

it("seeds completion understood by the guide while preserving origin and installation isolation", async () => {
  const scripts: string[] = [];
  const context: Pick<BrowserContext, "addInitScript"> = {
    async addInitScript(script, arg) {
      if (typeof script !== "function") throw new TypeError("Expected an init callback");
      scripts.push(`(${script.toString()})(${JSON.stringify(arg)})`);
    },
  };
  const installationId = "fixture/installation with spaces";
  const origin = "https://installation.example";
  const storage = new MemoryStorage();
  storage.setItem("unrelated", "preserve me");
  const executeDocument = (documentOrigin: string, topLevel = true) => {
    const document = {
      location: { origin: documentOrigin },
      localStorage: storage,
      top: {},
    };
    const sandbox = { window: document };
    // Each execution gets a fresh global scope, as a new document would.
    runInNewContext(`${topLevel ? "window.top = window;" : ""}${scripts.join("\n")}`, sandbox);
  };

  try {
    await expect(
      completeInstallationSetupGuide(context, { installationId: " ", origin }),
    ).rejects.toThrow(TypeError);
    expect(scripts).toHaveLength(0);
    await completeInstallationSetupGuide(context, { installationId, origin: `${origin}/setup` });
    expect(scripts).toHaveLength(1);

    executeDocument("https://other.example");
    executeDocument(origin, false);
    expect(storage.length).toBe(1);
    executeDocument(origin);

    vi.stubGlobal("window", { localStorage: storage });
    const record = await guideStorage.read(installationId);
    expect(record).toEqual({ disposition: "completed", updatedAt: expect.any(String) });
    if (!record) throw new Error("Expected a completed guide record");
    expect(new Date(record.updatedAt).toISOString()).toBe(record.updatedAt);
    const original = storage.getItem(guideStorageKey(installationId));
    executeDocument(origin);
    expect(storage.getItem(guideStorageKey(installationId))).toBe(original);
    expect(storage.getItem("unrelated")).toBe("preserve me");
    expect(storage.length).toBe(2);

    for (const [id, status] of [
      [installationId, "hidden"],
      ["unseeded", "open"],
    ]) {
      const model = createVorteoGuide({
        installationId: id,
        storage: guideStorage,
        savePrimaryConnection: async () => {},
      });
      await model.ready;
      model.applyGate({
        installationId: id,
        serverId: "host",
        ownerAuthenticated: true,
        isConnected: true,
        hasHydratedWorkspaces: true,
        hasUserProjects: false,
        supportsPrimaryConnection: true,
      });
      expect(model.getState().status).toBe(status);
    }
    expect(await guideStorage.read("unseeded")).toBeNull();

    storage.setItem(guideStorageKey(installationId), "");
    executeDocument(origin);
    expect(storage.getItem(guideStorageKey(installationId))).toBe("");
  } finally {
    vi.unstubAllGlobals();
  }
});
