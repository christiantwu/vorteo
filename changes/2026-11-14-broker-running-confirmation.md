### Fixes

- A preview broker consumer deployment for brokers that were already serving requests now completes instead of ending in "Deployment remains unresolved". After restoring the brokers it no longer expects their ledger and request files to stand still, and recovery can confirm such a run from its evidence.

## Maintenance review

Reviewed the broker consumer deployment policy in broker maintenance and the customizations inventory entry. Inside the suppressed window every broker's full inventory is still compared. After restore, a running-admission broker compares only the committed consumer files (bytes and file identity) and its config and installed marker; its ledger, inbox, receipts and origins are working state its own approved consumer rewrites, and they were proven preserved across the window before commit.json was written. Refusing brokers keep the full comparison. Recovery observation confirms a run without its final receipt only when all per-file intents and acknowledgements match commit.json, every suppression and restoration effect is acknowledged for the plan, no abort record exists and those checks pass; it writes nothing. The 9491d417 deployment on this installation has that shape. Plan schema, approval and no-replay behavior are unchanged. The inventory entry stays accurate; README overview and onboarding are unchanged. Source only; not installed.
