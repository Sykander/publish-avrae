const assert = require('node:assert/strict');
const test = require('node:test');

test('package entrypoint exports the public API', () => {
  const api = require('../src');

  assert.equal(typeof api.buildEnvFile, 'function');
  assert.equal(typeof api.checkSourceMap, 'function');
  assert.equal(typeof api.compareSourceMaps, 'function');
  assert.equal(typeof api.createAlias, 'function');
  assert.equal(typeof api.createAssets, 'function');
  assert.equal(typeof api.createGvar, 'function');
  assert.equal(typeof api.createSnippet, 'function');
  assert.equal(typeof api.createSubalias, 'function');
  assert.equal(typeof api.createWorkshop, 'function');
  assert.equal(typeof api.deploy, 'function');
  assert.equal(typeof api.generateEnvFile, 'function');
  assert.equal(typeof api.getAlias, 'function');
  assert.equal(typeof api.getGvar, 'function');
  assert.equal(typeof api.getHeaders, 'function');
  assert.equal(typeof api.getSnippet, 'function');
  assert.equal(typeof api.getWorkshop, 'function');
  assert.equal(typeof api.responseData, 'function');
  assert.equal(typeof api.responseId, 'function');
  assert.equal(typeof api.updateAlias, 'function');
  assert.equal(typeof api.updateDocs, 'function');
  assert.equal(typeof api.updateGvar, 'function');
  assert.equal(typeof api.updateSnippet, 'function');
});
