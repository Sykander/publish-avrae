#!/usr/bin/env node

const path = require('path');

const {
  checkSourceMap,
  compareSourceMaps,
  labelForPath,
} = require('./config-check');
const { TerminalReporter } = require('./terminal-reporter');
const {
  DEFAULT_SOURCE_MAP_FILE,
  loadSourceMap,
  writeSourceMap,
} = require('./source-map');

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positionals = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.replace(/^-+/, '').split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase(),
    );

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const next = rest[index + 1];

    if (next && !next.startsWith('-')) {
      options[key] = next;
      index += 1;
      continue;
    }

    options[key] = true;
  }

  return { command, options, positionals };
}

function sourceMapOption(options) {
  return (
    options.sourcemap ||
    options.sourceMap ||
    options.s ||
    DEFAULT_SOURCE_MAP_FILE
  );
}

function printHelp() {
  console.log(`Usage:
  publish-avrae deploy [--sourcemap sourcemap.json] [--create-assets]
  publish-avrae create-assets [--sourcemap sourcemap.json]
  publish-avrae check-config [--sourcemap sourcemap.json]
  publish-avrae compare-config <source.json> <target.json>
  publish-avrae create-workshop --name "Workshop name" [--sourcemap sourcemap.json]
`);
}

function printCheckResult(title, result) {
  if (title) {
    console.log(title);
  }

  for (const warning of result.warnings) {
    console.log(`[warn] ${warning}`);
  }

  for (const error of result.errors) {
    console.log(`[err] ${error}`);
  }

  if (result.ok) {
    console.log('[ok] Config check passed.');
  }
}

function throwIfInvalid(result, title) {
  printCheckResult(title, result);

  if (!result.ok) {
    const error = new Error('Config check failed.');
    error.isConfigError = true;
    throw error;
  }
}

async function deployCommand(options) {
  const { deploy } = require('./deploy');
  const { sourceMap, baseDir } = loadSourceMap(sourceMapOption(options));
  const check = checkSourceMap(sourceMap, { baseDir });

  throwIfInvalid(check);

  await deploy(sourceMap, {
    baseDir,
    createAssets: Boolean(options.createAssets),
    reporter: new TerminalReporter({ enabled: !options.noProgress }),
  });
}

async function createAssetsCommand(options) {
  const { createAssets } = require('./create-assets');
  const loaded = loadSourceMap(sourceMapOption(options));
  const check = checkSourceMap(loaded.sourceMap, {
    baseDir: loaded.baseDir,
    requireGvarIds: false,
    requireWorkshopId: false,
  });

  throwIfInvalid(check);

  await createAssets(loaded.sourceMap, {
    baseDir: loaded.baseDir,
    createWorkshop: Boolean(options.createWorkshop),
    filePath: loaded.filePath,
    reporter: new TerminalReporter({ enabled: !options.noProgress }),
    workshopDescription: options.description,
    workshopImage: options.image,
    workshopName: options.name,
  });
}

async function checkConfigCommand(options) {
  const { sourceMap, baseDir, filePath } = loadSourceMap(
    sourceMapOption(options),
  );
  const result = checkSourceMap(sourceMap, { baseDir });

  throwIfInvalid(result, `Checking ${filePath}`);
}

async function compareConfigCommand(options, positionals) {
  const sourceFile = options.source || options.left || positionals[0];
  const targetFile = options.target || options.right || positionals[1];

  if (!sourceFile || !targetFile) {
    throw new Error('compare-config requires two sourcemap files.');
  }

  const source = loadSourceMap(sourceFile);
  const target = loadSourceMap(targetFile);
  const result = compareSourceMaps(source.sourceMap, target.sourceMap, {
    sourceBaseDir: source.baseDir,
    sourceLabel: labelForPath(source.filePath),
    targetBaseDir: target.baseDir,
    targetLabel: labelForPath(target.filePath),
  });

  throwIfInvalid(
    result,
    `Comparing ${path.basename(source.filePath)} and ${path.basename(
      target.filePath,
    )}`,
  );
}

async function createWorkshopCommand(options) {
  const { createWorkshop } = require('./avrae/create-workshop');
  const { responseId } = require('./avrae/response-data');

  if (!options.name) {
    throw new Error('create-workshop requires --name.');
  }

  const workshop = await createWorkshop({
    name: options.name,
    description: options.description || '',
    image: options.image || '',
  });
  const id = responseId(workshop);

  if (!id) {
    throw new Error('Avrae did not return an id for the created workshop.');
  }

  console.log(`[ok] Created workshop ${id}.`);

  if (options.sourcemap || options.sourceMap || options.s) {
    const loaded = loadSourceMap(sourceMapOption(options));
    loaded.sourceMap.workshop = {
      ...loaded.sourceMap.workshop,
      id,
    };
    writeSourceMap(loaded.filePath, loaded.sourceMap);
    console.log(`[ok] Updated ${loaded.filePath}.`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const { command, options, positionals } = parseArgs(argv);

  switch (command) {
    case 'deploy':
      return deployCommand(options);
    case 'create-assets':
      return createAssetsCommand(options);
    case 'check-config':
      return checkConfigCommand(options);
    case 'compare-config':
      return compareConfigCommand(options, positionals);
    case 'create-workshop':
      return createWorkshopCommand(options);
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return undefined;
    default:
      throw new Error(`Unknown command "${command}".`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    if (!error.isConfigError) {
      console.error(`[err] ${error.message}`);

      for (const failure of error.failures || []) {
        console.error(`[err] ${failure.message}`);
      }
    }

    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
