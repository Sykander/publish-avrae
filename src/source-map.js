const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCE_MAP_FILE = 'sourcemap.json';

function normalizeSourceMap(sourceMap = {}) {
  const normalized = {
    aliases: [],
    snippets: [],
    gvars: [],
    ...sourceMap,
  };

  normalized.aliases = Array.isArray(normalized.aliases)
    ? normalized.aliases
    : [];
  normalized.snippets = Array.isArray(normalized.snippets)
    ? normalized.snippets
    : [];
  normalized.gvars = Array.isArray(normalized.gvars) ? normalized.gvars : [];
  normalized.workshop = normalized.workshop || {};

  return normalized;
}

function resolveSourceMapPath(sourceMapFile = DEFAULT_SOURCE_MAP_FILE) {
  return path.resolve(process.cwd(), sourceMapFile);
}

function loadSourceMap(sourceMapFile = DEFAULT_SOURCE_MAP_FILE) {
  const filePath = resolveSourceMapPath(sourceMapFile);
  const sourceMap = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  return {
    filePath,
    // Asset paths in the sourcemap are project paths resolved from where the
    // CLI is run, even when the sourcemap itself lives in a subdirectory.
    baseDir: process.cwd(),
    sourceMap: normalizeSourceMap(sourceMap),
  };
}

function writeSourceMap(filePath, sourceMap) {
  fs.writeFileSync(filePath, `${JSON.stringify(sourceMap, null, 2)}\n`);
}

function resolveAssetPath(asset, baseDir = process.cwd(), property = 'file') {
  if (!asset?.[property]) {
    return null;
  }

  return path.resolve(baseDir, asset[property]);
}

function readAssetFile(asset, baseDir = process.cwd(), property = 'file') {
  const filePath = resolveAssetPath(asset, baseDir, property);

  return fs.readFileSync(filePath, 'utf8');
}

function getDocsFile(asset) {
  return asset?.docs_file;
}

function getDocsFileProperty(asset) {
  if (asset?.docs_file) {
    return 'docs_file';
  }

  return null;
}

function getAssetDocs(asset, baseDir = process.cwd()) {
  const docsFile = getDocsFile(asset);

  if (docsFile) {
    return readAssetFile(asset, baseDir, 'docs_file');
  }

  return undefined;
}

function collectAliases(sourceMap) {
  const aliases = [];

  function collectSubAliases(alias, parent) {
    for (const subAlias of alias.sub_aliases || []) {
      aliases.push({ ...subAlias, type: 'subalias', parent });
      collectSubAliases(subAlias, subAlias);
    }
  }

  for (const alias of normalizeSourceMap(sourceMap).aliases) {
    aliases.push({ ...alias, type: 'alias', parent: null });
    collectSubAliases(alias, alias);
  }

  return aliases;
}

module.exports = {
  DEFAULT_SOURCE_MAP_FILE,
  collectAliases,
  getAssetDocs,
  getDocsFile,
  getDocsFileProperty,
  loadSourceMap,
  normalizeSourceMap,
  readAssetFile,
  resolveAssetPath,
  resolveSourceMapPath,
  writeSourceMap,
};
