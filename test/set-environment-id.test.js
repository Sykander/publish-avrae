const assert = require('node:assert/strict');
const test = require('node:test');

const { setEnvironmentId } = require('../src/set-environment-id');

test('setEnvironmentId leaves content without an env using block unchanged', () => {
  assert.equal(
    setEnvironmentId('no environment here', 'new-id'),
    'no environment here',
  );
});

test('setEnvironmentId replaces every occurrence of the discovered env id', () => {
  const result = setEnvironmentId(
    'using(env="old-id")\nvalue = "old-id"',
    'new-id',
  );

  assert.equal(result, 'using(env="new-id")\nvalue = "new-id"');
});
