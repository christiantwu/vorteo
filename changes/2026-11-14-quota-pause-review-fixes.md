### Fixes

- A supervisor paused at a usage limit now receives finish notifications from workers that completed during the pause once the pause clears, instead of losing them.
- Agents are no longer told a message was not delivered when only the run start was slow after the provider received it.
- Restarting the daemon no longer releases a quota pause while the same account's usage-limit stop is still waiting, including Codex stops without a reset time.

## Maintenance review

Follow-up to the account-scoped quota latch after independent review. Delivery now reports only quota admission refusals (a new `QuotaLatchError` or the existing reserve admission error) raised before the provider handoff; the first version also reported provider steer rejections, which existing MCP tests correctly treat as silent. The startup pass now releases a latch unless a teammate on the same account holds an unreleased hold, replacing the one-hour estimate for stops without a reset time; an opted-out hold whose known reset has passed no longer keeps teammates latched. Finish subscriptions treat a quota-latched caller as active and wait for the latch to clear, keeping the captured outcome and durable intent, instead of deleting the intent. Existing delivery, agent manager and finish subscription tests gain one assertion or case each. Launch presets and the customizations inventory are updated; README overview and onboarding are unchanged.
