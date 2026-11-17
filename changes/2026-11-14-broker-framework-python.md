### Fixes

- Preview broker consumer deployment works when its pinned Python is a Homebrew or python.org framework install. Preparation previously always refused with "Consumer preparation refused", because the framework launcher re-executes a different binary that the coordinator's process custody check would not accept. A refused preparation now shows its real reason in installation controls and the installation log.

## Maintenance review

Reviewed the broker consumer deployment policy in broker maintenance and the customizations inventory entry. The executor now runs `<framework>/Versions/<v>/Resources/Python.app/Contents/MacOS/Python` when the pinned Python is `<framework>/Versions/<v>/bin/python<v>`, derived by that fixed pattern from the pinned canonical path with no environment or PATH lookup. It holds custody to it, requires it to be a protected executable and refuses if it is missing or changes during the invocation. The worker admits a live generation whose argv[0] is that image and still refuses any other interpreter. The workflow no longer discards the preparation error. Plan schema, approval, plan binding, recovery evidence and no-replay behavior are unchanged. The inventory entry stays accurate; README overview and onboarding are unchanged. Source only; not installed.
