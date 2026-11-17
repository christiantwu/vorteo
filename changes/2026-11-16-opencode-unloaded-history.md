### Fixes

- Opening an unloaded OpenCode thread shows its history again. Since 26.11.1600, timeline reads served saved history without resuming the thread, and OpenCode has no way to read saved history passively, so these threads showed an error instead, which after a daemon restart meant every OpenCode thread. OpenCode-family threads load through their provider to show history, as before; Claude and Codex threads keep reading saved history without resuming.

## Maintenance review

Account switching within a thread now records the OpenCode exception to history reads that never resume a thread: OpenCode-family threads with a native session on an available provider load through their provider, and every other provider keeps the saved-history path. A focused session test covers the case. README overview and onboarding are unchanged.
