### Fixes

- Preserve concurrent lifecycle writes when recording broker consumer preparation failures. Retry validation once against a fresh reservation only while the request remains unchanged.
- Return retained failed requests and report uncertain failure persistence with the request identity and status command. Exact plan approval and native no-replay boundaries remain unchanged.

## Maintenance review

Reviewed broker maintenance and its customization entry for concurrent preparation, locked admission and scoped requester reporting. This covers preparation outcomes only; participant-scope replacement remains separate. The existing HTTP settings fixture now expects the unset time zone returned by its negotiated reader query. README overview and onboarding are unchanged. Source only; Builds must install the coordinator through the tracked workflow before running requests use this repair.
