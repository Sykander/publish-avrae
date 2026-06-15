const { createAlias } = require('./avrae/create-alias');
const { createSnippet } = require('./avrae/create-snippet');
const { createSubalias } = require('./avrae/create-subalias');
const { getWorkshop } = require('./avrae/get-workshop');
const { responseId } = require('./avrae/response-data');
const { getAssetDocs, normalizeSourceMap } = require('./source-map');

function findByName(entries = [], name) {
  return entries.find((entry) => entry.name === name);
}

function subcommands(alias) {
  if (!alias.subcommands) {
    alias.subcommands = alias.aliases || alias.sub_aliases || [];
  }

  return alias.subcommands;
}

function setRuntimeId(asset, id) {
  const enumerable = Object.prototype.hasOwnProperty.call(asset, 'id');

  Object.defineProperty(asset, 'id', {
    configurable: true,
    enumerable,
    value: id,
    writable: true,
  });
}

function setWorkshopAsset(asset, workshopAsset) {
  Object.defineProperty(asset, '_workshopAsset', {
    configurable: true,
    enumerable: false,
    value: workshopAsset,
    writable: true,
  });
}

function createdAssetFallback(sourceMapAsset, createdAsset, docs) {
  return {
    ...createdAsset,
    _id: responseId(createdAsset),
    name: sourceMapAsset.name,
    docs,
    subcommands: createdAsset.subcommands || [],
  };
}

async function hydrateWorkshopAssets(sourceMap, options = {}) {
  const { baseDir = process.cwd(), createMissing = false } = options;
  const normalized = normalizeSourceMap(sourceMap);

  if (!normalized.workshop?.id) {
    if (normalized.aliases.length || normalized.snippets.length) {
      throw new Error('workshop.id is required for aliases and snippets.');
    }

    return normalized;
  }

  const workshop = await getWorkshop(normalized.workshop.id);

  async function hydrateAlias(sourceMapAlias, workshopAlias, pathParts) {
    setRuntimeId(sourceMapAlias, workshopAlias._id);
    setWorkshopAsset(sourceMapAlias, workshopAlias);

    for (const sourceMapSubAlias of sourceMapAlias.sub_aliases || []) {
      let workshopSubAlias = findByName(
        subcommands(workshopAlias),
        sourceMapSubAlias.name,
      );
      const subAliasDocs = getAssetDocs(sourceMapSubAlias, baseDir);

      if (!workshopSubAlias) {
        if (!createMissing) {
          throw new Error(
            `Alias ${pathParts.join(' ')} sub alias ${sourceMapSubAlias.name} does not exist in the workshop.`,
          );
        }

        const createdSubAlias = await createSubalias(workshopAlias._id, {
          name: sourceMapSubAlias.name,
          docs: subAliasDocs || '',
        });
        workshopSubAlias = createdAssetFallback(
          sourceMapSubAlias,
          createdSubAlias,
          subAliasDocs,
        );
        subcommands(workshopAlias).push(workshopSubAlias);
      }

      await hydrateAlias(sourceMapSubAlias, workshopSubAlias, [
        ...pathParts,
        sourceMapSubAlias.name,
      ]);
    }
  }

  for (const sourceMapAlias of normalized.aliases) {
    let workshopAlias = findByName(workshop.aliases, sourceMapAlias.name);
    const docs = getAssetDocs(sourceMapAlias, baseDir);

    if (!workshopAlias) {
      if (!createMissing) {
        throw new Error(
          `Alias ${sourceMapAlias.name} does not exist in the workshop.`,
        );
      }

      const createdAlias = await createAlias(normalized.workshop.id, {
        name: sourceMapAlias.name,
        docs: docs || '',
      });
      workshopAlias = createdAssetFallback(sourceMapAlias, createdAlias, docs);
      workshop.aliases.push(workshopAlias);
    }

    await hydrateAlias(sourceMapAlias, workshopAlias, [sourceMapAlias.name]);
  }

  for (const sourceMapSnippet of normalized.snippets) {
    let workshopSnippet = findByName(workshop.snippets, sourceMapSnippet.name);
    const docs = getAssetDocs(sourceMapSnippet, baseDir);

    if (!workshopSnippet) {
      if (!createMissing) {
        throw new Error(
          `Snippet ${sourceMapSnippet.name} does not exist in the workshop.`,
        );
      }

      const createdSnippet = await createSnippet(normalized.workshop.id, {
        name: sourceMapSnippet.name,
        docs: docs || '',
      });
      workshopSnippet = createdAssetFallback(
        sourceMapSnippet,
        createdSnippet,
        docs,
      );
      workshop.snippets.push(workshopSnippet);
    }

    setRuntimeId(sourceMapSnippet, workshopSnippet._id);
    setWorkshopAsset(sourceMapSnippet, workshopSnippet);
  }

  return normalized;
}

module.exports = { hydrateWorkshopAssets };
