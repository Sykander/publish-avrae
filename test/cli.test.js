const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const {
  captureConsole,
  freshRequire,
  makeTempDir,
  srcPath,
  writeFiles,
} = require('./helpers');

const UUID_ONE = '11111111-1111-4111-8111-111111111111';
const UUID_TWO = '22222222-2222-4222-8222-222222222222';

function writeSourceMap(baseDir, name, sourceMap) {
  const filePath = path.join(baseDir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(sourceMap, null, 2)}\n`);
  return filePath;
}

async function withCwd(dir, callback) {
  const originalCwd = process.cwd();

  try {
    process.chdir(dir);
    return await callback();
  } finally {
    process.chdir(originalCwd);
  }
}

async function runCliEntrypoint(args, mocks = {}) {
  const filename = srcPath('cli.js');
  const cliModule = new Module(filename, module);
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const originalMain = require.main;
  const originalMainModule = process.mainModule;
  const originals = new Map();

  cliModule.filename = filename;
  cliModule.paths = Module._nodeModulePaths(path.dirname(filename));
  process.argv = ['node', filename, ...args];
  process.exitCode = undefined;
  require.main = cliModule;
  process.mainModule = cliModule;

  for (const [request, exports] of Object.entries(mocks)) {
    const resolved = require.resolve(request);
    originals.set(resolved, require.cache[resolved]);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports,
    };
  }

  try {
    const source = fs.readFileSync(filename, 'utf8');
    cliModule._compile(source, filename);
    await new Promise((resolve) => setImmediate(resolve));
    return process.exitCode;
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    require.main = originalMain;
    process.mainModule = originalMainModule;

    for (const [resolved, original] of originals) {
      if (original) {
        require.cache[resolved] = original;
      } else {
        delete require.cache[resolved];
      }
    }
  }
}

test('parseArgs handles positionals, inline values, camelized flags, and booleans', () => {
  const { parseArgs } = require('../src/cli');

  assert.deepEqual(
    parseArgs([
      'compare-config',
      'left.json',
      'right.json',
      '--source-map=inline.json',
      '--no-progress',
    ]),
    {
      command: 'compare-config',
      options: { sourceMap: 'inline.json', noProgress: true },
      positionals: ['left.json', 'right.json'],
    },
  );
});

test('main prints help for help commands and rejects unknown commands', async () => {
  const { main } = require('../src/cli');

  const { lines } = await captureConsole('log', async () => {
    await main(['help']);
    await main(['--help']);
    await main(['-h']);
    await main([]);
  });
  assert.match(lines.join('\n'), /publish-avrae deploy/);

  await assert.rejects(main(['unknown']), /Unknown command "unknown"/);
});

test('main deploy validates config and dispatches to deploy', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'data.gvar': 'data' });
  const sourceMapPath = writeSourceMap(baseDir, 'sourcemap.json', {
    gvars: [{ name: 'data', file: 'data.gvar', id: UUID_ONE }],
  });
  const calls = [];
  const loaded = freshRequire(srcPath('cli.js'), {
    [srcPath('deploy.js')]: {
      async deploy(sourceMap, options) {
        calls.push(['deploy', sourceMap, options]);
      },
    },
  });

  try {
    const { lines } = await withCwd(baseDir, () =>
      captureConsole('log', () =>
        loaded.module.main([
          'deploy',
          '--sourcemap',
          sourceMapPath,
          '--create-assets',
          '--no-progress',
        ]),
      ),
    );

    assert.deepEqual(lines, ['[ok] Config check passed.']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].gvars[0].id, UUID_ONE);
    assert.equal(calls[0][2].baseDir, baseDir);
    assert.equal(calls[0][2].createAssets, true);
    assert.equal(calls[0][2].reporter.enabled, false);
  } finally {
    loaded.restore();
  }
});

test('main deploy resolves sourcemap file entries from the command working directory', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'src/gvars/data.gvar': 'data' });
  writeSourceMap(baseDir, 'utils/sourcemap.dev.json', {
    gvars: [{ name: 'data', file: 'src/gvars/data.gvar', id: UUID_ONE }],
  });
  const calls = [];
  const loaded = freshRequire(srcPath('cli.js'), {
    [srcPath('deploy.js')]: {
      async deploy(sourceMap, options) {
        calls.push(['deploy', sourceMap, options]);
      },
    },
  });

  try {
    const { lines } = await withCwd(baseDir, () =>
      captureConsole('log', () =>
        loaded.module.main([
          'deploy',
          '--sourcemap',
          './utils/sourcemap.dev.json',
          '--no-progress',
        ]),
      ),
    );

    assert.deepEqual(lines, ['[ok] Config check passed.']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].baseDir, baseDir);
  } finally {
    loaded.restore();
  }
});

test('main create-assets validates relaxed config and dispatches options', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'data.gvar': 'data' });
  const sourceMapPath = writeSourceMap(baseDir, 'sourcemap.json', {
    gvars: [{ name: 'data', file: 'data.gvar' }],
  });
  const calls = [];
  const loaded = freshRequire(srcPath('cli.js'), {
    [srcPath('create-assets.js')]: {
      async createAssets(sourceMap, options) {
        calls.push(['createAssets', sourceMap, options]);
      },
    },
  });

  try {
    await withCwd(baseDir, () =>
      captureConsole('log', () =>
        loaded.module.main([
          'create-assets',
          '-s',
          sourceMapPath,
          '--create-workshop',
          '--name',
          'Workshop',
          '--description',
          'Description',
          '--image',
          'Image',
          '--no-progress',
        ]),
      ),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].baseDir, baseDir);
    assert.equal(calls[0][2].createWorkshop, true);
    assert.equal(calls[0][2].filePath, sourceMapPath);
    assert.equal(calls[0][2].workshopName, 'Workshop');
    assert.equal(calls[0][2].workshopDescription, 'Description');
    assert.equal(calls[0][2].workshopImage, 'Image');
    assert.equal(calls[0][2].reporter.enabled, false);
  } finally {
    loaded.restore();
  }
});

test('main generate-env writes an env file from a sourcemap', async () => {
  const baseDir = makeTempDir();
  const sourceMapPath = writeSourceMap(baseDir, 'sourcemap.json', {
    gvars: [
      { name: 'env', file: 'env.gvar', id: UUID_TWO },
      { name: 'data', file: 'data.gvar', id: UUID_ONE },
    ],
  });

  const { lines } = await withCwd(baseDir, () =>
    captureConsole('log', () =>
      require('../src/cli').main([
        'generate-env',
        '--sourcemap',
        sourceMapPath,
        '--output',
        'src/gvars/env.gvar',
        '--version',
        '1.2.3',
        '--environment',
        'Development',
      ]),
    ),
  );
  const outputPath = path.join(baseDir, 'src/gvars/env.gvar');
  const content = fs.readFileSync(outputPath, 'utf8');

  assert.deepEqual(lines, [`[ok] Wrote ${outputPath}.`]);
  assert.match(content, /environment = "Development"/);
  assert.match(content, /version = "1.2.3"/);
  assert.match(content, new RegExp(`"env": "${UUID_TWO}"`));
  assert.match(content, new RegExp(`"data": "${UUID_ONE}"`));
});

test('main check-config uses the default sourcemap name and prints warnings', async () => {
  const baseDir = makeTempDir();
  const originalCwd = process.cwd();
  writeSourceMap(baseDir, 'sourcemap.json', {});
  const loaded = freshRequire(srcPath('cli.js'), {
    [srcPath('config-check.js')]: {
      checkSourceMap(sourceMap, options) {
        assert.deepEqual(sourceMap.workshop, {});
        assert.equal(options.baseDir, baseDir);
        return { ok: true, warnings: ['watch this'], errors: [] };
      },
      compareSourceMaps() {
        return { ok: true, warnings: [], errors: [] };
      },
      labelForPath(filePath) {
        return path.basename(filePath, path.extname(filePath));
      },
    },
  });

  try {
    process.chdir(baseDir);
    const { lines } = await captureConsole('log', () =>
      loaded.module.main(['check-config']),
    );

    assert.match(lines.join('\n'), /Checking/);
    assert.match(lines.join('\n'), /\[warn\] watch this/);
    assert.match(lines.join('\n'), /\[ok\] Config check passed/);
  } finally {
    process.chdir(originalCwd);
    loaded.restore();
  }
});

test('main check-config throws config errors after printing them', async () => {
  const baseDir = makeTempDir();
  const sourceMapPath = writeSourceMap(baseDir, 'bad.json', {
    aliases: [{ name: 'missing', file: 'missing.alias' }],
  });
  const { main } = require('../src/cli');

  const { lines } = await captureConsole('log', async () => {
    await withCwd(baseDir, () =>
      assert.rejects(
        main(['check-config', '--source-map', sourceMapPath]),
        (error) => {
          assert.equal(error.message, 'Config check failed.');
          assert.equal(error.isConfigError, true);
          return true;
        },
      ),
    );
  });

  assert.match(lines.join('\n'), /Checking/);
  assert.match(lines.join('\n'), /\[err\]/);
});

test('main compare-config validates two sourcemaps', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'data.gvar': 'data' });
  const sourcePath = writeSourceMap(baseDir, 'dev.json', {
    gvars: [{ name: 'data', file: 'data.gvar', id: UUID_ONE }],
  });
  const targetPath = writeSourceMap(baseDir, 'prod.json', {
    gvars: [{ name: 'data', file: 'data.gvar', id: UUID_TWO }],
  });
  const { main } = require('../src/cli');

  const { lines } = await withCwd(baseDir, () =>
    captureConsole('log', () =>
      main(['compare-config', sourcePath, targetPath]),
    ),
  );

  assert.match(lines.join('\n'), /Comparing dev\.json and prod\.json/);
  assert.match(lines.join('\n'), /\[ok\] Config check passed/);
  await assert.rejects(
    main(['compare-config']),
    /requires two sourcemap files/,
  );
});

test('main create-workshop creates workshops and can persist the id', async () => {
  const baseDir = makeTempDir();
  const sourceMapPath = writeSourceMap(baseDir, 'sourcemap.json', {});
  const calls = [];
  const loaded = freshRequire(srcPath('cli.js'), {
    [srcPath('avrae/create-workshop.js')]: {
      async createWorkshop(payload) {
        calls.push(payload);
        return { id: 'created-workshop' };
      },
    },
  });

  try {
    const { lines } = await captureConsole('log', () =>
      loaded.module.main([
        'create-workshop',
        '--name',
        'Workshop',
        '--description',
        'Description',
        '--image',
        'Image',
        '--sourcemap',
        sourceMapPath,
      ]),
    );

    assert.deepEqual(calls, [
      { name: 'Workshop', description: 'Description', image: 'Image' },
    ]);
    assert.match(lines.join('\n'), /Created workshop created-workshop/);
    assert.match(lines.join('\n'), /Updated/);
    assert.equal(
      JSON.parse(fs.readFileSync(sourceMapPath, 'utf8')).workshop.id,
      'created-workshop',
    );
  } finally {
    loaded.restore();
  }
});

test('main create-workshop accepts sourcemap option aliases', async () => {
  const baseDir = makeTempDir();
  const sourceMapPath = writeSourceMap(baseDir, 'source-map.json', {});
  const shortPath = writeSourceMap(baseDir, 'short.json', {});
  let count = 0;
  const loaded = freshRequire(srcPath('cli.js'), {
    [srcPath('avrae/create-workshop.js')]: {
      async createWorkshop() {
        count += 1;
        return { id: `workshop-${count}` };
      },
    },
  });

  try {
    await loaded.module.main([
      'create-workshop',
      '--name',
      'Source map',
      '--source-map',
      sourceMapPath,
    ]);
    await loaded.module.main([
      'create-workshop',
      '--name',
      'Short',
      '-s',
      shortPath,
    ]);

    assert.equal(
      JSON.parse(fs.readFileSync(sourceMapPath, 'utf8')).workshop.id,
      'workshop-1',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(shortPath, 'utf8')).workshop.id,
      'workshop-2',
    );
  } finally {
    loaded.restore();
  }
});

test('main create-workshop validates name and returned id', async () => {
  const missingId = freshRequire(srcPath('cli.js'), {
    [srcPath('avrae/create-workshop.js')]: {
      async createWorkshop() {
        return {};
      },
    },
  });

  try {
    await assert.rejects(
      missingId.module.main(['create-workshop']),
      /requires --name/,
    );
    await assert.rejects(
      missingId.module.main(['create-workshop', '--name', 'Workshop']),
      /did not return an id/,
    );
  } finally {
    missingId.restore();
  }
});

test('the CLI entrypoint suppresses config errors', async () => {
  const baseDir = makeTempDir();
  const sourceMapPath = writeSourceMap(baseDir, 'bad.json', {
    aliases: [{ name: 'missing', file: 'missing.alias' }],
  });

  const { lines, result } = await withCwd(baseDir, () =>
    captureConsole('error', () =>
      runCliEntrypoint(['check-config', '--sourcemap', sourceMapPath]),
    ),
  );

  assert.equal(result, 1);
  assert.deepEqual(lines, []);
});

test('the CLI entrypoint reports non-config errors and task failures', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'data.gvar': 'data' });
  const sourceMapPath = writeSourceMap(baseDir, 'sourcemap.json', {
    gvars: [{ name: 'data', file: 'data.gvar', id: UUID_ONE }],
  });

  const { lines, result } = await withCwd(baseDir, () =>
    captureConsole('error', () =>
      runCliEntrypoint(['deploy', '--sourcemap', sourceMapPath], {
        [srcPath('deploy.js')]: {
          async deploy() {
            const error = new Error('Deploy failed');
            error.failures = [new Error('Inner failure')];
            throw error;
          },
        },
      }),
    ),
  );

  assert.equal(result, 1);
  assert.deepEqual(lines, ['[err] Deploy failed', '[err] Inner failure']);
});

test('the CLI entrypoint reports errors without task failures', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'data.gvar': 'data' });
  const sourceMapPath = writeSourceMap(baseDir, 'sourcemap.json', {
    gvars: [{ name: 'data', file: 'data.gvar', id: UUID_ONE }],
  });

  const { lines, result } = await withCwd(baseDir, () =>
    captureConsole('error', () =>
      runCliEntrypoint(['deploy', '--sourcemap', sourceMapPath], {
        [srcPath('deploy.js')]: {
          async deploy() {
            throw new Error('Deploy failed');
          },
        },
      }),
    ),
  );

  assert.equal(result, 1);
  assert.deepEqual(lines, ['[err] Deploy failed']);
});
