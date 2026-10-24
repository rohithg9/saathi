// Runs the engine and safety tests (test/*.test.ts) with node:test after bundling them with esbuild.
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FALLBACK = ['/opt/npm-tools/node_modules', '/home/claude/.npm-global/lib/node_modules'];
let esbuild; try { esbuild = require('esbuild'); } catch { for (const p of FALLBACK) { try { esbuild = require(path.join(p, 'esbuild')); break; } catch {} } }
const tmp = path.join(root, '.test-build');
rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
const files = readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.test.ts'));
for (const f of files) {
  await esbuild.build({ entryPoints: [path.join(root, 'test', f)], bundle: true, platform: 'node', format: 'esm', outfile: path.join(tmp, f.replace('.ts', '.mjs')), logLevel: 'warning', define: { __SAATHI_DATA_MODE__: '"demo"', __SUPABASE_URL__: '""', __SUPABASE_ANON_KEY__: '""', __APP_VERSION__: '"test"' } });
}
const r = spawnSync(process.execPath, ['--test', ...files.map(f => path.join(tmp, f.replace('.ts', '.mjs')))], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
process.exit(r.status ?? 1);
