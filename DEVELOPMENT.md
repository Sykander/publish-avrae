# Development

This project publishes a Node.js CLI package to npm, and the CLI can publish
assets to Avrae. Avrae deploys use `AVRAE_TOKEN`; npm publishing uses Trusted
Publishing from GitHub Actions.

## CI and publishing

The GitHub Actions CI workflow runs whenever code lands on `main`.

It has three checks before publishing:

1. `npm run lint`
2. `npm test`
3. A package version check that compares `package.json` to the latest published
   version on npm.

`npm test` runs Node's built-in test runner with coverage enabled and enforces
100% line, branch, and function coverage. New behavior should include focused
tests for both success and failure paths before the version is bumped.

If the local version is higher than the latest published version, CI runs
`npm publish`, sends the package to the npm registry, and tags the published
commit with the exact package version, such as `2.7.3`. If the local version is
equal to the published version, the version check succeeds and the publish job is
skipped. If the local version is lower than the published version, the version
check fails and the publish job is skipped.

## GitHub repository secrets

Add repository secrets in GitHub under:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Secrets should never be committed to the repo, pasted into logs, or stored in
plain text docs. Rotate a token immediately if it is exposed.

## AVRAE_TOKEN

`AVRAE_TOKEN` authenticates to Avrae. It is used when running this package's
deploy commands against Avrae workshops, aliases, snippets, docs, and gvars.

This repo's npm publish workflow does not need `AVRAE_TOKEN`. Downstream
projects using `publish-avrae deploy` usually need it in their own deployment
workflow.

To get an `AVRAE_TOKEN`:

1. Go to <https://avrae.io/> and log in.
2. Open your browser Developer Tools.
3. Open the `Application` tab.
4. Under `Local Storage`, select `https://avrae.io`.
5. Copy the value for the `avrae-token` key.
6. Add it to the relevant GitHub repository as a secret named `AVRAE_TOKEN`.

Use it in a GitHub Actions step like this:

```yaml
- name: Deploy
  run: npm run deploy
  env:
    AVRAE_TOKEN: ${{ secrets.AVRAE_TOKEN }}
```

## npm Trusted Publishing

This repo uses npm Trusted Publishing, so GitHub Actions can run `npm publish`
without a long-lived npm token.

Configure the npm package settings for `publish-avrae` like this:

1. Go to <https://www.npmjs.com/package/publish-avrae> and open package
   settings.
2. Under Trusted Publisher, choose GitHub Actions.
3. Set the organization or user to `Sykander`.
4. Set the repository to `publish-avrae`.
5. Set the workflow filename to `ci.yml`, all lowercase.
6. Allow `npm publish`.

The publish job grants GitHub's OIDC token permission with:

```yaml
permissions:
  contents: write
  id-token: write
```

`contents: write` lets the publish job create the version tag after `npm publish`
succeeds.

Do not add `NPM_TOKEN` back to the workflow unless Trusted Publishing is removed
from the npm package settings.

The trusted publisher workflow filename is case-sensitive. If npm shows
`CI.yml`, edit it to `ci.yml` to match `.github/workflows/ci.yml`.

Before merging code to `main`, make sure `package.json` has a version that is
higher than the latest version already published to npm.

## Versioning

Use normal semantic versioning: `MAJOR.MINOR.PATCH`.

Before publishing, bump `package.json` and `package-lock.json` together. The
safest way is:

```sh
npm version patch --no-git-tag-version
npm version minor --no-git-tag-version
npm version major --no-git-tag-version
```

Choose exactly one of those commands.

Update `CHANGELOG.md` in the same change as the version bump. Add the newest
version at the top using a `# VERSION` heading, then include `## Summary` and
`## Changes` sections. The summary should describe the release in human terms;
the changes list should use short, high-level technical bullets of three to ten
words each.

New successful publishes are tagged automatically by GitHub Actions with the
exact package version, such as `2.7.3`.

Patch versions are for small, backwards-compatible changes. This changes only
the rightmost number:

```text
1.1.0 -> 1.1.1
```

Minor versions are for larger backwards-compatible changes, such as new CLI
features. This changes the middle number and resets the rightmost number:

```text
1.1.3 -> 1.2.0
```

Major versions are for breaking changes, such as removing commands, changing
required sourcemap fields, or changing behavior that existing users rely on.
This changes the first number and resets the other numbers:

```text
1.4.7 -> 2.0.0
```

Do not publish the same version twice. npm permanently reserves every published
`name@version`, even if that version is later unpublished.
