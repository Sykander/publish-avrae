const assert = require('node:assert/strict');
const test = require('node:test');

const { get, patch, post, put } = require('../src/avrae/http-client');

function makeResponse({
  ok = true,
  status = 200,
  statusText = 'OK',
  text = '',
}) {
  return {
    ok,
    status,
    statusText,
    async text() {
      return text;
    },
  };
}

test('http-client wraps fetch methods, payloads, empty responses, and errors', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  const responses = [
    makeResponse({ text: '{"created":true}' }),
    makeResponse({ text: '' }),
    makeResponse({ text: '{"updated":true}' }),
    makeResponse({ text: '{"patched":true}' }),
    makeResponse({ text: 'Gvar updated.' }),
    makeResponse({
      ok: false,
      status: 418,
      statusText: 'Teapot',
      text: 'Short and stout',
    }),
  ];

  global.fetch = async (url, options) => {
    calls.push([url, options]);
    return responses.shift();
  };

  try {
    assert.deepEqual(
      await post(
        'https://example.test/items',
        { name: 'item' },
        {
          headers: { Authorization: 'token' },
        },
      ),
      { data: { created: true } },
    );
    assert.deepEqual(await get('https://example.test/items/1', {}), {
      data: undefined,
    });
    assert.deepEqual(
      await put('https://example.test/items/1', { name: 'new' }),
      {
        data: { updated: true },
      },
    );
    assert.deepEqual(
      await patch('https://example.test/items/1', { docs: '' }),
      {
        data: { patched: true },
      },
    );
    assert.deepEqual(
      await post('https://example.test/gvars/1', { value: 'env' }),
      {
        data: 'Gvar updated.',
      },
    );
    await assert.rejects(get('https://example.test/fail', {}), (error) => {
      assert.equal(error.message, 'Request failed with status code 418');
      assert.deepEqual(error.response, {
        data: 'Short and stout',
        status: 418,
        statusText: 'Teapot',
      });
      return true;
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.deepEqual(calls, [
    [
      'https://example.test/items',
      {
        headers: { Authorization: 'token' },
        method: 'POST',
        body: '{"name":"item"}',
      },
    ],
    ['https://example.test/items/1', { method: 'GET' }],
    ['https://example.test/items/1', { method: 'PUT', body: '{"name":"new"}' }],
    ['https://example.test/items/1', { method: 'PATCH', body: '{"docs":""}' }],
    [
      'https://example.test/gvars/1',
      { method: 'POST', body: '{"value":"env"}' },
    ],
    ['https://example.test/fail', { method: 'GET' }],
  ]);
});
