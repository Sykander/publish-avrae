# Unreleased

## Summary

Nothing yet.

## Changes

- Nothing yet.

# 1.1.4

## Summary

This patch release collects npm publish polish after 1.1.3 and records the
package version bump for release.

## Changes

- Added explicit npm publish ignore list
- Normalized repository URL for npm publish
- Refreshed package lock version
- Bumped package version to 1.1.4

# 1.1.3

## Summary

This release makes sourcemap docs docfile-only, ensures docfile-only changes
deploy even when code is unchanged, and adds a CLI command for generating env
gvar files from sourcemaps.

## Changes

- Added generate-env CLI command
- Generated env gvar files from sourcemap ids
- Added env file environment and version output
- Deployed docfile changes without code changes
- Removed inline sourcemap docs support
- Rejected legacy sourcemap docs fields

# 1.1.2

## Summary

This patch fixes real-project deploys where Avrae returns plain text after a
gvar update, improves deploy output in CI by avoiding repeated progress blocks,
and locks the test suite to 100% line, branch, and function coverage.

## Changes

- Accepted text Avrae responses
- Fixed gvar deploy JSON parsing
- Added CI-friendly deploy output
- Preserved live TTY progress
- Enforced 100% coverage thresholds
- Expanded coverage edge-case tests
- Refreshed package lock version
- Bumped package version to 1.1.2

# 1.1.1

## Summary

This release collects release-process polish and deploy UX fixes. Sourcemap paths
are documented and tested, CI is consolidated around trusted npm publishing,
successful publishes can create bare version tags, and the deploy reporter
rewrites a bounded live terminal block instead of printing repeated progress
snapshots.

## Changes

- Fixed sourcemap working-directory resolution
- Consolidated CI publish workflow
- Documented trusted npm publishing
- Added repository package metadata
- Added automatic version tagging
- Bounded live terminal progress
- Rewrote progress output in place
- Added changelog release tracking
- Bumped package version to 1.1.1

# 1.1.0

## Summary

This release turns the project into a fuller CLI package. It adds command
routing, sourcemap utilities, config validation, asset creation, workshop asset
hydration, Avrae HTTP wrappers, progress reporting, GitHub publishing workflows,
and a broad automated test suite.

## Changes

- Added CLI command dispatcher
- Added sourcemap path resolution
- Added config validation commands
- Added compare-config command
- Added create-assets workflow
- Added workshop asset hydration
- Added Avrae HTTP client
- Added terminal progress reporter
- Added comprehensive node tests
- Added GitHub publishing workflows

# 1.0.3

## Summary

This patch corrects environment replacement by removing the global regex flag and
refreshing the lockfile. The deploy path keeps environment rewrites precise while
recording the version bump in both package files.

## Changes

- Removed global regex replacement
- Tightened environment rewrite behavior
- Refreshed package lock version
- Bumped package version to 1.0.3

# 1.0.2

## Summary

This patch improves environment handling by replacing every matching environment
declaration and logging when deploy rewrites an environment id. It also bumps the
package to publish those behavior fixes.

## Changes

- Replaced all environment declarations
- Logged environment id replacements
- Updated deployment environment handling
- Bumped package version to 1.0.2

# 1.0.1

## Summary

This patch cleans up the package after the first release by ignoring generated
dependencies, expanding README examples, supporting recursive subaliases,
validating alias arrays, and fixing version payload handling during deploys.

## Changes

- Ignored generated dependency directory
- Expanded README usage examples
- Added array validation checks
- Added recursive subalias deployment
- Refactored deploy flow formatting
- Fixed Avrae version payloads
- Bumped package version to 1.0.1

# 1.0.0

## Summary

The initial release provides the core publish-avrae package, including
sourcemap-driven Avrae API wrappers for aliases, snippets, gvars, and deployment.
It establishes the README, example sourcemap, package metadata, and first deploy
implementation.

## Changes

- Added initial package metadata
- Added Avrae request helpers
- Added sourcemap example file
- Added deploy orchestration module
- Added environment id replacement
- Added README usage documentation
