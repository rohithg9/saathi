// Build the web app into dist/ (used by `npm run build`, Ionic Appflow and `npx cap sync`).
// Uses esbuild directly; falls back to globally installed copies of esbuild/react when
// node_modules is not installed (offline development).
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FALLBACK = ['/opt/npm-tools/node_modules', '/home/claude/.npm-global/lib/node_modules'];
function load(name) {
  try { return require(name); } catch {}
  for (const p of FALLBACK) { try { return require(path.join(p, name)); } catch {} }
  throw new Error(`Cannot find ${name}. Run npm install.`);
}
const esbuild = load('esbuild');
const serve = process.argv.includes('--serve');
const out = path.join(root, 'dist');

const env = {
  SAATHI_DATA_MODE: process.env.SAATHI_DATA_MODE || 'demo',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  APP_VERSION: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version,
};

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'assets'), { recursive: true });
cpSync(path.join(root, 'public'), out, { recursive: true });
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
writeFileSync(path.join(out, 'index.html'), html);

const options = {
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  outfile: path.join(out, 'assets/app.js'),
  format: 'esm',
  target: ['es2020', 'safari15'],
  jsx: 'automatic',
  sourcemap: serve ? 'inline' : false,
  minify: !serve && !process.env.NOMINIFY,
  nodePaths: [path.join(root, 'node_modules'), ...FALLBACK],
  loader: { '.css': 'css' },
  define: Object.fromEntries(Object.entries(env).map(([k, v]) => [`__${k}__`, JSON.stringify(v)])),
  logLevel: 'info',
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: out, port: 5173 });
  console.log(`Saathi dev server: http://localhost:${port}`);
} else {
  await esbuild.build(options);
  if (!existsSync(path.join(out, 'assets/app.js'))) throw new Error('build failed');
  console.log('Built dist/ (data mode:', env.SAATHI_DATA_MODE + ')');
}
