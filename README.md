# Publish Avrae

Publish Avrae is nodejs package for publishing your avrae project automatically.

## Installation

```sh
npm install --save publish-avrae
```

## Usage

Use the CLI directly, or call it from package scripts:

```sh
publish-avrae deploy --sourcemap sourcemap.json
```

The recommended setup is to add a `deploy` script that runs the `publish-avrae deploy` binary command. For projects with multiple environments, add a config test script that checks each sourcemap and compares them before deploy:

```jsonc
{
  "scripts": {
    "deploy": "publish-avrae deploy --sourcemap sourcemap.prod.json",
    "test:config": "publish-avrae check-config --sourcemap sourcemap.dev.json && publish-avrae check-config --sourcemap sourcemap.prod.json && publish-avrae compare-config sourcemap.dev.json sourcemap.prod.json",
  },
}
```

You can call these with `npm run deploy` and `npm run test:config`. If your project does not already have a test script, you can name the config script `test`.

### CLI Commands

```sh
publish-avrae deploy --sourcemap sourcemap.json
publish-avrae deploy -s sourcemap.json --create-assets
publish-avrae create-assets --sourcemap sourcemap.json
publish-avrae generate-env --sourcemap sourcemap.json --output src/gvars/env.gvar [--version 1.2.3] [--environment Development]
publish-avrae check-config --sourcemap sourcemap.json
publish-avrae compare-config sourcemap.dev.json sourcemap.prod.json
publish-avrae create-workshop --name "My Workshop" --sourcemap sourcemap.json
```

`deploy` updates code, gvars, and any configured help docs. By default it fails if a mapped alias, subalias, or snippet does not already exist in the workshop.

Deploy progress rewrites a bounded live block when run in an interactive terminal. Task lines include elapsed timings, supported terminals get color, and completed runs end with a compact final report. In non-interactive output such as GitHub Actions logs, deploy prints a single final task snapshot instead of repeated progress blocks. Pass `--no-progress` if you prefer one simple line per completed task plus the final report.

`deploy --create-assets` may create missing aliases, subaliases, and snippets before deploying. It will not create gvars, because a fresh gvar id would not be recorded anywhere during deploy.

`create-assets` creates missing workshop aliases, subaliases, snippets, and missing gvars. When it creates gvars, it writes the new ids back into the sourcemap file. If a sourcemap has `workshop.name` but no `workshop.id`, or you pass `--create-workshop --name "..."`, it can create the workshop and record that id too.

`generate-env` writes an env gvar file from a sourcemap's gvar ids. It sets `environment`, sets `version`, and writes a `gvars` lookup for every gvar in the sourcemap. Missing environment or version values are written as `None`.

`check-config` validates one sourcemap before deploy. `compare-config` validates that two sourcemaps describe the same code in separate environments.

### Avrae Token

Firstly, you'll need to set the environment variable `AVRAE_TOKEN`

You can get an `AVRAE_TOKEN` by:

Go to [Avrae](https://avrae.io/) and log in to the dashboard
Open the Developer Tools
Go to the `Application` tab
On the left, select `https://avrae.io` under `Local Storage`
Copy the `Value` next to the `avrae-token` key

### Sourcemap

You'll first need to write a sourcemap for your project. This is a json file which will be used to map the files within your project to the aliases, snippets and gvars you wish to publish.

Paths in `file` and `docs_file` are resolved relative to the directory where you run `publish-avrae`, not relative to the sourcemap file. For example, a sourcemap at `utils/sourcemap.dev.json` can still reference `src/gvars/my_gvar.gvar` when the command is run from the project root.

If you only want to publish gvars then the workshop property is optional, otherwise you must specify a workshop to publish the changes to.

```json
{
  "workshop": {
    "id": "aaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "aliases": [
    {
      "name": "my_alias",
      "file": "my_alias.alias",
      "docs_file": "my_alias.md"
    },
    {
      "name": "my_other_alias",
      "file": "my_other_alias.alias",
      "sub_aliases": [
        {
          "name": "do_thing",
          "file": "my_other_alias/do_thing.alias",
          "docs_file": "my_other_alias/do_thing.md"
        }
      ]
    }
  ],
  "snippets": [
    {
      "name": "my_snippet",
      "file": "my_snippet.snippet",
      "docs_file": "my_snippet.md"
    }
  ],
  "gvars": [
    {
      "name": "my_gvar",
      "file": "src/gvars/my_gvar.gvar",
      "id": "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA"
    }
  ]
}
```

#### Help Documentation

Aliases, subaliases, and snippets can include Markdown help text with `docs_file`.
That file is deployed to the Avrae help/docs field, which is what users see from commands such as `!help my_alias`.

Inline docs are not supported in the sourcemap. Put help text in a Markdown file and reference it with `docs_file`.

#### Workshop ID

This should be the id from the url when you visit the workshop on the avrae dashboard.

Eg. `https://avrae.io/dashboard/workshop/5f6a4623f4c89c324d6a5cd3` has the workshop id `5f6a4623f4c89c324d6a5cd3`

#### Workshop Environment

You may optionally want to publish your changes to multiple workshops, for example if you have a testing environment and a production environment.

In this case you will want to configure the `workshop.environment` option in your sourcemap, which can be used to replace a gvar within your project called `env`.

`workshop.environment` should be a gvar id for a file which lists the gvar ids to use in that environment.

You can generate that env file from a sourcemap:

```sh
publish-avrae generate-env --sourcemap sourcemap.dev.json --output src/gvars/env.gvar --version 1.2.3 --environment Development
```

A typical `env` gvar might look something like.

```
environment = "Development"
version = "1.2.3"

gvars = {
    "env": "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB",
    "my_gvar": "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA"
}
```

And then you would use that gvar within your project like so:

```
using(env="BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB")
using(
    my_gvar = env.gvars["my_gvar"]
)

my_gvar.do_a_thing()
```

## Github Actions Integration

You can use the following github workflow by adding it to your project

```yaml
name: Deploy

on:
  push:
    branches: ['main']

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [24.x]

    steps:
      - uses: actions/checkout@v6
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - name: Deploy
        run: npm run deploy
        env:
          AVRAE_TOKEN: ${{ secrets.AVRAE_TOKEN }}
```
