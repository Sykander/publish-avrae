const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  collectAliases,
  getAssetDocs,
  getDocsFile,
  getDocsFileProperty,
  loadSourceMap,
  normalizeSourceMap,
  readAssetFile,
  resolveAssetPath,
  resolveSourceMapPath,
  writeSourceMap,
} = require('../src/source-map');
const { makeTempDir, writeFiles } = require('./helpers');

test('normalizes missing and invalid sourcemap arrays', () => {
  assert.deepEqual(normalizeSourceMap(), {
    aliases: [],
    snippets: [],
    gvars: [],
    workshop: {},
  });

  assert.deepEqual(
    normalizeSourceMap({
      aliases: 'bad',
      snippets: null,
      gvars: {},
      workshop: null,
    }),
    {
      aliases: [],
      snippets: [],
      gvars: [],
      workshop: {},
    },
  );
});

test('loads, writes, resolves, and reads sourcemap files', () => {
  const baseDir = makeTempDir();
  const filePath = path.join(baseDir, 'sourcemap.json');
  const sourceMap = {
    aliases: [{ name: 'alias', file: 'alias.alias' }],
    snippets: [],
    gvars: [],
  };

  writeFiles(baseDir, { 'alias.alias': 'alias body' });
  writeSourceMap(filePath, sourceMap);

  assert.equal(fs.readFileSync(filePath, 'utf8').endsWith('\n'), true);
  assert.equal(resolveSourceMapPath(filePath), filePath);

  const originalCwd = process.cwd();

  try {
    process.chdir(baseDir);

    const loaded = loadSourceMap(filePath);
    assert.equal(loaded.filePath, filePath);
    assert.equal(loaded.baseDir, baseDir);
    assert.deepEqual(loaded.sourceMap.workshop, {});
    assert.equal(
      resolveAssetPath(loaded.sourceMap.aliases[0], baseDir),
      path.join(baseDir, 'alias.alias'),
    );
    assert.equal(resolveAssetPath({}, baseDir), null);
    assert.equal(
      readAssetFile(loaded.sourceMap.aliases[0], baseDir),
      'alias body',
    );
  } finally {
    process.chdir(originalCwd);
  }
});

test('loads sourcemap asset paths relative to the command working directory', () => {
  const baseDir = makeTempDir();
  const filePath = path.join(baseDir, 'utils', 'sourcemap.dev.json');
  const sourceMap = {
    gvars: [{ name: 'data', file: 'src/gvars/data.gvar' }],
  };
  const originalCwd = process.cwd();

  writeFiles(baseDir, {
    'src/gvars/data.gvar': 'data',
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeSourceMap(filePath, sourceMap);

  try {
    process.chdir(baseDir);

    const loaded = loadSourceMap('./utils/sourcemap.dev.json');

    assert.equal(loaded.filePath, filePath);
    assert.equal(loaded.baseDir, baseDir);
    assert.equal(
      resolveAssetPath(loaded.sourceMap.gvars[0], loaded.baseDir),
      path.join(baseDir, 'src/gvars/data.gvar'),
    );
    assert.equal(
      readAssetFile(loaded.sourceMap.gvars[0], loaded.baseDir),
      'data',
    );
  } finally {
    process.chdir(originalCwd);
  }
});

test('finds docs from file aliases and inline fields', () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, {
    'docs.md': 'docs file',
    'help.md': 'help file',
    'documentation.md': 'documentation file',
  });

  assert.equal(getDocsFile({ docs_file: 'docs.md' }), 'docs.md');
  assert.equal(getDocsFile({ help_file: 'help.md' }), 'help.md');
  assert.equal(
    getDocsFile({ documentation_file: 'documentation.md' }),
    'documentation.md',
  );
  assert.equal(getDocsFile({}), undefined);

  assert.equal(getDocsFileProperty({ docs_file: 'docs.md' }), 'docs_file');
  assert.equal(getDocsFileProperty({ help_file: 'help.md' }), 'help_file');
  assert.equal(
    getDocsFileProperty({ documentation_file: 'documentation.md' }),
    'documentation_file',
  );
  assert.equal(getDocsFileProperty({}), null);

  assert.equal(getAssetDocs({ docs_file: 'docs.md' }, baseDir), 'docs file');
  assert.equal(getAssetDocs({ help_file: 'help.md' }, baseDir), 'help file');
  assert.equal(getAssetDocs({ docs: '' }, baseDir), '');
  assert.equal(getAssetDocs({ help: 'inline help' }, baseDir), 'inline help');
  assert.equal(getAssetDocs({}, baseDir), undefined);
});

test('collects aliases and nested subaliases with parent references', () => {
  const sourceMap = {
    aliases: [
      {
        name: 'root',
        sub_aliases: [
          {
            name: 'child',
            sub_aliases: [{ name: 'leaf' }],
          },
        ],
      },
    ],
  };

  const aliases = collectAliases(sourceMap);

  assert.equal(aliases.length, 3);
  assert.deepEqual(
    aliases.map(({ name, type }) => ({ name, type })),
    [
      { name: 'root', type: 'alias' },
      { name: 'child', type: 'subalias' },
      { name: 'leaf', type: 'subalias' },
    ],
  );
  assert.equal(aliases[0].parent, null);
  assert.equal(aliases[1].parent.name, 'root');
  assert.equal(aliases[2].parent.name, 'child');
});
