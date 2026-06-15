# Development

This project publishes a Node.js CLI package to npm, and the CLI can publish
assets to Avrae. Those two publishing paths use different secrets.

## CI and publishing

The GitHub Actions CI workflow runs whenever code lands on `main`.

It has three required checks before publishing:

1. `npm run lint`
2. `npm test`
3. A package version check that confirms `package.json` is higher than the
   latest published version on npm.

If all three checks pass, CI runs `npm publish` and sends the package to the npm
registry.

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

## NPM_TOKEN

`NPM_TOKEN` authenticates to npm. It is used by this repo's publish workflow to
run `npm publish` from GitHub Actions.

The workflow passes it to npm as `NODE_AUTH_TOKEN`:

```yaml
- name: Publish package
  run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

To get an `NPM_TOKEN`:

1. Go to <https://www.npmjs.com/> and log in with an account that can publish
   `publish-avrae`.
2. Open your profile menu and choose `Access Tokens`.
3. Click `Generate New Token`.
4. Create a granular access token with `Read and write` package access for
   `publish-avrae`, or the package scope that owns it.
5. Set an expiration date.
6. Leave IP restrictions empty unless the workflow runs from known fixed egress
   IP addresses.
7. If npm package or account settings require interactive 2FA for publishing,
   either configure Trusted Publishing instead of token publishing, or create a
   token that can publish from CI without an interactive one-time password.
8. Copy the token immediately.
9. Add it to this GitHub repository as a secret named `NPM_TOKEN`.

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
