const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const { freshRequire, makeTempDir, srcPath, writeFiles } = require('./helpers');

const ENV_ID = '11111111-1111-4111-8111-111111111111';
const DATA_ID = '22222222-2222-4222-8222-222222222222';

function loadCreateAssetsInternals() {
  const filename = srcPath('create-assets.js');
  const moduleWithInternals = new Module(filename, module);

  moduleWithInternals.filename = filename;
  moduleWithInternals.paths = Module._nodeModulePaths(path.dirname(filename));
  moduleWithInternals._compile(
    `${fs.readFileSync(filename, 'utf8')}\nmodule.exports.__test = { buildCreateGvarTask };\n`,
    filename,
  );

  return moduleWithInternals.exports.__test;
}

test('createAssets creates a workshop, creates gvars, and persists ids', async () => {
  const baseDir = makeTempDir();
  const sourceMapPath = path.join(baseDir, 'sourcemap.json');
  writeFiles(baseDir, {
    'env.gvar': 'ENV = "dev"',
    'data.gvar': 'using(env="old-env")\ndata body',
  });

  const calls = [];
  const ids = [ENV_ID, DATA_ID];
  const loaded = freshRequire(srcPath('create-assets.js'), {
    [srcPath('avrae/create-workshop.js')]: {
      async createWorkshop(payload) {
        calls.push(['createWorkshop', payload]);
        return { data: { data: { id: 'workshop-id' } } };
      },
    },
    [srcPath('workshop-assets.js')]: {
      async hydrateWorkshopAssets(sourceMap, options) {
        calls.push(['hydrateWorkshopAssets', sourceMap.workshop.id, options]);
        return sourceMap;
      },
    },
    [srcPath('avrae/create-gvar.js')]: {
      async createGvar(value) {
        calls.push(['createGvar', value]);
        return { uuid: ids.shift() };
      },
    },
  });

  try {
    const result = await loaded.module.createAssets(
      {
        workshop: {
          name: 'Workshop',
          description: 'map description',
          image: 'map image',
        },
        gvars: [
          { name: 'env', file: 'env.gvar' },
          { name: 'data', file: 'data.gvar' },
        ],
      },
      {
        baseDir,
        filePath: sourceMapPath,
        workshopDescription: 'option description',
        workshopImage: 'option image',
      },
    );

    assert.equal(result.workshop.id, 'workshop-id');
    assert.equal(result.workshop.environment, ENV_ID);
    assert.equal(result.gvars[0].id, ENV_ID);
    assert.equal(result.gvars[1].id, DATA_ID);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(sourceMapPath, 'utf8')),
      result,
    );
  } finally {
    loaded.restore();
  }

  assert.deepEqual(calls, [
    [
      'createWorkshop',
      {
        name: 'Workshop',
        description: 'option description',
        image: 'option image',
      },
    ],
    ['hydrateWorkshopAssets', 'workshop-id', { baseDir, createMissing: true }],
    ['createGvar', 'ENV = "dev"'],
    ['createGvar', `using(env="${ENV_ID}")\ndata body`],
  ]);
});

test('createAssets skips workshop creation when an id already exists', async () => {
  const baseDir = makeTempDir();
  const calls = [];
  const loaded = freshRequire(srcPath('create-assets.js'), {
    [srcPath('avrae/create-workshop.js')]: {
      async createWorkshop() {
        calls.push(['createWorkshop']);
      },
    },
    [srcPath('workshop-assets.js')]: {
      async hydrateWorkshopAssets(sourceMap, options) {
        calls.push(['hydrateWorkshopAssets', options]);
        return sourceMap;
      },
    },
  });

  try {
    const result = await loaded.module.createAssets(
      {
        workshop: { id: 'existing-workshop' },
        gvars: [{ name: 'existing', id: DATA_ID, file: 'existing.gvar' }],
      },
      { baseDir },
    );

    assert.equal(result.workshop.id, 'existing-workshop');
  } finally {
    loaded.restore();
  }

  assert.deepEqual(calls, [
    ['hydrateWorkshopAssets', { baseDir, createMissing: true }],
  ]);
});

test('createAssets can create only a gvar without workshop environment rewriting', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'data.gvar': 'plain data' });
  const calls = [];
  const loaded = freshRequire(srcPath('create-assets.js'), {
    [srcPath('workshop-assets.js')]: {
      async hydrateWorkshopAssets(sourceMap) {
        calls.push(['hydrateWorkshopAssets']);
        return sourceMap;
      },
    },
    [srcPath('avrae/create-gvar.js')]: {
      async createGvar(value) {
        calls.push(['createGvar', value]);
        return { id: DATA_ID };
      },
    },
  });

  try {
    const result = await loaded.module.createAssets(
      {
        gvars: [{ name: 'data', file: 'data.gvar' }],
      },
      { baseDir },
    );

    assert.equal(result.gvars[0].id, DATA_ID);
  } finally {
    loaded.restore();
  }

  assert.deepEqual(calls, [
    ['hydrateWorkshopAssets'],
    ['createGvar', 'plain data'],
  ]);
});

test('createAssets requires a workshop name when forced to create one', async () => {
  const loaded = freshRequire(srcPath('create-assets.js'));

  try {
    await assert.rejects(
      loaded.module.createAssets({ workshop: {} }, { createWorkshop: true }),
      /A workshop name is required/,
    );
  } finally {
    loaded.restore();
  }
});

test('createAssets errors when Avrae does not return ids', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'data.gvar': 'plain data' });

  const missingWorkshopId = freshRequire(srcPath('create-assets.js'), {
    [srcPath('avrae/create-workshop.js')]: {
      async createWorkshop() {
        return {};
      },
    },
  });

  try {
    await assert.rejects(
      missingWorkshopId.module.createAssets(
        { workshop: {} },
        { createWorkshop: true, workshopName: 'Workshop' },
      ),
      /created workshop/,
    );
  } finally {
    missingWorkshopId.restore();
  }

  const missingGvarId = freshRequire(srcPath('create-assets.js'), {
    [srcPath('workshop-assets.js')]: {
      async hydrateWorkshopAssets(sourceMap) {
        return sourceMap;
      },
    },
    [srcPath('avrae/create-gvar.js')]: {
      async createGvar() {
        return {};
      },
    },
  });

  try {
    await assert.rejects(
      missingGvarId.module.createAssets(
        { gvars: [{ name: 'data', file: 'data.gvar' }] },
        { baseDir },
      ),
      (error) => {
        assert.equal(error.message, '1 task failed.');
        assert.match(error.failures[0].message, /created gvar/);
        return true;
      },
    );
  } finally {
    missingGvarId.restore();
  }
});

test('create gvar tasks skip assets that already have ids', async () => {
  const { buildCreateGvarTask } = loadCreateAssetsInternals();
  const task = buildCreateGvarTask(
    { name: 'existing', id: DATA_ID, file: 'data.gvar' },
    {},
  );

  assert.deepEqual(await task.run(), {
    status: 'skipped',
    message: 'already has id',
  });
});
