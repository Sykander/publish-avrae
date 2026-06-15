const assert = require('node:assert/strict');
const test = require('node:test');

const { freshRequire, makeTempDir, srcPath, writeFiles } = require('./helpers');

test('deploy updates changed aliases, subaliases, snippets, docs, and gvars', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, {
    'alias.alias': 'using(env="old-env")\nalias body',
    'child.alias': 'child body',
    'snippet.snippet': 'snippet body',
    'gvar.gvar': 'using(env="old-env")\ngvar body',
  });

  const calls = [];
  const hydrateCalls = [];
  const loaded = freshRequire(srcPath('deploy.js'), {
    [srcPath('workshop-assets.js')]: {
      async hydrateWorkshopAssets(sourceMap, options) {
        hydrateCalls.push(options);
        return sourceMap;
      },
    },
    [srcPath('avrae/get-alias.js')]: {
      async getAlias(id) {
        calls.push(['getAlias', id]);
        if (id === 'alias-id') {
          return [
            { content: 'older', version: 2 },
            { content: 'old current', version: 4, is_current: true },
          ];
        }

        return [{ content: 'old child', version: 1 }];
      },
    },
    [srcPath('avrae/get-snippet.js')]: {
      async getSnippet(id) {
        calls.push(['getSnippet', id]);
        return [];
      },
    },
    [srcPath('avrae/get-gvar.js')]: {
      async getGvar(id) {
        calls.push(['getGvar', id]);
        return { id, value: 'old gvar' };
      },
    },
    [srcPath('avrae/update-alias.js')]: {
      async updateAlias(id, payload) {
        calls.push(['updateAlias', id, payload]);
      },
    },
    [srcPath('avrae/update-snippet.js')]: {
      async updateSnippet(id, payload) {
        calls.push(['updateSnippet', id, payload]);
      },
    },
    [srcPath('avrae/update-docs.js')]: {
      async updateDocs(type, id, payload) {
        calls.push(['updateDocs', type, id, payload]);
      },
    },
    [srcPath('avrae/update-gvar.js')]: {
      async updateGvar(id, payload) {
        calls.push(['updateGvar', id, payload]);
      },
    },
  });

  try {
    const results = await loaded.module.deploy(
      {
        workshop: { id: 'workshop-id', environment: 'new-env' },
        aliases: [
          {
            name: 'alias',
            id: 'alias-id',
            file: 'alias.alias',
            docs: 'new alias docs',
            _workshopAsset: { docs: 'old alias docs' },
            sub_aliases: [
              {
                name: 'child',
                id: 'child-id',
                file: 'child.alias',
                docs: 'child docs',
                _workshopAsset: { docs: '' },
              },
            ],
          },
        ],
        snippets: [
          {
            name: 'snippet',
            id: 'snippet-id',
            file: 'snippet.snippet',
            docs: 'snippet docs',
            _workshopAsset: { docs: '' },
          },
        ],
        gvars: [{ name: 'data', id: 'gvar-id', file: 'gvar.gvar' }],
      },
      { baseDir, createAssets: true },
    );

    assert.deepEqual(results, [
      { status: 'done', message: 'code v5, docs updated' },
      { status: 'done', message: 'code v2, docs updated' },
      { status: 'done', message: 'code v1, docs updated' },
      { status: 'done', message: 'updated' },
    ]);
    assert.deepEqual(hydrateCalls, [{ baseDir, createMissing: true }]);
  } finally {
    loaded.restore();
  }

  assert.deepEqual(calls, [
    ['getAlias', 'alias-id'],
    ['getAlias', 'child-id'],
    ['getSnippet', 'snippet-id'],
    ['getGvar', 'gvar-id'],
    [
      'updateAlias',
      'alias-id',
      {
        content: 'using(env="new-env")\nalias body',
        is_current: true,
        version: 5,
      },
    ],
    [
      'updateAlias',
      'child-id',
      {
        content: 'child body',
        is_current: true,
        version: 2,
      },
    ],
    [
      'updateSnippet',
      'snippet-id',
      {
        content: 'snippet body',
        is_current: true,
        version: 1,
      },
    ],
    [
      'updateGvar',
      'gvar-id',
      {
        id: 'gvar-id',
        value: 'using(env="new-env")\ngvar body',
      },
    ],
    [
      'updateDocs',
      'alias',
      'alias-id',
      { name: 'alias', docs: 'new alias docs' },
    ],
    ['updateDocs', 'alias', 'child-id', { name: 'child', docs: 'child docs' }],
    [
      'updateDocs',
      'snippet',
      'snippet-id',
      { name: 'snippet', docs: 'snippet docs' },
    ],
  ]);
});

test('deploy skips unchanged gvars without workshop assets', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'gvar.gvar': 'same' });
  const calls = [];
  const loaded = freshRequire(srcPath('deploy.js'), {
    [srcPath('workshop-assets.js')]: {
      async hydrateWorkshopAssets(sourceMap, options) {
        calls.push(['hydrate', options]);
        return sourceMap;
      },
    },
    [srcPath('avrae/get-gvar.js')]: {
      async getGvar(id) {
        calls.push(['getGvar', id]);
        return { value: 'same' };
      },
    },
    [srcPath('avrae/update-gvar.js')]: {
      async updateGvar(id) {
        calls.push(['updateGvar', id]);
      },
    },
  });

  try {
    const results = await loaded.module.deploy(
      {
        gvars: [{ name: 'data', id: 'gvar-id', file: 'gvar.gvar' }],
      },
      { baseDir },
    );

    assert.deepEqual(results, [{ status: 'skipped', message: 'unchanged' }]);
  } finally {
    loaded.restore();
  }

  assert.deepEqual(calls, [
    ['hydrate', { baseDir, createMissing: false }],
    ['getGvar', 'gvar-id'],
  ]);
});

test('deploy skips unchanged workshop assets', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'alias.alias': 'same alias' });
  const loaded = freshRequire(srcPath('deploy.js'), {
    [srcPath('workshop-assets.js')]: {
      async hydrateWorkshopAssets(sourceMap) {
        return sourceMap;
      },
    },
    [srcPath('avrae/get-alias.js')]: {
      async getAlias() {
        return [{ content: 'same alias', version: 1, is_current: true }];
      },
    },
    [srcPath('avrae/update-alias.js')]: {
      async updateAlias() {
        throw new Error('should not update alias code');
      },
    },
    [srcPath('avrae/update-docs.js')]: {
      async updateDocs() {
        throw new Error('should not update docs');
      },
    },
  });

  try {
    const results = await loaded.module.deploy(
      {
        workshop: { id: 'workshop-id' },
        aliases: [
          {
            name: 'alias',
            id: 'alias-id',
            file: 'alias.alias',
            docs: 'same docs',
            _workshopAsset: { docs: 'same docs' },
          },
        ],
      },
      { baseDir },
    );

    assert.deepEqual(results, [{ status: 'skipped', message: 'unchanged' }]);
  } finally {
    loaded.restore();
  }
});

test('deploy uses fallback versions and can clear docs', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'alias.alias': 'new alias' });
  const calls = [];
  const loaded = freshRequire(srcPath('deploy.js'), {
    [srcPath('workshop-assets.js')]: {
      async hydrateWorkshopAssets(sourceMap) {
        return sourceMap;
      },
    },
    [srcPath('avrae/get-alias.js')]: {
      async getAlias() {
        return [{ content: 'old alias', is_current: true }];
      },
    },
    [srcPath('avrae/update-alias.js')]: {
      async updateAlias(id, payload) {
        calls.push(['updateAlias', id, payload]);
      },
    },
    [srcPath('avrae/update-docs.js')]: {
      async updateDocs(type, id, payload) {
        calls.push(['updateDocs', type, id, payload]);
      },
    },
  });

  try {
    const results = await loaded.module.deploy(
      {
        workshop: { id: 'workshop-id' },
        aliases: [
          {
            name: 'alias',
            id: 'alias-id',
            file: 'alias.alias',
            docs: '',
            _workshopAsset: { docs: 'old docs' },
          },
        ],
      },
      { baseDir },
    );

    assert.deepEqual(results, [
      { status: 'done', message: 'code v1, docs updated' },
    ]);
  } finally {
    loaded.restore();
  }

  assert.deepEqual(calls, [
    [
      'updateAlias',
      'alias-id',
      {
        content: 'new alias',
        is_current: true,
        version: 1,
      },
    ],
    ['updateDocs', 'alias', 'alias-id', { name: 'alias', docs: '' }],
  ]);
});

test('deploy fails gvar tasks that do not have ids', async () => {
  const baseDir = makeTempDir();
  writeFiles(baseDir, { 'gvar.gvar': 'value' });
  const loaded = freshRequire(srcPath('deploy.js'), {
    [srcPath('workshop-assets.js')]: {
      async hydrateWorkshopAssets(sourceMap) {
        return sourceMap;
      },
    },
  });

  try {
    await assert.rejects(
      loaded.module.deploy(
        { gvars: [{ name: 'data', file: 'gvar.gvar' }] },
        { baseDir },
      ),
      (error) => {
        assert.equal(error.message, '1 task failed.');
        assert.match(error.failures[0].message, /Gvar data has no id/);
        return true;
      },
    );
  } finally {
    loaded.restore();
  }
});
