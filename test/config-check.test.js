const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { checkSourceMap, compareSourceMaps } = require('../src/config-check');
const { parseArgs } = require('../src/cli');
const { setEnvironmentId } = require('../src/set-environment-id');

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-avrae-'));

  for (const file of [
    'alias.alias',
    'alias.md',
    'sub.alias',
    'sub.md',
    'nested.alias',
    'nested.md',
    'snippet.snippet',
    'gvar.gvar',
    'env.dev.gvar',
    'env.prod.gvar',
  ]) {
    fs.writeFileSync(path.join(dir, file), `${file}\n`);
  }

  return dir;
}

function validSourceMap() {
  return {
    workshop: {
      id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      environment: '11111111-1111-4111-8111-111111111111',
    },
    aliases: [
      {
        name: 'alias',
        file: 'alias.alias',
        docs_file: 'alias.md',
        sub_aliases: [
          {
            name: 'sub',
            file: 'sub.alias',
            docs_file: 'sub.md',
            sub_aliases: [
              {
                name: 'nested',
                file: 'nested.alias',
                docs_file: 'nested.md',
              },
            ],
          },
        ],
      },
    ],
    snippets: [{ name: 'snippet', file: 'snippet.snippet' }],
    gvars: [
      {
        name: 'env',
        file: 'env.dev.gvar',
        id: '11111111-1111-4111-8111-111111111111',
      },
      {
        name: 'data',
        file: 'gvar.gvar',
        id: '22222222-2222-4222-8222-222222222222',
      },
    ],
  };
}

test('checkSourceMap passes a complete sourcemap', () => {
  const baseDir = makeTempProject();
  const result = checkSourceMap(validSourceMap(), { baseDir });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('checkSourceMap reports missing files and invalid ids', () => {
  const baseDir = makeTempProject();
  const sourceMap = validSourceMap();
  sourceMap.workshop.id = 'bad';
  sourceMap.gvars[1].file = 'missing.gvar';

  const result = checkSourceMap(sourceMap, { baseDir });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /workshop\.id/);
  assert.match(result.errors.join('\n'), /missing\.gvar/);
});

test('checkSourceMap validates nested subalias files', () => {
  const baseDir = makeTempProject();
  const sourceMap = validSourceMap();
  sourceMap.aliases[0].sub_aliases[0].sub_aliases[0].file = 'missing.alias';

  const result = checkSourceMap(sourceMap, { baseDir });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing\.alias/);
});

test('compareSourceMaps permits env file differences but rejects shared ids', () => {
  const baseDir = makeTempProject();
  const dev = validSourceMap();
  const prod = validSourceMap();
  prod.workshop.id = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  prod.workshop.environment = '33333333-3333-4333-8333-333333333333';
  prod.gvars[0].file = 'env.prod.gvar';
  prod.gvars[0].id = '33333333-3333-4333-8333-333333333333';

  const result = compareSourceMaps(dev, prod, {
    sourceBaseDir: baseDir,
    targetBaseDir: baseDir,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /Gvar "data" uses the same id/);
  assert.doesNotMatch(
    result.errors.join('\n'),
    /Gvar "env" has different files/,
  );
});

test('setEnvironmentId accepts single-quoted env ids', () => {
  const result = setEnvironmentId(
    "using(env='11111111-1111-4111-8111-111111111111')",
    '22222222-2222-4222-8222-222222222222',
  );

  assert.equal(result, "using(env='22222222-2222-4222-8222-222222222222')");
});

test('parseArgs supports the single-dash create-assets flag', () => {
  const parsed = parseArgs([
    'deploy',
    '-s',
    'utils/sourcemap.dev.json',
    '-create-assets',
  ]);

  assert.equal(parsed.command, 'deploy');
  assert.equal(parsed.options.s, 'utils/sourcemap.dev.json');
  assert.equal(parsed.options.createAssets, true);
});
