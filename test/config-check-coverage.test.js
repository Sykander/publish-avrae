const assert = require('node:assert/strict');
const test = require('node:test');

const {
  checkSourceMap,
  compareSourceMaps,
  labelForPath,
} = require('../src/config-check');
const { makeTempDir, writeFiles } = require('./helpers');

const UUID_ONE = '11111111-1111-4111-8111-111111111111';
const UUID_TWO = '22222222-2222-4222-8222-222222222222';
const UUID_THREE = '33333333-3333-4333-8333-333333333333';
const UUID_FOUR = '44444444-4444-4444-8444-444444444444';

test('checkSourceMap reports structural, duplicate, and id errors', () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, {
    'alias.alias': 'alias',
    'child.alias': 'child',
    'snippet.snippet': 'snippet',
    'gvar.gvar': 'gvar',
  });

  const result = checkSourceMap(
    {
      workshop: { environment: 'not-a-uuid' },
      aliases: [
        {
          file: 'alias.alias',
          docs: 'inline docs',
          docs_file: 'missing.md',
          documentation_file: 'old-docs.md',
          sub_aliases: [
            { name: 'child', file: 'missing-child.alias', help: 'inline help' },
            { name: 'child', file: 'child.alias' },
            { file: 'child.alias' },
          ],
        },
        { name: 'dup', file: 'missing.alias' },
        { name: 'dup', file: 'alias.alias' },
      ],
      snippets: [
        { name: 'missing-file' },
        { file: 'snippet.snippet', help_file: 'old-help.md' },
        { name: 'snippet', file: 'snippet.snippet' },
        { name: 'snippet', file: 'snippet.snippet' },
      ],
      gvars: [
        { file: 'missing.gvar' },
        { name: 'bad-id', file: 'gvar.gvar', id: 'bad' },
        { name: 'dup-gvar', file: 'gvar.gvar', id: UUID_TWO },
        { name: 'dup-gvar', file: 'gvar.gvar', id: UUID_TWO },
        { name: 'missing-id', file: 'gvar.gvar' },
      ],
    },
    { baseDir },
  );

  const errors = result.errors.join('\n');

  assert.equal(result.ok, false);
  assert.match(errors, /workshop\.environment must be a gvar UUID/);
  assert.match(errors, /workshop\.id is required/);
  assert.match(errors, /no gvar named "env"/);
  assert.match(errors, /Alias "unknown" is missing name/);
  assert.match(errors, /Alias "unknown" uses unsupported docs/);
  assert.match(errors, /Alias "unknown" uses unsupported documentation_file/);
  assert.match(errors, /Alias "unknown" references missing file missing\.md/);
  assert.match(errors, /Alias "dup" duplicates name "dup"/);
  assert.match(errors, /Subalias under "unknown" "child" duplicates name/);
  assert.match(errors, /Subalias "unknown child" uses unsupported help/);
  assert.match(errors, /Subalias "unknown unknown" is missing name/);
  assert.match(errors, /missing-child\.alias/);
  assert.match(errors, /Snippet "unknown" is missing name/);
  assert.match(errors, /Snippet "unknown" uses unsupported help_file/);
  assert.match(errors, /Snippet "missing-file" is missing file/);
  assert.match(errors, /Snippet "snippet" duplicates name "snippet"/);
  assert.match(errors, /Gvar "unknown" is missing name/);
  assert.match(errors, /Gvar "unknown" references missing file missing\.gvar/);
  assert.match(errors, /Gvar "bad-id" id must be a UUID/);
  assert.match(errors, /Gvar "dup-gvar" duplicates name/);
  assert.match(errors, /Gvar "dup-gvar" duplicates id/);
  assert.match(errors, /Gvar "missing-id" is missing id/);
});

test('checkSourceMap can relax generated asset id requirements', () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, {
    'alias.alias': 'alias',
    'gvar.gvar': 'gvar',
  });

  const result = checkSourceMap(
    {
      aliases: [{ name: 'alias', file: 'alias.alias' }],
      gvars: [{ name: 'gvar', file: 'gvar.gvar' }],
    },
    { baseDir, requireGvarIds: false, requireWorkshopId: false },
  );

  assert.equal(result.ok, true);
});

test('checkSourceMap reports null named entries without crashing', () => {
  const result = checkSourceMap(
    {
      snippets: [null],
    },
    { requireWorkshopId: false },
  );
  const errors = result.errors.join('\n');

  assert.equal(result.ok, false);
  assert.match(errors, /Snippet "unknown" is missing name/);
  assert.match(errors, /Snippet "unknown" is missing file/);
});

test('compareSourceMaps reports entry, subalias, file, docs, and shared id drift', () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, {
    'alias.alias': 'alias',
    'alias-target.alias': 'alias target',
    'alias.md': 'alias docs',
    'alias-target.md': 'alias target docs',
    'child.alias': 'child',
    'child-target.alias': 'child target',
    'child.md': 'child docs',
    'child-target.md': 'child target docs',
    'source-only.alias': 'source only',
    'target-only.alias': 'target only',
    'snippet.snippet': 'snippet',
    'snippet-target.snippet': 'snippet target',
    'snippet.md': 'snippet docs',
    'snippet-target.md': 'snippet target docs',
    'env-dev.gvar': 'env dev',
    'env-prod.gvar': 'env prod',
    'data.gvar': 'data',
    'data-target.gvar': 'data target',
    'source-only.gvar': 'source only',
    'target-only.gvar': 'target only',
  });

  const source = {
    workshop: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', environment: UUID_ONE },
    aliases: [
      {
        name: 'alias',
        file: 'alias.alias',
        docs_file: 'alias.md',
        sub_aliases: [
          { name: 'child', file: 'child.alias', docs_file: 'child.md' },
          { name: 'source-child', file: 'source-only.alias' },
        ],
      },
      { name: 'source-alias', file: 'source-only.alias' },
    ],
    snippets: [
      { name: 'snippet', file: 'snippet.snippet', docs_file: 'snippet.md' },
      { name: 'source-snippet', file: 'snippet.snippet' },
    ],
    gvars: [
      { name: 'env', file: 'env-dev.gvar', id: UUID_ONE },
      { name: 'data', file: 'data.gvar', id: UUID_TWO },
      { name: 'source-gvar', file: 'source-only.gvar', id: UUID_THREE },
    ],
  };
  const target = {
    workshop: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', environment: UUID_ONE },
    aliases: [
      {
        name: 'alias',
        file: 'alias-target.alias',
        docs_file: 'alias-target.md',
        sub_aliases: [
          {
            name: 'child',
            file: 'child-target.alias',
            docs_file: 'child-target.md',
          },
          { name: 'target-child', file: 'target-only.alias' },
        ],
      },
      { name: 'target-alias', file: 'target-only.alias' },
    ],
    snippets: [
      {
        name: 'snippet',
        file: 'snippet-target.snippet',
        docs_file: 'snippet-target.md',
      },
      { name: 'target-snippet', file: 'snippet-target.snippet' },
    ],
    gvars: [
      { name: 'env', file: 'env-prod.gvar', id: UUID_ONE },
      { name: 'data', file: 'data-target.gvar', id: UUID_TWO },
      { name: 'target-gvar', file: 'target-only.gvar', id: UUID_FOUR },
    ],
  };

  const result = compareSourceMaps(source, target, {
    sourceBaseDir: baseDir,
    sourceLabel: 'dev',
    targetBaseDir: baseDir,
    targetLabel: 'prod',
  });
  const errors = result.errors.join('\n');

  assert.equal(result.ok, false);
  assert.match(errors, /dev and prod use the same workshop\.id/);
  assert.match(errors, /dev and prod use the same workshop\.environment/);
  assert.match(errors, /Alias "alias" has different files/);
  assert.match(errors, /Alias "alias" has different docs files/);
  assert.match(errors, /prod is missing Alias "source-alias"/);
  assert.match(errors, /dev is missing Alias "target-alias"/);
  assert.match(errors, /Subalias "alias child" has different files/);
  assert.match(errors, /Subalias "alias child" has different docs files/);
  assert.match(errors, /prod is missing subalias "alias source-child"/);
  assert.match(errors, /dev is missing subalias "alias target-child"/);
  assert.match(errors, /Snippet "snippet" has different files/);
  assert.match(errors, /Snippet "snippet" has different docs files/);
  assert.match(errors, /prod is missing Snippet "source-snippet"/);
  assert.match(errors, /dev is missing Snippet "target-snippet"/);
  assert.doesNotMatch(errors, /Gvar "env" has different files/);
  assert.match(errors, /Gvar "data" has different files/);
  assert.match(errors, /prod is missing Gvar "source-gvar"/);
  assert.match(errors, /dev is missing Gvar "target-gvar"/);
  assert.match(errors, /Gvar "data" uses the same id/);
});

test('compareSourceMaps reports workshop presence mismatches and prefixed validation errors', () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, {
    'env.gvar': 'env',
  });

  const result = compareSourceMaps(
    {
      workshop: {
        id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        environment: UUID_ONE,
      },
      aliases: [{ name: 'broken', file: 'missing.alias' }],
      gvars: [{ name: 'env', file: 'env.gvar', id: UUID_ONE }],
    },
    {},
    {
      sourceBaseDir: baseDir,
      sourceLabel: 'left',
      targetBaseDir: baseDir,
      targetLabel: 'right',
    },
  );
  const errors = result.errors.join('\n');

  assert.match(errors, /left: Alias "broken" references missing file/);
  assert.match(errors, /left and right must either both set workshop\.id/);
  assert.match(
    errors,
    /left and right must either both set workshop\.environment/,
  );
  assert.match(errors, /right is missing Alias "broken"/);
});

test('compareSourceMaps reports target validation errors', () => {
  const baseDir = makeTempDir();

  const result = compareSourceMaps(
    {},
    {
      aliases: [{ name: 'broken', file: 'missing.alias' }],
    },
    {
      sourceBaseDir: baseDir,
      sourceLabel: 'left',
      targetBaseDir: baseDir,
      targetLabel: 'right',
    },
  );

  assert.match(
    result.errors.join('\n'),
    /right: Alias "broken" references missing file/,
  );
});

test('labelForPath removes only the final extension', () => {
  assert.equal(labelForPath('/tmp/sourcemap.dev.json'), 'sourcemap.dev');
});
