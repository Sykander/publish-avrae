const fs = require("fs");

const { getWorkshop } = require("./avrae/get-workshop");
const { getAlias } = require("./avrae/get-alias");
const { setEnvironmentId } = require("./set-environment-id");
const { updateAlias } = require("./avrae/update-alias");
const { getSnippet } = require("./avrae/get-snippet");
const { updateSnippet } = require("./avrae/update-snippet");
const { updateGvar } = require("./avrae/update-gvar");
const { getGvar } = require("./avrae/get-gvar");

function hydrateSourceMapAlias(
  sourceMap,
  workshop,
  sourceMapAlias,
  workshopAlias,
) {
  sourceMapAlias.id = workshopAlias._id;

  Array.isArray(sourceMapAlias.sub_aliases) &&
    sourceMapAlias.sub_aliases.forEach((sourceMapSubAlias) => {
      const workshopSubCommand = workshopAlias.subcommands.find(
        ({ name: subCommandName }) => subCommandName === sourceMapSubAlias.name,
      );

      if (!workshopSubCommand) {
        throw new Error(
          `Alias ${sourceMapAlias.name} sub alias ${sourceMapSubAlias.name} does not exist in the workshop.`,
        );
      }

      hydrateSourceMapAlias(
        sourceMap,
        workshop,
        sourceMapSubAlias,
        workshopSubCommand,
      );
    });
}

function hydrateSourceMap(sourceMap, workshop) {
  sourceMap.aliases.forEach((sourceMapAlias) => {
    const workshopAlias = workshop.aliases.find(
      ({ name: workshopAliasName }) =>
        sourceMapAlias.name === workshopAliasName,
    );

    if (!workshopAlias) {
      throw new Error(
        `Alias ${sourceMapAlias.name} does not exist in the workshop.`,
      );
    }

    hydrateSourceMapAlias(sourceMap, workshop, sourceMapAlias, workshopAlias);
  });
  Array.isArray(sourceMap.snippets) &&
    sourceMap.snippets.forEach((sourceMapSnippet) => {
      const workshopSnippet = workshop.snippets.find(
        ({ name: workshopSnippetName }) =>
          sourceMapSnippet.name === workshopSnippetName,
      );

      if (!workshopSnippet) {
        throw new Error(
          `Snippet ${sourceMapSnippet.name} does not exist in the workshop.`,
        );
      }

      sourceMapSnippet.id = workshopSnippet._id;
    });

  return { ...sourceMap };
}

function flatMapAliases(aliasesList) {
  return [
    ...aliasesList,
    ...aliasesList.flatMap((alias) => flatMapAliases(alias.sub_aliases || [])),
  ];
}

async function deploy(sourceMap) {
  const tasks = [];

  if (sourceMap?.workshop?.id) {
    const workshop = await getWorkshop(sourceMap.workshop.id);
    const hydratedSourceMap = hydrateSourceMap(sourceMap, workshop);

    tasks.push(
      ...flatMapAliases(hydratedSourceMap.aliases).map(
        async (sourceMapAlias) => {
          const aliasVersions = await getAlias(sourceMapAlias.id);
          const aliasCurrentVersion =
            aliasVersions.find(({ is_current }) => is_current) ||
            aliasVersions[0] ||
            {};
          const highestVersion =
            Math.max(...aliasVersions.map(({ version }) => version)) || 0;

          const rawContents = fs.readFileSync(sourceMapAlias.file).toString();
          const newContents = sourceMap?.workshop?.environment
            ? setEnvironmentId(rawContents, sourceMap.workshop.environment)
            : rawContents;

          if (aliasCurrentVersion.content === newContents) {
            console.log(
              `${sourceMapAlias.name} alias wasn't updated as its unchanged.`,
            );
            return;
          }

          const newVersionNum =
            (Number.isFinite(highestVersion) ? highestVersion : 0) + 1;

          const newVersion = {
            ...aliasCurrentVersion,
            is_current: true,
            content: newContents,
            version: newVersionNum,
          };

          return updateAlias(sourceMapAlias.id, newVersion).then(() =>
            console.log(
              `${sourceMapAlias.name} alias was updated to version ${newVersionNum}`,
            ),
          );
        },
      ),
    );

    tasks.push(
      ...hydratedSourceMap.snippets.map(async (sourceMapSnippet) => {
        const snippetVersions = await getSnippet(sourceMapSnippet.id);
        const snippetCurrentVersion =
          snippetVersions.find(({ is_current }) => is_current) ||
          snippetVersions[0] ||
          {};
        const highestVersion =
          Math.max(...snippetVersions.map(({ version }) => version)) || 0;

        const rawContents = fs.readFileSync(sourceMapSnippet.file).toString();
        const newContents = sourceMap?.workshop?.environment
          ? setEnvironmentId(rawContents, sourceMap.workshop.environment)
          : rawContents;
        if (snippetCurrentVersion.content === newContents) {
          console.log(
            `${sourceMapSnippet.name} snippet wasn't updated as its unchanged.`,
          );
          return;
        }

        const newVersionNum =
          (Number.isFinite(highestVersion) ? highestVersion : 0) + 1;
        const newVersion = {
          ...snippetCurrentVersion,
          is_current: true,
          content: newContents,
          version: newVersionNum,
        };

        return updateSnippet(sourceMapSnippet.id, newVersion).then(() =>
          console.log(
            `${sourceMapSnippet.name} snippet was updated to version ${newVersionNum}`,
          ),
        );
      }),
    );
  }

  tasks.push(
    ...sourceMap.gvars.map(async (sourceMapGvar) => {
      const currentGvar = await getGvar(sourceMapGvar.id);

      const rawContents = fs.readFileSync(sourceMapGvar.file).toString();
      const newContents = sourceMap?.workshop?.environment
        ? setEnvironmentId(rawContents, sourceMap.workshop.environment)
        : rawContents;

      if (currentGvar.value === newContents) {
        console.log(
          `${sourceMapGvar.name} ${sourceMapGvar.id} gvar wasn't updated as its unchanged.`,
        );
        return;
      }

      return updateGvar(sourceMapGvar.id, {
        ...currentGvar,
        value: newContents,
      }).then(() =>
        console.log(
          `${sourceMapGvar.name} ${sourceMapGvar.id} gvar was updated.`,
        ),
      );
    }),
  );

  return Promise.all(tasks);
}

module.exports = { deploy };
