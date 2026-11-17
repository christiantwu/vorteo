### Maintenance

- Added a shared installation setup-guide completion helper for fresh browser contexts; #217 / PR #303 owns the packaged fixture wiring after this helper reaches main. This PR does not change the packaged suite.

## Maintenance review

Reviewed the setup-guide storage contract and model. The focused regression proves that the production reader and guide model treat the seeded record as completed, with origin and installation isolation. It does not prove browser init-script ordering, real recovery-page behavior or absence of click interception. Builds' packaged acceptance remains open on the wired PR #303 head. Product behavior, the customizations inventory and README overview and onboarding are unchanged.
