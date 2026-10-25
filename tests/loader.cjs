const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
exports.makeLoader = (mocks = {}) => {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith("@/") || name.startsWith(".")) {
        let resolved = name.startsWith("@/")
          ? path.resolve(__dirname, "..", name.slice(2))
          : path.resolve(path.dirname(file), name);
        if (!path.extname(resolved)) {
          if (fs.existsSync(resolved + ".web.ts")) resolved += ".web.ts";
          else resolved += ".ts";
        }
        return load(resolved);
      }
      return require(name);
    };
    // TypeScript's CommonJS output only uses `exports`; sources may declare their own `module`.
    new Function("require", "exports", code)(localRequire, module.exports);
    return module.exports;
  }
  return load;
};
