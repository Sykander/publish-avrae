const { getAlias } = require('./avrae/get-alias');
const { getGvar } = require('./avrae/get-gvar');
const { getSnippet } = require('./avrae/get-snippet');
const { updateAlias } = require('./avrae/update-alias');
const { updateDocs } = require('./avrae/update-docs');
const { updateGvar } = require('./avrae/update-gvar');
const { updateSnippet } = require('./avrae/update-snippet');
const { setEnvironmentId } = require('./set-environment-id');
const {
  getAssetDocs,
  normalizeSourceMap,
  readAssetFile,
} = require('./source-map');
const { runTasks } = require('./task-runner');
const { hydrateWorkshopAssets } = require('./workshop-assets');

function currentVersion(versions) {
  return versions.find(({ is_current }) => is_current) || versions[0] || {};
}

function nextVersion(versions) {
  return Math.max(0, ...versions.map(({ version }) => version || 0)) + 1;
}

function withEnvironment(content, sourceMap) {
  return sourceMap?.workshop?.environment
    ? setEnvironmentId(content, sourceMap.workshop.environment)
    : content;
}

function workshopAssetPath(asset, parentPath) {
  return parentPath ? `${parentPath} ${asset.name}` : asset.name;
}

function labelForWorkshopAsset(type, asset, parentPath) {
  if (type === 'subalias') {
    return `subalias ${workshopAssetPath(asset, parentPath)}`;
  }

  return `${type} ${asset.name}`;
}

function buildWorkshopTask(type, asset, sourceMap, options = {}) {
  const { baseDir = process.cwd(), parentPath = null } = options;
  const label = labelForWorkshopAsset(type, asset, parentPath);
  const updateCode = type === 'snippet' ? updateSnippet : updateAlias;
  const getCode = type === 'snippet' ? getSnippet : getAlias;
  const docsType = type === 'snippet' ? 'snippet' : 'alias';
  const assetPath = workshopAssetPath(asset, parentPath);

  return {
    id: `${type}:${assetPath}`,
    label,
    async run() {
      const versions = await getCode(asset.id);
      const activeVersion = currentVersion(versions);
      const rawContents = readAssetFile(asset, baseDir);
      const newContents = withEnvironment(rawContents, sourceMap);
      const docs = getAssetDocs(asset, baseDir);
      const changes = [];

      if (activeVersion.content !== newContents) {
        const version = nextVersion(versions);
        await updateCode(asset.id, {
          ...activeVersion,
          is_current: true,
          content: newContents,
          version,
        });
        changes.push(`code v${version}`);
      }

      if (
        docs !== undefined &&
        (asset._workshopAsset?.docs || '') !== (docs || '')
      ) {
        await updateDocs(docsType, asset.id, {
          name: asset.name,
          docs,
        });
        changes.push('docs');
      }

      if (!changes.length) {
        return { status: 'skipped', message: 'unchanged' };
      }

      return { status: 'done', message: `${changes.join(', ')} updated` };
    },
  };
}

function buildGvarTask(sourceMapGvar, sourceMap, options = {}) {
  const { baseDir = process.cwd() } = options;

  return {
    id: `gvar:${sourceMapGvar.name}`,
    label: `gvar ${sourceMapGvar.name}`,
    async run() {
      if (!sourceMapGvar.id) {
        throw new Error(
          `Gvar ${sourceMapGvar.name} has no id. Run publish-avrae create-assets first.`,
        );
      }

      const currentGvar = await getGvar(sourceMapGvar.id);
      const rawContents = readAssetFile(sourceMapGvar, baseDir);
      const newContents = withEnvironment(rawContents, sourceMap);

      if (currentGvar.value === newContents) {
        return { status: 'skipped', message: 'unchanged' };
      }

      await updateGvar(sourceMapGvar.id, {
        ...currentGvar,
        value: newContents,
      });

      return { status: 'done', message: 'updated' };
    },
  };
}

function addAliasTasks(tasks, sourceMapAlias, sourceMap, options = {}) {
  const { baseDir = process.cwd(), parentPath = null } = options;
  const type = parentPath ? 'subalias' : 'alias';
  const currentPath = workshopAssetPath(sourceMapAlias, parentPath);

  tasks.push(
    buildWorkshopTask(type, sourceMapAlias, sourceMap, {
      baseDir,
      parentPath,
    }),
  );

  for (const sourceMapSubAlias of sourceMapAlias.sub_aliases || []) {
    addAliasTasks(tasks, sourceMapSubAlias, sourceMap, {
      baseDir,
      parentPath: currentPath,
    });
  }
}

async function deploy(sourceMap, options = {}) {
  const { baseDir = process.cwd(), createAssets = false, reporter } = options;
  const normalized = normalizeSourceMap(sourceMap);
  const hydratedSourceMap = await hydrateWorkshopAssets(normalized, {
    baseDir,
    createMissing: createAssets,
  });
  const tasks = [];

  if (hydratedSourceMap?.workshop?.id) {
    for (const sourceMapAlias of hydratedSourceMap.aliases) {
      addAliasTasks(tasks, sourceMapAlias, hydratedSourceMap, { baseDir });
    }

    for (const sourceMapSnippet of hydratedSourceMap.snippets) {
      tasks.push(
        buildWorkshopTask('snippet', sourceMapSnippet, hydratedSourceMap, {
          baseDir,
        }),
      );
    }
  }

  for (const sourceMapGvar of hydratedSourceMap.gvars) {
    tasks.push(buildGvarTask(sourceMapGvar, hydratedSourceMap, { baseDir }));
  }

  return runTasks(tasks, { reporter });
}

module.exports = { deploy };
