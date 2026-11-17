### Fixes

- A daemon restart beside a slow or wedged session host no longer stalls startup while it checks idle hosted sessions for background work. Checks run eight at a time with a 20-second limit on the checks together; a session still unanswered at the limit is kept, with no prompt. The limit covers only these checks, not listing, attaching or closing sessions.

## Maintenance review

Review correction to the startup background work check. The pass keeps the listing order in its plan and logs one line with how many sessions it closed, adopted for background work, adopted at the deadline and adopted otherwise. A comment in the session host client records that the cut-turn detection depends on pending calls and channel detach settling in one synchronous pass. The startup test adds a hung check under an injected deadline and asserts the plan finishes well inside the single-check bound. Docs unchanged: they describe the kept sessions, not the bound. Not installed. README overview and onboarding are unchanged.
