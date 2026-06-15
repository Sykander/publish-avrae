const fs = require('fs');
const path = require('path');

const {
  getDocsFile,
  getDocsFileProperty,
  normalizeSourceMap,
  resolveAssetPath,
} = require('./source-map');

const WORKSHOP_ID_REGEX = /^[a-f\d]{24}$/i;
const GVAR_ID_REGEX =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const UNSUPPORTED_DOCS_FIELDS = [
  'docs',
  'help',
  'help_file',
  'documentation_file',
];

function createResult() {
  const errors = [];
  const warnings = [];

  return {
    errors,
    warnings,
    get ok() {
      return errors.length === 0;
    },
  };
}

function addDuplicateErrors(result, entries, key, label) {
  const seen = new Map();

  for (const entry of entries) {
    const value = entry?.[key];

    if (!value) {
      continue;
    }

    if (seen.has(value)) {
      result.errors.push(
        `${label} "${entry.name}" duplicates ${key} "${value}" from "${seen.get(
          value,
        )}".`,
      );
      continue;
    }

    seen.set(value, entry.name);
  }
}

function checkFile(result, asset, baseDir, label, property = 'file') {
  if (!asset?.[property]) {
    result.errors.push(`${label} is missing ${property}.`);
    return;
  }

  const filePath = resolveAssetPath(asset, baseDir, property);

  if (!fs.existsSync(filePath)) {
    result.errors.push(`${label} references missing file ${asset[property]}.`);
  }
}

function checkUnsupportedDocsFields(result, asset, label) {
  for (const property of UNSUPPORTED_DOCS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(asset || {}, property)) {
      result.errors.push(
        `${label} uses unsupported ${property}. Use docs_file instead.`,
      );
    }
  }
}

function checkNamedAsset(result, asset, baseDir, label) {
  if (!asset?.name) {
    result.errors.push(`${label} is missing name.`);
  }

  checkUnsupportedDocsFields(result, asset, label);
  checkFile(result, asset, baseDir, label);

  if (getDocsFile(asset)) {
    checkFile(result, asset, baseDir, label, getDocsFileProperty(asset));
  }
}

function aliasPath(pathParts) {
  return pathParts.join(' ');
}

function checkAliasTree(result, alias, baseDir, pathParts, isSubAlias = false) {
  const label = isSubAlias
    ? `Subalias "${aliasPath(pathParts)}"`
    : `Alias "${alias?.name || 'unknown'}"`;

  checkNamedAsset(result, alias, baseDir, label);
  addDuplicateErrors(
    result,
    alias.sub_aliases || [],
    'name',
    `Subalias under "${aliasPath(pathParts)}"`,
  );

  for (const subAlias of alias.sub_aliases || []) {
    checkAliasTree(
      result,
      subAlias,
      baseDir,
      [...pathParts, subAlias?.name || 'unknown'],
      true,
    );
  }
}

function checkSourceMap(sourceMap, options = {}) {
  const {
    baseDir = process.cwd(),
    requireGvarIds = true,
    requireWorkshopId = true,
  } = options;
  const normalized = normalizeSourceMap(sourceMap);
  const result = createResult();
  const { workshop, aliases, snippets, gvars } = normalized;

  if (workshop?.id && !WORKSHOP_ID_REGEX.test(workshop.id)) {
    result.errors.push('workshop.id must be a 24 character Avrae workshop id.');
  }

  if (workshop?.environment && !GVAR_ID_REGEX.test(workshop.environment)) {
    result.errors.push('workshop.environment must be a gvar UUID.');
  }

  if (
    requireWorkshopId &&
    (aliases.length || snippets.length) &&
    !workshop?.id
  ) {
    result.errors.push(
      'workshop.id is required when aliases or snippets exist.',
    );
  }

  if (
    workshop?.environment &&
    !gvars.some(({ name, id }) => name === 'env' && id === workshop.environment)
  ) {
    result.errors.push(
      'workshop.environment is set but no gvar named "env" uses that id.',
    );
  }

  addDuplicateErrors(result, aliases, 'name', 'Alias');
  addDuplicateErrors(result, snippets, 'name', 'Snippet');
  addDuplicateErrors(result, gvars, 'name', 'Gvar');
  addDuplicateErrors(result, gvars, 'id', 'Gvar');

  for (const alias of aliases) {
    checkAliasTree(result, alias, baseDir, [alias?.name || 'unknown']);
  }

  for (const snippet of snippets) {
    checkNamedAsset(
      result,
      snippet,
      baseDir,
      `Snippet "${snippet?.name || 'unknown'}"`,
    );
  }

  for (const gvar of gvars) {
    checkNamedAsset(result, gvar, baseDir, `Gvar "${gvar?.name || 'unknown'}"`);

    if (gvar?.id && !GVAR_ID_REGEX.test(gvar.id)) {
      result.errors.push(`Gvar "${gvar.name}" id must be a UUID.`);
    }

    if (requireGvarIds && !gvar?.id) {
      result.errors.push(`Gvar "${gvar?.name || 'unknown'}" is missing id.`);
    }
  }

  return result;
}

function findByName(entries, name) {
  return entries.find((entry) => entry.name === name);
}

function compareSubAliases(
  result,
  sourceAlias,
  targetAlias,
  sourcePath,
  targetPath,
  sourceLabel,
  targetLabel,
) {
  const sourceSubAliases = sourceAlias.sub_aliases || [];
  const targetSubAliases = targetAlias.sub_aliases || [];

  for (const sourceSubAlias of sourceSubAliases) {
    const targetSubAlias = findByName(targetSubAliases, sourceSubAlias.name);

    if (!targetSubAlias) {
      result.errors.push(
        `${targetLabel} is missing subalias "${sourcePath} ${sourceSubAlias.name}".`,
      );
      continue;
    }

    if (sourceSubAlias.file !== targetSubAlias.file) {
      result.errors.push(
        `Subalias "${sourcePath} ${sourceSubAlias.name}" has different files in ${sourceLabel} and ${targetLabel}.`,
      );
    }

    if (getDocsFile(sourceSubAlias) !== getDocsFile(targetSubAlias)) {
      result.errors.push(
        `Subalias "${sourcePath} ${sourceSubAlias.name}" has different docs files in ${sourceLabel} and ${targetLabel}.`,
      );
    }

    compareSubAliases(
      result,
      sourceSubAlias,
      targetSubAlias,
      `${sourcePath} ${sourceSubAlias.name}`,
      `${targetPath} ${targetSubAlias.name}`,
      sourceLabel,
      targetLabel,
    );
  }

  for (const targetSubAlias of targetSubAliases) {
    if (!findByName(sourceSubAliases, targetSubAlias.name)) {
      result.errors.push(
        `${sourceLabel} is missing subalias "${targetPath} ${targetSubAlias.name}".`,
      );
    }
  }
}

function compareNamedEntries(
  result,
  sourceEntries,
  targetEntries,
  label,
  sourceLabel,
  targetLabel,
  options = {},
) {
  const { skipFileCheckForNames = [] } = options;

  for (const sourceEntry of sourceEntries) {
    const targetEntry = findByName(targetEntries, sourceEntry.name);

    if (!targetEntry) {
      result.errors.push(
        `${targetLabel} is missing ${label} "${sourceEntry.name}".`,
      );
      continue;
    }

    if (
      sourceEntry.file !== targetEntry.file &&
      !skipFileCheckForNames.includes(sourceEntry.name)
    ) {
      result.errors.push(
        `${label} "${sourceEntry.name}" has different files in ${sourceLabel} and ${targetLabel}.`,
      );
    }

    if (getDocsFile(sourceEntry) !== getDocsFile(targetEntry)) {
      result.errors.push(
        `${label} "${sourceEntry.name}" has different docs files in ${sourceLabel} and ${targetLabel}.`,
      );
    }
  }

  for (const targetEntry of targetEntries) {
    if (!findByName(sourceEntries, targetEntry.name)) {
      result.errors.push(
        `${sourceLabel} is missing ${label} "${targetEntry.name}".`,
      );
    }
  }
}

function pushPrefixedMessages(target, messages, label) {
  for (const message of messages) {
    target.push(`${label}: ${message}`);
  }
}

function compareSourceMaps(sourceMap, targetSourceMap, options = {}) {
  const {
    sourceLabel = 'source',
    targetLabel = 'target',
    sourceBaseDir = process.cwd(),
    targetBaseDir = process.cwd(),
  } = options;
  const source = normalizeSourceMap(sourceMap);
  const target = normalizeSourceMap(targetSourceMap);
  const result = createResult();
  const sourceCheck = checkSourceMap(source, { baseDir: sourceBaseDir });
  const targetCheck = checkSourceMap(target, { baseDir: targetBaseDir });

  pushPrefixedMessages(result.errors, sourceCheck.errors, sourceLabel);
  pushPrefixedMessages(result.errors, targetCheck.errors, targetLabel);
  pushPrefixedMessages(result.warnings, sourceCheck.warnings, sourceLabel);
  pushPrefixedMessages(result.warnings, targetCheck.warnings, targetLabel);

  if (
    source.workshop?.id &&
    target.workshop?.id &&
    source.workshop.id === target.workshop.id
  ) {
    result.errors.push(
      `${sourceLabel} and ${targetLabel} use the same workshop.id.`,
    );
  }

  if (
    source.workshop?.environment &&
    target.workshop?.environment &&
    source.workshop.environment === target.workshop.environment
  ) {
    result.errors.push(
      `${sourceLabel} and ${targetLabel} use the same workshop.environment.`,
    );
  }

  if (Boolean(source.workshop?.id) !== Boolean(target.workshop?.id)) {
    result.errors.push(
      `${sourceLabel} and ${targetLabel} must either both set workshop.id or both omit it.`,
    );
  }

  if (
    Boolean(source.workshop?.environment) !==
    Boolean(target.workshop?.environment)
  ) {
    result.errors.push(
      `${sourceLabel} and ${targetLabel} must either both set workshop.environment or both omit it.`,
    );
  }

  compareNamedEntries(
    result,
    source.aliases,
    target.aliases,
    'Alias',
    sourceLabel,
    targetLabel,
  );

  for (const sourceAlias of source.aliases) {
    const targetAlias = findByName(target.aliases, sourceAlias.name);

    if (targetAlias) {
      compareSubAliases(
        result,
        sourceAlias,
        targetAlias,
        sourceAlias.name,
        targetAlias.name,
        sourceLabel,
        targetLabel,
      );
    }
  }

  compareNamedEntries(
    result,
    source.snippets,
    target.snippets,
    'Snippet',
    sourceLabel,
    targetLabel,
  );

  compareNamedEntries(
    result,
    source.gvars,
    target.gvars,
    'Gvar',
    sourceLabel,
    targetLabel,
    { skipFileCheckForNames: ['env'] },
  );

  for (const sourceGvar of source.gvars) {
    const targetGvar = findByName(target.gvars, sourceGvar.name);

    if (!targetGvar) {
      continue;
    }

    if (sourceGvar.name !== 'env' && sourceGvar.id === targetGvar.id) {
      result.errors.push(
        `Gvar "${sourceGvar.name}" uses the same id in ${sourceLabel} and ${targetLabel}.`,
      );
    }
  }

  return result;
}

function labelForPath(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

module.exports = {
  GVAR_ID_REGEX,
  WORKSHOP_ID_REGEX,
  checkSourceMap,
  compareSourceMaps,
  labelForPath,
};
