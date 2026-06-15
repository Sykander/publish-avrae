const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildEnvFile, generateEnvFile } = require('../src/env-file');
const { makeTempDir } = require('./helpers');

test('buildEnvFile creates an env lookup file from sourcemap gvars', () => {
  const content = buildEnvFile(
    {
      gvars: [
        { name: 'env', id: 'env-id', file: 'env.gvar' },
        { name: 'data', id: 'data-id', file: 'data.gvar' },
        { name: 'quoted "name"', id: 'quoted-id', file: 'quoted.gvar' },
      ],
    },
    {
      environmentName: 'Development',
      version: '1.2.3',
    },
  );

  assert.equal(
    content,
    `environment = "Development"
version = "1.2.3"

gvars = {
    "env": "env-id",
    "data": "data-id",
    "quoted \\"name\\"": "quoted-id"
}
`,
  );
});

test('generateEnvFile writes the env lookup file', () => {
  const baseDir = makeTempDir();
  const result = generateEnvFile(
    {
      gvars: [{ name: 'data', id: 'data-id', file: 'data.gvar' }],
    },
    {
      baseDir,
      environmentName: 'Production',
      outputPath: 'src/gvars/env.gvar',
      version: '2.0.0',
    },
  );

  assert.equal(result.filePath, path.join(baseDir, 'src/gvars/env.gvar'));
  assert.equal(fs.readFileSync(result.filePath, 'utf8'), result.content);
  assert.match(result.content, /environment = "Production"/);
  assert.match(result.content, /version = "2.0.0"/);
  assert.match(result.content, /"data": "data-id"/);
});

test('generateEnvFile can resolve output from the current working directory and use empty metadata', () => {
  const baseDir = makeTempDir();
  const originalCwd = process.cwd();

  try {
    process.chdir(baseDir);

    const result = generateEnvFile(
      {},
      {
        outputPath: 'env.gvar',
      },
    );

    assert.equal(result.filePath, path.join(baseDir, 'env.gvar'));
    assert.match(result.content, /environment = None/);
    assert.match(result.content, /version = None/);
    assert.match(result.content, /gvars = \{\}/);
  } finally {
    process.chdir(originalCwd);
  }
});

test('buildEnvFile requires generation options and usable gvar metadata', () => {
  assert.match(
    buildEnvFile({}, { environmentName: '', version: '' }),
    /environment = None\nversion = None/,
  );
  assert.match(
    buildEnvFile({}, { environmentName: null, version: null }),
    /environment = None\nversion = None/,
  );
  assert.throws(
    () => buildEnvFile({}, { environmentName: 1, version: '1.0.0' }),
    /metadata values must be strings/,
  );
  assert.throws(
    () => buildEnvFile({}, { environmentName: 'Development', version: 1 }),
    /metadata values must be strings/,
  );
  assert.throws(
    () =>
      buildEnvFile(
        { gvars: [null] },
        { environmentName: 'Development', version: '1.0.0' },
      ),
    /must have names/,
  );
  assert.throws(
    () =>
      buildEnvFile(
        {
          gvars: [
            { name: 'data', id: 'one' },
            { name: 'data', id: 'two' },
          ],
        },
        { environmentName: 'Development', version: '1.0.0' },
      ),
    /duplicated/,
  );
  assert.throws(
    () =>
      buildEnvFile(
        { gvars: [{ name: 'data', file: 'data.gvar' }] },
        { environmentName: 'Development', version: '1.0.0' },
      ),
    /Gvar data has no id/,
  );
});

test('generateEnvFile requires an output path', () => {
  assert.throws(() => generateEnvFile({}), /--output/);
  assert.throws(() => generateEnvFile({}, { outputPath: '' }), /--output/);
});
