### Fixes

- Opening an unloaded thread shows its history again instead of "The original transcript could not be read." Since 26.11.1600, every unloaded thread was read from saved history without loading, and a thread whose provider replays no saved history got that error: a completed plugin-provider thread after its plugin reloads, a thread on another provider without history replay, or a Claude or Codex thread that was never prompted or whose transcript is gone.
- Only Claude and Codex threads keep the memory protection from 26.11.1600: opening them reads saved history without loading the thread. Threads on every other provider with a saved session, including OpenCode, plugin and ACP providers, load through their provider again and stay in memory until archived, as before 26.11.1600. A Claude or Codex thread whose transcript replays nothing also loads, which costs little because it has little or no history.

## Maintenance review

Account switching within a thread narrows history reads that never resume a thread to the Claude and Codex families, subsuming the earlier OpenCode exception, and falls back to loading when a saved read finds no transcript. Account switches still refuse a missing transcript. A focused session case table covers OpenCode, a provider without replay, and Claude threads with and without a transcript; the upstream plugin lifecycle test passes unmodified. README overview and onboarding are unchanged.
