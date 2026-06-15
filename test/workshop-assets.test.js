const assert = require('node:assert/strict');
const test = require('node:test');

const { hydrateWorkshopAssets } = require('../src/workshop-assets');
const { freshRequire, makeTempDir, srcPath, writeFiles } = require('./helpers');

test('hydrateWorkshopAssets returns gvar-only sourcemaps without a workshop id', async () => {
  const sourceMap = {
    gvars: [{ name: 'data', file: 'data.gvar' }],
  };

  assert.deepEqual(await hydrateWorkshopAssets(sourceMap), {
    workshop: {},
    aliases: [],
    snippets: [],
    gvars: [{ name: 'data', file: 'data.gvar' }],
  });
});

test('hydrateWorkshopAssets requires a workshop id for aliases and snippets', async () => {
  await assert.rejects(
    hydrateWorkshopAssets({ aliases: [{ name: 'alias' }] }),
    /workshop\.id is required/,
  );
});

test('hydrateWorkshopAssets attaches existing alias, subalias, and snippet ids', async () => {
  const loaded = freshRequire(srcPath('workshop-assets.js'), {
    [srcPath('avrae/get-workshop.js')]: {
      async getWorkshop(id) {
        assert.equal(id, 'workshop-id');
        return {
          aliases: [
            {
              _id: 'alias-id',
              name: 'alias',
              docs: 'alias docs',
              aliases: [{ _id: 'sub-id', name: 'child', docs: 'child docs' }],
            },
          ],
          snippets: [
            { _id: 'snippet-id', name: 'snippet', docs: 'snippet docs' },
          ],
        };
      },
    },
  });

  try {
    const sourceMap = {
      workshop: { id: 'workshop-id' },
      aliases: [
        {
          id: 'configured-id',
          name: 'alias',
          sub_aliases: [{ name: 'child' }],
        },
      ],
      snippets: [{ name: 'snippet' }],
    };
    const result = await loaded.module.hydrateWorkshopAssets(sourceMap);

    assert.equal(result.aliases[0].id, 'alias-id');
    assert.equal(result.aliases[0]._workshopAsset.docs, 'alias docs');
    assert.equal(result.aliases[0].sub_aliases[0].id, 'sub-id');
    assert.equal(result.snippets[0].id, 'snippet-id');
    assert.equal(Object.keys(result.aliases[0]).includes('id'), true);
    assert.equal(
      Object.keys(result.aliases[0].sub_aliases[0]).includes('id'),
      false,
    );
    assert.equal(
      Object.keys(result.snippets[0]).includes('_workshopAsset'),
      false,
    );
  } finally {
    loaded.restore();
  }
});

test('hydrateWorkshopAssets reports missing existing workshop assets', async () => {
  async function assertHydrationRejects(sourceMap, message) {
    const loaded = freshRequire(srcPath('workshop-assets.js'), {
      [srcPath('avrae/get-workshop.js')]: {
        async getWorkshop() {
          return {
            aliases: [{ _id: 'alias-id', name: 'alias', subcommands: [] }],
            snippets: [],
          };
        },
      },
    });

    try {
      await assert.rejects(
        loaded.module.hydrateWorkshopAssets(sourceMap),
        new RegExp(message),
      );
    } finally {
      loaded.restore();
    }
  }

  await assertHydrationRejects(
    {
      workshop: { id: 'workshop-id' },
      aliases: [{ name: 'missing' }],
    },
    'Alias missing does not exist',
  );
  await assertHydrationRejects(
    {
      workshop: { id: 'workshop-id' },
      aliases: [{ name: 'alias', sub_aliases: [{ name: 'child' }] }],
    },
    'Alias alias sub alias child does not exist',
  );
  await assertHydrationRejects(
    {
      workshop: { id: 'workshop-id' },
      snippets: [{ name: 'missing' }],
    },
    'Snippet missing does not exist',
  );
});

test('hydrateWorkshopAssets creates missing aliases, subaliases, and snippets', async () => {
  const baseDir = makeTempDir();
  const calls = [];
  const workshop = { aliases: [], snippets: [] };
  writeFiles(baseDir, {
    'alias.md': 'alias docs',
    'child.md': 'child docs',
  });
  const loaded = freshRequire(srcPath('workshop-assets.js'), {
    [srcPath('avrae/get-workshop.js')]: {
      async getWorkshop() {
        return workshop;
      },
    },
    [srcPath('avrae/create-alias.js')]: {
      async createAlias(collectionId, payload) {
        calls.push(['alias', collectionId, payload]);
        return { id: 'created-alias', subcommands: [] };
      },
    },
    [srcPath('avrae/create-subalias.js')]: {
      async createSubalias(aliasId, payload) {
        calls.push(['subalias', aliasId, payload]);
        return { _id: 'created-subalias' };
      },
    },
    [srcPath('avrae/create-snippet.js')]: {
      async createSnippet(collectionId, payload) {
        calls.push(['snippet', collectionId, payload]);
        return { key: 'created-snippet' };
      },
    },
  });

  try {
    const sourceMap = {
      workshop: { id: 'workshop-id' },
      aliases: [
        {
          name: 'alias',
          docs_file: 'alias.md',
          sub_aliases: [{ name: 'child', docs_file: 'child.md' }],
        },
      ],
      snippets: [{ name: 'snippet' }],
    };
    const result = await loaded.module.hydrateWorkshopAssets(sourceMap, {
      baseDir,
      createMissing: true,
    });

    assert.equal(result.aliases[0].id, 'created-alias');
    assert.equal(result.aliases[0].sub_aliases[0].id, 'created-subalias');
    assert.equal(result.snippets[0].id, 'created-snippet');
    assert.equal(workshop.aliases.length, 1);
    assert.equal(workshop.aliases[0].subcommands.length, 1);
    assert.equal(workshop.snippets.length, 1);
  } finally {
    loaded.restore();
  }

  assert.deepEqual(calls, [
    ['alias', 'workshop-id', { name: 'alias', docs: 'alias docs' }],
    ['subalias', 'created-alias', { name: 'child', docs: 'child docs' }],
    ['snippet', 'workshop-id', { name: 'snippet', docs: '' }],
  ]);
});

test('hydrateWorkshopAssets handles alternate subcommand shapes and empty docs', async () => {
  const calls = [];
  const workshop = {
    aliases: [
      {
        _id: 'parent-id',
        name: 'parent',
        sub_aliases: [{ _id: 'existing-child-id', name: 'existing' }],
      },
      { _id: 'empty-id', name: 'empty' },
    ],
    snippets: [],
  };
  const loaded = freshRequire(srcPath('workshop-assets.js'), {
    [srcPath('avrae/get-workshop.js')]: {
      async getWorkshop() {
        return workshop;
      },
    },
    [srcPath('avrae/create-alias.js')]: {
      async createAlias(collectionId, payload) {
        calls.push(['alias', collectionId, payload]);
        return { id: 'created-parent-id' };
      },
    },
    [srcPath('avrae/create-subalias.js')]: {
      async createSubalias(aliasId, payload) {
        calls.push(['subalias', aliasId, payload]);
        return { id: `${aliasId}-child` };
      },
    },
  });

  try {
    const result = await loaded.module.hydrateWorkshopAssets(
      {
        workshop: { id: 'workshop-id' },
        aliases: [
          { name: 'parent', sub_aliases: [{ name: 'existing' }] },
          { name: 'empty', sub_aliases: [{ name: 'new-child' }] },
          { name: 'created', sub_aliases: [{ name: 'created-child' }] },
        ],
      },
      { createMissing: true },
    );

    assert.equal(result.aliases[0].sub_aliases[0].id, 'existing-child-id');
    assert.equal(result.aliases[1].sub_aliases[0].id, 'empty-id-child');
    assert.equal(
      result.aliases[2].sub_aliases[0].id,
      'created-parent-id-child',
    );
  } finally {
    loaded.restore();
  }

  assert.deepEqual(calls, [
    ['subalias', 'empty-id', { name: 'new-child', docs: '' }],
    ['alias', 'workshop-id', { name: 'created', docs: '' }],
    ['subalias', 'created-parent-id', { name: 'created-child', docs: '' }],
  ]);
});
