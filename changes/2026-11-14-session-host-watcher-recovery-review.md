### Fixes

- A background watcher no longer dies silently when the daemon restarts beside a running session host. Startup used to close every idle hosted session, ending any background shell, monitor or subagent meant to wake the thread; a session whose provider reports such work is now kept, with no prompt.
- A thread that started a watcher in its last turn, or whose prompt was in flight, is no longer treated as idle when the session host ends before the daemon could check it.

## Maintenance review

Review corrections to the lazy reattach change. The cached background work answer resets to unknown when a turn starts and when a check fails, so a thread that ran a turn continues unless the host answered since. A turn, steer or permission call cut off by the host's end counts as an interrupted turn. Startup planning asks the host's gated `canStopRuntime` before closing an idle session and adopts one that cannot stop; hosts without the capability close as before. Durable provider sessions entry and the hosted-session recovery section updated. Focused restart tests extend the loss and startup cases. Not installed. README overview and onboarding are unchanged.
