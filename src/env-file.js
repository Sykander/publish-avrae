const fs = require('fs');
const path = require('path');

const { normalizeSourceMap } = require('./source-map');

function requiredString(value, option) {
  if (typeof value !== 'string') {
    throw new Error(`generate-env requires ${option}.`);
  }

  if (!value) {
    throw new Error(`generate-env requires ${option}.`);
  }

  return value;
}

function optionalStringValue(value) {
  if (value === undefined || value === null || value === '') {
    return 'None';
  }

  if (typeof value !== 'string') {
    throw new Error('generate-env metadata values must be strings.');
  }

  return JSON.stringify(value);
}

function buildEnvDictionary(sourceMap) {
  const envDictionary = {};
  const gvars = normalizeSourceMap(sourceMap).gvars;

  for (const gvar of gvars) {
    if (!gvar?.name) {
      throw new Error('Gvar entries used for env files must have names.');
    }

    if (Object.prototype.hasOwnProperty.call(envDictionary, gvar.name)) {
      throw new Error(`Gvar "${gvar.name}" is duplicated.`);
    }

    if (!gvar.id) {
      throw new Error(
        `Gvar ${gvar.name} has no id. Run publish-avrae create-assets first.`,
      );
    }

    envDictionary[gvar.name] = gvar.id;
  }

  return envDictionary;
}

function buildEnvFile(sourceMap, options = {}) {
  const environmentName = optionalStringValue(options.environmentName);
  const version = optionalStringValue(options.version);
  const envDictionary = buildEnvDictionary(sourceMap);

  return `environment = ${environmentName}
version = ${version}

gvars = ${JSON.stringify(envDictionary, null, 4)}
`;
}

function generateEnvFile(sourceMap, options = {}) {
  const outputPath = requiredString(options.outputPath, '--output');
  const baseDir = options.baseDir ?? process.cwd();
  const filePath = path.resolve(baseDir, outputPath);
  const content = buildEnvFile(sourceMap, options);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);

  return { content, filePath };
}

module.exports = {
  buildEnvFile,
  generateEnvFile,
};
