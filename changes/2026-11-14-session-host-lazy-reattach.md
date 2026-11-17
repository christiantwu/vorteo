### Fixes

- A session host restart no longer wakes dormant threads. Before, every loaded hosted thread got a new provider process and a "continue the work in progress" prompt, so idle threads ran turns, could hit an exhausted account's usage limit and held gigabytes of provider processes. Now only a thread with a turn or permission in flight continues; an idle thread whose background shells, monitors or subagents stopped with the host gets one prompt to check them; every other thread stays closed until it is needed.

## Maintenance review

Durable provider sessions entry revised. A hosted session reports what its host's end interrupted: a turn, background work, or nothing. The worker caches the host's background work answer three seconds after each turn ends and on takeover; a session seen running a turn with no cached answer counts as background work. The daemon's loss handler releases idle agents through the existing idle release instead of reopening them, and the background case queues its own continuation text. Startup reconciliation after a daemon restart and `agents.resumeOnStartup` are unchanged. A focused restart test covers all three outcomes and an on-demand reopen. Not installed. README overview and onboarding are unchanged.
