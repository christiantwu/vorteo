import { stat } from "node:fs/promises";
import path from "node:path";

/**
 * Bounds overlap between query starts sharing a configuration-directory key in this process.
 * Initialization is not proof of refresh completion; later and cross-process refreshes remain
 * outside this slot. The provider age check is separate from the bounded host shutdown wait.
 */

/** Longest a start holds its account's slot before the next start may go ahead regardless. */
export const CLAUDE_START_SLOT_MAX_MS = 15_000;
/** Age veto for idle release; host shutdown has its own shorter, bounded wait. */
export const CLAUDE_PROVIDER_SETTLE_MS = 60_000;

const startTails = new Map<string, Promise<void>>();

export interface ClaudeStartSlot {
  /** Holds the slot until SDK initialization settles or the maximum hold expires. */
  releaseWhen(settled: Promise<unknown>): void;
  /** Frees the slot now, for a start that never spawned a CLI. Safe to call more than once. */
  release(): void;
}

/**
 * Waits for SDK initialization of the previous query start with the exact same key in this
 * process. Different keys do not wait. Every slot frees itself after maxHoldMs.
 */
export async function acquireClaudeStartSlot(
  account: string,
  maxHoldMs: number = CLAUDE_START_SLOT_MAX_MS,
): Promise<ClaudeStartSlot> {
  const previous = startTails.get(account) ?? Promise.resolve();
  let free!: () => void;
  const freed = new Promise<void>((resolve) => {
    free = resolve;
  });
  const tail = previous.then(() => freed);
  startTails.set(account, tail);
  void tail.finally(() => {
    if (startTails.get(account) === tail) startTails.delete(account);
  });
  await previous;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    free();
  };
  const timer = setTimeout(release, maxHoldMs);
  timer.unref?.();
  return {
    releaseWhen(settled) {
      void settled.catch(() => undefined).finally(release);
    },
    release,
  };
}

/** True while a CLI started at startedAt is younger than settleMs and may still be refreshing. */
export function claudeProviderSettling(
  startedAt: number | null,
  now: number = Date.now(),
  settleMs: number = CLAUDE_PROVIDER_SETTLE_MS,
): boolean {
  return startedAt !== null && now - startedAt < settleMs;
}

/** Lock Claude Code holds in an account's configuration directory while it renews the sign-in. */
export const CLAUDE_RENEWAL_LOCK_FILE = ".oauth_refresh.lock";
/**
 * A renewal lock not touched for this long is treated as abandoned. Claude Code 2.1.321 holds the
 * lock as a directory and touches it every five seconds while it lives, so a live holder never
 * looks this old; a lock left by a dead process stays until Claude Code takes it over.
 */
export const CLAUDE_RENEWAL_LOCK_FRESH_MS = 12_000;
/**
 * Longest a stop waits for a renewal. Observed renewals hold the lock for 0.6 to 6 seconds. The
 * wait plus a graceful stop has to fit the daemon's five second agent close limit, and with the
 * session host's ten second settle wait and four second kill, its twenty second shutdown deadline.
 */
export const CLAUDE_RENEWAL_STOP_WAIT_MS = 3_000;

/**
 * True while some Claude Code process of this account holds a live renewal lock. The lock is
 * taken before the one-use renewal token is sent and released after the new sign-in is saved;
 * stopping the holder in between loses the sign-in. The lock is per account, so every process
 * of the account answers the same.
 */
export async function claudeRenewalInProgress(
  configDir: string,
  now: number = Date.now(),
  freshMs: number = CLAUDE_RENEWAL_LOCK_FRESH_MS,
): Promise<boolean> {
  if (!configDir) return false;
  try {
    return now - (await stat(path.join(configDir, CLAUDE_RENEWAL_LOCK_FILE))).mtimeMs < freshMs;
  } catch {
    return false;
  }
}

/**
 * Waits, within maxMs, for the account's renewal to finish before a Claude Code process is
 * stopped. Resolves false when the wait ran out with the lock still held.
 */
export async function waitForClaudeRenewal(
  configDir: string,
  options: { maxMs?: number; pollMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + (options.maxMs ?? CLAUDE_RENEWAL_STOP_WAIT_MS);
  while (await claudeRenewalInProgress(configDir)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 100));
  }
  return true;
}

/** Legacy opt-in filename. Debug output remains unavailable even when this file requests it. */
export const CLAUDE_DEBUG_LOGS_SETTINGS_FILE = "claude-debug-logs.json";

/**
 * Returning a pathname cannot establish private custody when the SDK opens it later. Debug
 * output stays unavailable until that boundary and credential exclusion are established.
 */
export async function claudeDebugLogFile(_input: {
  configDir: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}): Promise<string | null> {
  return null;
}
