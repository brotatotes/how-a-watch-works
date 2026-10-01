// Build: bundles src/main.js with esbuild and inlines JS, CSS and fonts into
// one self-contained dist/index.html. Usage: node build.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
// Resolve 'three' and 'three/addons/...' to the vendored copy.
const vendorThree = {
  name: 'vendor-three',
  setup(b) {
    b.onResolve({ filter: /^three(\/addons\/.*)?$/ }, (a) => ({
      path: a.path === 'three' ? path.join(root, 'vendor/three/three.module.js') : path.join(root, 'vendor/three', a.path.slice(6)),
    }));
  },
};
const app = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, write: false, format: 'iife', target: 'es2020', minify: true,
  legalComments: 'none', plugins: [vendorThree], logLevel: 'warning',
});
const appCode = app.outputFiles[0].text;
const license = readFileSync(path.join(root, 'vendor/three/LICENSE'), 'utf8').trim();
const css = readFileSync(path.join(root, 'src/style.css'), 'utf8');
const fontPath = path.join(root, 'src/fonts.css');
const fonts = existsSync(fontPath) ? readFileSync(fontPath, 'utf8') : '';
let html = readFileSync(path.join(root, 'src/index.html'), 'utf8');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
html = html
  .replace('/*FONTS*/', () => fonts)
  .replace('/*STYLE*/', () => css)
  .replace('<!--ESSAY-->', () => readFileSync(path.join(root, 'src/essay.html'), 'utf8'))
  .replace('/*APP*/', () => `/*! Three.js (https://threejs.org) is included under the MIT License:\n${license}\n*/\n` + safe(appCode));
const outFile = process.env.WATCH_OUT || path.join(root, 'dist/index.html');
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`${path.relative(root, outFile)} ${(html.length / 1024).toFixed(0)} KB`);
