// Loads the synthetic demo data into a Supabase project (run once, from your computer, never in the app).
// SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-supabase.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
let esbuild; for (const p of ['esbuild', '/opt/npm-tools/node_modules/esbuild']) { try { esbuild = require(p); break; } catch {} }
const out = path.join(root, '.seed-build.mjs');
await esbuild.build({ entryPoints: [path.join(root, 'src/data/seed.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
const { buildSeed, DEMO_PASSWORD } = await import(pathToFileURL(out).href);
const db = await buildSeed();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
const emailFor = u => `${u.toLowerCase()}@users.saathi.app`;
for (const u of db.users) {
  const r = await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email: emailFor(u.username), password: DEMO_PASSWORD, email_confirm: true }) });
  const j = await r.json(); const authId = j.id || j.user?.id;
  const { passwordHash, ...profile } = u;
  await fetch(`${URL_}/rest/v1/users`, { method: 'POST', headers: H, body: JSON.stringify({ id: u.id, auth_uid: authId || null, org_id: u.orgId ?? null, patient_id: u.patientId ?? null, kind: u.kind, data: profile }) });
  console.log('user', u.username, authId ? 'ok' : JSON.stringify(j).slice(0, 80));
}
for (const [t, rows] of Object.entries(db)) {
  if (t === 'users' || !rows.length) continue;
  const body = rows.map(r => ({ id: r.id, org_id: r.orgId ?? (t === 'orgs' ? r.id : t === 'patients' ? r.orgIds[0] : null), patient_id: r.patientId ?? (t === 'patients' ? r.id : null), data: r }));
  const res = await fetch(`${URL_}/rest/v1/${t}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  console.log(t, rows.length, res.status);
}
(await import('node:fs')).rmSync(out, { force: true });
