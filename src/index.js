const { deploy } = require('./deploy');
const { createAssets } = require('./create-assets');
const { checkSourceMap, compareSourceMaps } = require('./config-check');
const { createWorkshop } = require('./avrae/create-workshop');

module.exports = {
  checkSourceMap,
  compareSourceMaps,
  createAssets,
  createWorkshop,
  deploy,
};
