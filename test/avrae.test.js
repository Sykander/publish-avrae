const assert = require('node:assert/strict');
const test = require('node:test');

const { freshRequire, srcPath } = require('./helpers');

async function withToken(callback) {
  const originalToken = process.env.AVRAE_TOKEN;
  process.env.AVRAE_TOKEN = 'test-token';

  try {
    return await callback();
  } finally {
    if (originalToken === undefined) {
      delete process.env.AVRAE_TOKEN;
    } else {
      process.env.AVRAE_TOKEN = originalToken;
    }
  }
}

test('getHeaders requires AVRAE_TOKEN and includes browser-like headers', () => {
  const originalToken = process.env.AVRAE_TOKEN;
  delete process.env.AVRAE_TOKEN;
  const { getHeaders } = require('../src/avrae/headers');

  assert.throws(() => getHeaders(), /AVRAE_TOKEN/);

  process.env.AVRAE_TOKEN = 'secret';
  const headers = getHeaders();

  assert.equal(headers.Authorization, 'secret');
  assert.equal(headers.Accept, 'application/json, text/plain, */*');
  assert.equal(headers['Content-Type'], 'application/json');

  if (originalToken === undefined) {
    delete process.env.AVRAE_TOKEN;
  } else {
    process.env.AVRAE_TOKEN = originalToken;
  }
});

test('response helpers unwrap Avrae response shapes and ids', () => {
  const { responseData, responseId } = require('../src/avrae/response-data');

  assert.deepEqual(responseData({ data: { data: { id: 'nested' } } }), {
    id: 'nested',
  });
  assert.deepEqual(responseData({ data: { id: 'flat' } }), { id: 'flat' });
  assert.deepEqual(responseData({ id: 'raw' }), { id: 'raw' });

  assert.equal(responseId({ data: { data: { id: 'id' } } }), 'id');
  assert.equal(responseId({ data: { _id: 'underscore' } }), 'underscore');
  assert.equal(responseId({ data: { key: 'key' } }), 'key');
  assert.equal(responseId({ data: { uuid: 'uuid' } }), 'uuid');
  assert.equal(responseId({ data: {} }), undefined);
});

test('http client sends JSON requests and throws on HTTP errors', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  const { get, post } = require('../src/avrae/http-client');

  try {
    global.fetch = async (url, options) => {
      calls.push([url, options]);
      return {
        ok: true,
        status: 201,
        statusText: 'Created',
        async text() {
          return '{"data":{"id":"created"}}';
        },
      };
    };

    assert.deepEqual(
      await post(
        'https://api.avrae.io/things',
        { name: 'thing' },
        { headers: { Authorization: 'test-token' } },
      ),
      { data: { data: { id: 'created' } } },
    );
    assert.deepEqual(calls, [
      [
        'https://api.avrae.io/things',
        {
          headers: { Authorization: 'test-token' },
          method: 'POST',
          body: '{"name":"thing"}',
        },
      ],
    ]);

    global.fetch = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      async text() {
        return '{"detail":"nope"}';
      },
    });

    await assert.rejects(get('https://api.avrae.io/nope'), (error) => {
      assert.equal(error.message, 'Request failed with status code 403');
      assert.deepEqual(error.response, {
        data: { detail: 'nope' },
        status: 403,
        statusText: 'Forbidden',
      });
      return true;
    });
  } finally {
    if (originalFetch === undefined) {
      delete global.fetch;
    } else {
      global.fetch = originalFetch;
    }
  }
});

test('create and get Avrae wrappers call the expected endpoints', async () => {
  await withToken(async () => {
    const calls = [];
    const httpClient = {
      async post(url, payload, options) {
        calls.push(['post', url, payload, options.headers.Authorization]);
        return { data: { data: { id: `${payload.name || 'gvar'}-id` } } };
      },
      async get(url, options) {
        calls.push(['get', url, options.headers.Authorization]);
        return { data: { data: [`${url}-result`] } };
      },
    };
    const mocks = { [srcPath('avrae/http-client.js')]: httpClient };
    const modules = [
      freshRequire(srcPath('avrae/create-alias.js'), mocks),
      freshRequire(srcPath('avrae/create-snippet.js'), mocks),
      freshRequire(srcPath('avrae/create-subalias.js'), mocks),
      freshRequire(srcPath('avrae/create-workshop.js'), mocks),
      freshRequire(srcPath('avrae/create-gvar.js'), mocks),
      freshRequire(srcPath('avrae/get-alias.js'), mocks),
      freshRequire(srcPath('avrae/get-snippet.js'), mocks),
      freshRequire(srcPath('avrae/get-workshop.js'), mocks),
      freshRequire(srcPath('avrae/get-gvar.js'), mocks),
    ];

    try {
      assert.deepEqual(
        await modules[0].module.createAlias('collection', { name: 'alias' }),
        { id: 'alias-id' },
      );
      assert.deepEqual(
        await modules[1].module.createSnippet('collection', {
          name: 'snippet',
        }),
        { id: 'snippet-id' },
      );
      assert.deepEqual(
        await modules[2].module.createSubalias('alias-id', { name: 'sub' }),
        { id: 'sub-id' },
      );
      assert.deepEqual(
        await modules[3].module.createWorkshop({ name: 'workshop' }),
        { id: 'workshop-id' },
      );
      assert.deepEqual(await modules[4].module.createGvar('value'), {
        id: 'gvar-id',
      });
      assert.deepEqual(await modules[5].module.getAlias('alias-id'), [
        'https://api.avrae.io/workshop/alias/alias-id/code-result',
      ]);
      assert.deepEqual(await modules[6].module.getSnippet('snippet-id'), [
        'https://api.avrae.io/workshop/snippet/snippet-id/code-result',
      ]);
      assert.deepEqual(await modules[7].module.getWorkshop('collection'), [
        'https://api.avrae.io/workshop/collection/collection/full-result',
      ]);

      assert.deepEqual(await modules[8].module.getGvar('gvar-id'), {
        data: ['https://api.avrae.io/customizations/gvars/gvar-id-result'],
      });
    } finally {
      for (const loaded of modules) {
        loaded.restore();
      }
    }

    assert.deepEqual(calls, [
      [
        'post',
        'https://api.avrae.io/workshop/collection/collection/alias',
        { name: 'alias', docs: '' },
        'test-token',
      ],
      [
        'post',
        'https://api.avrae.io/workshop/collection/collection/snippet',
        { name: 'snippet', docs: '' },
        'test-token',
      ],
      [
        'post',
        'https://api.avrae.io/workshop/alias/alias-id/alias',
        { name: 'sub', docs: '' },
        'test-token',
      ],
      [
        'post',
        'https://api.avrae.io/workshop/collection',
        { name: 'workshop', description: '', image: '' },
        'test-token',
      ],
      [
        'post',
        'https://api.avrae.io/customizations/gvars',
        { value: 'value' },
        'test-token',
      ],
      [
        'get',
        'https://api.avrae.io/workshop/alias/alias-id/code',
        'test-token',
      ],
      [
        'get',
        'https://api.avrae.io/workshop/snippet/snippet-id/code',
        'test-token',
      ],
      [
        'get',
        'https://api.avrae.io/workshop/collection/collection/full',
        'test-token',
      ],
      [
        'get',
        'https://api.avrae.io/customizations/gvars/gvar-id',
        'test-token',
      ],
    ]);
  });
});

test('update Avrae wrappers call code, active version, docs, and gvar endpoints', async () => {
  await withToken(async () => {
    const calls = [];
    const httpClient = {
      async post(url, payload, options) {
        calls.push(['post', url, payload, options.headers.Authorization]);
        return { data: { ok: true } };
      },
      async put(url, payload, options) {
        calls.push(['put', url, payload, options.headers.Authorization]);
        return { data: { ok: true } };
      },
      async patch(url, payload, options) {
        calls.push(['patch', url, payload, options.headers.Authorization]);
        return { data: { data: { patched: true } } };
      },
    };
    const mocks = { [srcPath('avrae/http-client.js')]: httpClient };
    const modules = [
      freshRequire(srcPath('avrae/update-alias.js'), mocks),
      freshRequire(srcPath('avrae/update-snippet.js'), mocks),
      freshRequire(srcPath('avrae/update-docs.js'), mocks),
      freshRequire(srcPath('avrae/update-gvar.js'), mocks),
    ];

    try {
      await modules[0].module.updateAlias('alias-id', {
        is_current: true,
        version: 3,
      });
      await modules[0].module.updateAlias('alias-id', {
        is_current: false,
        version: 4,
      });
      await modules[1].module.updateSnippet('snippet-id', {
        is_current: true,
        version: 5,
      });
      assert.equal(
        await modules[1].module.updateSnippet('snippet-id', {
          is_current: false,
          version: 6,
        }),
        undefined,
      );
      assert.deepEqual(
        await modules[2].module.updateDocs('alias', 'alias-id', {
          name: 'Alias',
          docs: null,
        }),
        { patched: true },
      );
      await modules[2].module.updateDocs('snippet', 'snippet-id', {
        name: 'Snippet',
        docs: 'docs',
      });
      await modules[3].module.updateGvar('gvar-id', { value: 'new' });
    } finally {
      for (const loaded of modules) {
        loaded.restore();
      }
    }

    assert.deepEqual(calls, [
      [
        'post',
        'https://api.avrae.io/workshop/alias/alias-id/code',
        { is_current: true, version: 3 },
        'test-token',
      ],
      [
        'put',
        'https://api.avrae.io/workshop/alias/alias-id/active-code',
        { version: 3 },
        'test-token',
      ],
      [
        'post',
        'https://api.avrae.io/workshop/alias/alias-id/code',
        { is_current: false, version: 4 },
        'test-token',
      ],
      [
        'post',
        'https://api.avrae.io/workshop/snippet/snippet-id/code',
        { is_current: true, version: 5 },
        'test-token',
      ],
      [
        'put',
        'https://api.avrae.io/workshop/snippet/snippet-id/active-code',
        { version: 5 },
        'test-token',
      ],
      [
        'post',
        'https://api.avrae.io/workshop/snippet/snippet-id/code',
        { is_current: false, version: 6 },
        'test-token',
      ],
      [
        'patch',
        'https://api.avrae.io/workshop/alias/alias-id',
        { name: 'Alias', docs: '' },
        'test-token',
      ],
      [
        'patch',
        'https://api.avrae.io/workshop/snippet/snippet-id',
        { name: 'Snippet', docs: 'docs' },
        'test-token',
      ],
      [
        'post',
        'https://api.avrae.io/customizations/gvars/gvar-id',
        { value: 'new' },
        'test-token',
      ],
    ]);
  });
});
