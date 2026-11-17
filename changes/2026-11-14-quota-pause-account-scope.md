### Fixes

- A usage limit on one account no longer pauses worker-team members on other accounts. The supervisor and workers with quota left keep running; the supervisor cannot start a new worker on the limited account.
- Agents now learn when a message to a paused thread is refused: at send time when the pause is already known, or as an errored notification when a queued message is refused at delivery.
- Daemon start releases quota pauses left on accounts that are not limited.

## Maintenance review

The team quota latch now covers only teammates on the stopped member's provider account, at the stop, at admission through the parent check, when a worker is created or resumed during the latch, and on release. Worker creation under a team supervisor is refused for an account with an unreleased usage-limit hold. Agent message delivery gains an optional enqueue admission check and reports dispatch refusals, except restart holds, to local senders through the existing notification envelope; no protocol change. A startup pass clears latches on accounts without an active hold, releasing records latched by the older team-wide rule. Existing agent manager and delivery tests gain one mixed-account case, one startup release case and one refusal report case; the same-account startup race test now uses one account. Launch presets and the customizations inventory are updated; README overview and onboarding are unchanged.
