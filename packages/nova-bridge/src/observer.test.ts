import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  attentionKind,
  hasImportantChange,
  WorkspaceObserver,
  type Cursor,
  type HistoryPage,
  type ObservationSource,
  type ObservedThread,
} from "./observer.js";
import { BridgeStore } from "./store.js";
import { BridgeEvents } from "./events.js";

const baseline = {
  previousTimestamp: "2026-10-07T12:00:00Z",
  attentionTimestamp: "2026-10-07T12:00:00Z",
  attentionReason: "finished" as const,
  previouslyObserved: true,
  createdAt: "2026-10-01T12:00:00Z",
  monitoringStartedAt: "2026-10-07T00:00:00Z",
  gap: false,
};

describe("relevant notifications", () => {
  it("does not report an old completion again when a thread's other fields change", () => {
    expect(hasImportantChange(baseline)).toBe(false);
    expect(
      hasImportantChange({
        ...baseline,
        attentionReason: null,
        attentionTimestamp: "2026-10-07T12:01:00Z",
      }),
    ).toBe(false);
  });

  it("reports fresh completion and permission requests", () => {
    expect(hasImportantChange({ ...baseline, attentionTimestamp: "2026-10-07T12:01:00Z" })).toBe(
      true,
    );
    expect(
      hasImportantChange({
        ...baseline,
        attentionReason: "permission",
        attentionTimestamp: "2026-10-07T12:01:00Z",
      }),
    ).toBe(true);
    expect(attentionKind("permission", false)).toBe("permission");
  });

  it("catches a new task that completed while disconnected without importing old history as new work", () => {
    expect(
      hasImportantChange({
        ...baseline,
        attentionTimestamp: "2026-10-01T12:00:00Z",
        previouslyObserved: false,
        previousTimestamp: null,
      }),
    ).toBe(false);
    expect(
      hasImportantChange({
        ...baseline,
        previouslyObserved: false,
        previousTimestamp: null,
        createdAt: "2026-10-07T11:00:00Z",
      }),
    ).toBe(true);
  });

  it("reports missing history without claiming the task completed", () => {
    expect(hasImportantChange({ ...baseline, gap: true })).toBe(true);
    expect(attentionKind("finished", true)).toBe("gap");
  });
});

const start = "2026-11-14T12:00:00.000Z";
const later = "2026-11-14T12:01:00.000Z";

// A daemon timeline with real tail/after paging semantics over many rows.
class LongTimeline implements ObservationSource {
  epoch = "one";
  rows = 31_000;
  calls: (Cursor | undefined)[] = [];
  agent: ObservedThread = {
    id: "long",
    status: "idle",
    title: "long",
    workspaceId: "workspace",
    createdAt: start,
    updatedAt: later,
    attentionReason: null,
    attentionTimestamp: null,
    pendingPermissions: [],
  };
  async list() {
    return { agents: [this.agent] };
  }
  async watch() {
    return async () => {};
  }
  async history(_id: string, cursor?: Cursor): Promise<HistoryPage> {
    this.calls.push(cursor);
    const stale = cursor !== undefined && cursor.epoch !== this.epoch;
    const from = cursor && !stale ? cursor.seq + 1 : Math.max(1, this.rows - 99);
    const to = Math.min(this.rows, from + 99);
    const entries = [];
    for (let seq = from; seq <= to; seq++)
      entries.push({ seqEnd: seq, timestamp: later, item: { type: "assistant_message" } });
    return {
      entries,
      endCursor: { epoch: this.epoch, seq: to },
      hasNewer: to < this.rows,
      hasOlder: from > 1,
      gap: stale,
      staleCursor: stale,
      reset: stale,
    };
  }
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function observe(source: ObservationSource) {
  const directory = mkdtempSync(join(tmpdir(), "nova-observer-"));
  const store = new BridgeStore(join(directory, "state.sqlite"));
  const now = () => Date.parse(start);
  const events = new BridgeEvents(store, async () => ({ status: 200, body: "" }), now);
  const observer = new WorkspaceObserver("dev", "dev-server", source, store, events, now);
  cleanups.push(async () => {
    await observer.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const gaps = () =>
    store.db
      .prepare("SELECT body FROM events ORDER BY seq")
      .all()
      .map((row) => JSON.parse(String(row.body)))
      .filter((event) => event.data.threadId !== null && event.data.kind === "gap").length;
  return { observer, gaps };
}

describe("bounded history reads", () => {
  it("reads a long thread's tail on first observation and after a reset, never its head", async () => {
    const source = new LongTimeline();
    const { observer, gaps } = observe(source);
    await observer.reconcile();
    expect(source.calls).toEqual([undefined]);
    // Every row read is after monitoring start and older rows exist: unknown, not quiet.
    expect(gaps()).toBe(1);

    source.calls = [];
    source.epoch = "two";
    source.agent = { ...source.agent, updatedAt: "2026-11-14T12:02:00.000Z" };
    await observer.reconcile();
    expect(source.calls).toEqual([{ epoch: "one", seq: 31_000 }]);
    expect(gaps()).toBe(2);
  });

  it("re-anchors at the tail and reports a gap when a thread outruns the forward window", async () => {
    const source = new LongTimeline();
    const { observer, gaps } = observe(source);
    await observer.reconcile();
    source.calls = [];
    source.rows += 2_000;
    source.agent = { ...source.agent, updatedAt: "2026-11-14T12:02:00.000Z" };
    await observer.reconcile();
    expect(source.calls.length).toBeLessThanOrEqual(6);
    expect(source.calls.at(-1)).toBeUndefined();
    expect(gaps()).toBe(2);
  });
});
