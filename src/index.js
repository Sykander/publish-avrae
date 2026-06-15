const { deploy } = require('./deploy');
const { createAssets } = require('./create-assets');
const { checkSourceMap, compareSourceMaps } = require('./config-check');
const { buildEnvFile, generateEnvFile } = require('./env-file');
const { createAlias } = require('./avrae/create-alias');
const { createGvar } = require('./avrae/create-gvar');
const { createSnippet } = require('./avrae/create-snippet');
const { createSubalias } = require('./avrae/create-subalias');
const { createWorkshop } = require('./avrae/create-workshop');
const { getAlias } = require('./avrae/get-alias');
const { getGvar } = require('./avrae/get-gvar');
const { getHeaders } = require('./avrae/headers');
const { getSnippet } = require('./avrae/get-snippet');
const { getWorkshop } = require('./avrae/get-workshop');
const { responseData, responseId } = require('./avrae/response-data');
const { updateAlias } = require('./avrae/update-alias');
const { updateDocs } = require('./avrae/update-docs');
const { updateGvar } = require('./avrae/update-gvar');
const { updateSnippet } = require('./avrae/update-snippet');

module.exports = {
  buildEnvFile,
  checkSourceMap,
  compareSourceMaps,
  createAlias,
  createAssets,
  createGvar,
  createSnippet,
  createSubalias,
  createWorkshop,
  deploy,
  generateEnvFile,
  getAlias,
  getGvar,
  getHeaders,
  getSnippet,
  getWorkshop,
  responseData,
  responseId,
  updateAlias,
  updateDocs,
  updateGvar,
  updateSnippet,
};
