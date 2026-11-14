### Fixes

- No user-visible change.

## Maintenance review

Test and wording follow-up to the startup background work check bound. The startup test's injected deadline rises from 50 ms to 1 second, so the session it expects closed is not adopted when CI is slow; its elapsed-time assertion stays well under the 10-second single-check bound. Comments and the earlier change fragment now say the deadline bounds only the background work checks, not listing, attaching or closing. Not installed. README overview and onboarding are unchanged.
