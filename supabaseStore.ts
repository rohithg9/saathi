// Supabase back end over plain REST (PostgREST + GoTrue), no SDK dependency.
// Schema: supabase/migrations/0001_schema.sql. Each table stores the domain row in `data jsonb`
// plus indexed key columns (org_id, patient_id) that Row Level Security policies use.

import { AuthError, DataStore, Db, Row, TABLES } from './store';
import type { Session, Table } from './types';

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

const URL_ = typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '';
const ANON = typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '';
const SKEY = 'saathi.sb.session';
/** Usernames map to synthetic e-mail identities in Supabase Auth. */
export const emailFor = (username: string) => `${username.trim().toLowerCase()}@users.saathi.app`;

interface Tok { access_token: string; refresh_token: string; expires_at: number; session: Session }
let tok: Tok | null = null;

const keyCols = (t: Table, row: any) => ({
  id: row.id,
  org_id: row.orgId ?? (t === 'orgs' ? row.id : t === 'patients' ? row.orgIds?.[0] : null),
  patient_id: row.patientId ?? (t === 'patients' ? row.id : null),
  data: row,
});

async function http(path: string, init: RequestInit = {}, auth = true): Promise<any> {
  if (auth) await refreshIfNeeded();
  const res = await fetch(`${URL_}${path}`, { ...init, headers: { apikey: ANON, 'Content-Type': 'application/json', Authorization: `Bearer ${auth && tok ? tok.access_token : ANON}`, ...(init.headers || {}) } });
  if (!res.ok) { const body = await res.text(); if (res.status === 400 || res.status === 401) throw new AuthError(parseErr(body)); throw new Error(`Supabase ${res.status}: ${parseErr(body)}`); }
  return res.status === 204 ? null : res.json();
}
const parseErr = (b: string) => { try { const j = JSON.parse(b); return j.error_description || j.msg || j.message || b; } catch { return b; } };

async function refreshIfNeeded() {
  if (!tok || Date.now() / 1000 < tok.expires_at - 60) return;
  const r = await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: tok.refresh_token }) }, false);
  tok = { ...tok, access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at }; save();
}
function save() { try { tok ? localStorage.setItem(SKEY, JSON.stringify(tok)) : localStorage.removeItem(SKEY); } catch { /* ignore */ } }

export const supabaseStore: DataStore = {
  mode: 'supabase',
  async loadAll() {
    const out = {} as Db;
    await Promise.all(TABLES.map(async t => { const rows = await http(`/rest/v1/${t}?select=data`); (out as any)[t] = rows.map((r: any) => r.data); }));
    return out;
  },
  async insert(t, row) { await http(`/rest/v1/${t}`, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(keyCols(t, row)) }); return row; },
  async update(t, id, patch) {
    const [cur] = await http(`/rest/v1/${t}?id=eq.${encodeURIComponent(id)}&select=data`);
    const next = { ...(cur?.data || {}), ...patch };
    await http(`/rest/v1/${t}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(keyCols(t, next)) });
    return next as Row<typeof t>;
  },
  async remove(t, id) { await http(`/rest/v1/${t}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  async directory() { const rows = await http('/rest/v1/rpc/public_org_directory', { method: 'POST', body: '{}' }, false); return { orgs: rows }; },
  async signIn(username, password, kind, orgId) {
    const r = await http('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: emailFor(username), password }) }, false);
    tok = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at, session: null as any };
    const [me] = await http(`/rest/v1/users?auth_uid=eq.${r.user.id}&select=data`);
    if (!me) { tok = null; throw new AuthError('Signed in, but no Saathi profile is linked to this login'); }
    const u = me.data as Row<'users'>;
    if (u.kind !== kind) { tok = null; throw new AuthError(`This is a ${u.kind} account`); }
    if (kind === 'staff' && orgId && u.orgId !== orgId) { tok = null; throw new AuthError('This account belongs to a different organisation'); }
    tok.session = { userId: u.id, username: u.username, name: u.displayName, kind: u.kind, orgId: u.orgId, deptId: u.deptId, roleKey: u.roleKey, patientId: u.patientId };
    save(); return tok.session;
  },
  async signOut() { try { await http('/auth/v1/logout', { method: 'POST' }); } catch { /* ignore */ } tok = null; save(); },
  async restore() { if (tok) return tok.session; try { const raw = localStorage.getItem(SKEY); if (raw) { tok = JSON.parse(raw); return tok!.session; } } catch { /* ignore */ } return null; },
  async createLogin(user, password) {
    // Service-role work happens server side in the `saathi-admin` edge function (never ship the service key to clients).
    await http('/functions/v1/saathi-admin', { method: 'POST', body: JSON.stringify({ action: 'create_user', email: emailFor(user.username), password, profile: user }) });
  },
};
