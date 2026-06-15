const { createGvar } = require('./avrae/create-gvar');
const { createWorkshop } = require('./avrae/create-workshop');
const { responseId } = require('./avrae/response-data');
const { setEnvironmentId } = require('./set-environment-id');
const {
  normalizeSourceMap,
  readAssetFile,
  writeSourceMap,
} = require('./source-map');
const { runTasksInOrder } = require('./task-runner');
const { hydrateWorkshopAssets } = require('./workshop-assets');

function withEnvironment(content, sourceMap, sourceMapGvar) {
  if (sourceMapGvar.name === 'env') {
    return content;
  }

  return sourceMap?.workshop?.environment
    ? setEnvironmentId(content, sourceMap.workshop.environment)
    : content;
}

async function ensureWorkshop(sourceMap, options = {}) {
  const {
    createWorkshop: shouldCreateWorkshop = false,
    workshopName,
    workshopDescription,
    workshopImage,
  } = options;

  if (sourceMap.workshop?.id) {
    return false;
  }

  const name = workshopName || sourceMap.workshop?.name;

  if (!shouldCreateWorkshop && !name) {
    return false;
  }

  if (!name) {
    throw new Error('A workshop name is required to create a workshop.');
  }

  const workshop = await createWorkshop({
    name,
    description: workshopDescription || sourceMap.workshop?.description || '',
    image: workshopImage || sourceMap.workshop?.image || '',
  });
  const id = responseId(workshop);

  if (!id) {
    throw new Error('Avrae did not return an id for the created workshop.');
  }

  sourceMap.workshop = {
    ...sourceMap.workshop,
    id,
  };

  return true;
}

function buildCreateGvarTask(sourceMapGvar, sourceMap, options = {}) {
  const { baseDir = process.cwd(), afterCreate } = options;

  return {
    id: `gvar:${sourceMapGvar.name}`,
    label: `gvar ${sourceMapGvar.name}`,
    async run() {
      if (sourceMapGvar.id) {
        return { status: 'skipped', message: 'already has id' };
      }

      const rawContents = readAssetFile(sourceMapGvar, baseDir);
      const value = withEnvironment(rawContents, sourceMap, sourceMapGvar);
      const createdGvar = await createGvar(value);
      const id = responseId(createdGvar);

      if (!id) {
        throw new Error('Avrae did not return an id for the created gvar.');
      }

      sourceMapGvar.id = id;

      if (sourceMapGvar.name === 'env' && !sourceMap.workshop.environment) {
        sourceMap.workshop.environment = id;
      }

      afterCreate?.();

      return { status: 'done', message: id };
    },
  };
}

async function createAssets(sourceMap, options = {}) {
  const { baseDir = process.cwd(), filePath, reporter } = options;
  const normalized = normalizeSourceMap(sourceMap);
  let changed = false;
  const persist = () => {
    if (filePath) {
      writeSourceMap(filePath, normalized);
    }
  };

  if (await ensureWorkshop(normalized, options)) {
    changed = true;
    persist();
  }

  await hydrateWorkshopAssets(normalized, {
    baseDir,
    createMissing: true,
  });

  const tasks = normalized.gvars
    .filter((sourceMapGvar) => !sourceMapGvar.id)
    .map((sourceMapGvar) =>
      buildCreateGvarTask(sourceMapGvar, normalized, {
        baseDir,
        afterCreate() {
          changed = true;
          persist();
        },
      }),
    );

  await runTasksInOrder(tasks, { reporter });

  if (changed) {
    persist();
  }

  return normalized;
}

module.exports = { createAssets };
