const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', 'out');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const optionalModuleStubs = new Map([
  ['@aws-sdk/client-s3', 'module.exports = {};']
]);

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  platform: 'node',
  format: 'cjs',
  target: ['node20'],
  external: ['vscode'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
  plugins: [{
    name: 'optional-module-stubs',
    setup(build) {
      for (const moduleName of optionalModuleStubs.keys()) {
        build.onResolve({ filter: new RegExp(`^${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({
          path: moduleName,
          namespace: 'optional-stub'
        }));
      }
      build.onLoad({ filter: /.*/, namespace: 'optional-stub' }, (args) => ({
        contents: optionalModuleStubs.get(args.path) ?? 'module.exports = {};',
        loader: 'js'
      }));
    }
  }]
}).catch(() => {
  process.exitCode = 1;
});
