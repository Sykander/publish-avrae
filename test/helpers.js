const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function srcPath(...parts) {
  return path.join(__dirname, '..', 'src', ...parts);
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'publish-avrae-'));
}

function writeFiles(baseDir, files) {
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(baseDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
}

function restoreCacheEntry(resolvedPath, original) {
  if (original) {
    require.cache[resolvedPath] = original;
    return;
  }

  delete require.cache[resolvedPath];
}

function freshRequire(modulePath, mocks = {}) {
  const resolvedTarget = require.resolve(modulePath);
  const originals = new Map();

  function remember(resolvedPath) {
    if (!originals.has(resolvedPath)) {
      originals.set(resolvedPath, require.cache[resolvedPath]);
    }
  }

  remember(resolvedTarget);
  delete require.cache[resolvedTarget];

  for (const [request, exports] of Object.entries(mocks)) {
    const resolvedMock = require.resolve(request);
    remember(resolvedMock);
    require.cache[resolvedMock] = {
      id: resolvedMock,
      filename: resolvedMock,
      loaded: true,
      exports,
    };
  }

  const loadedModule = require(resolvedTarget);

  return {
    module: loadedModule,
    restore() {
      delete require.cache[resolvedTarget];

      for (const [resolvedPath, original] of originals) {
        restoreCacheEntry(resolvedPath, original);
      }
    },
  };
}

async function captureConsole(method, callback) {
  const original = console[method];
  const lines = [];

  console[method] = (...args) => {
    lines.push(args.join(' '));
  };

  try {
    const result = await callback(lines);
    return { lines, result };
  } finally {
    console[method] = original;
  }
}

module.exports = {
  captureConsole,
  freshRequire,
  makeTempDir,
  srcPath,
  writeFiles,
};
