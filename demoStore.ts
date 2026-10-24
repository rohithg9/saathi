// Offline demo store: synthetic data in localStorage. Passwords are SHA-256 hashed (demo only;
// production uses Supabase Auth). Falls back to memory if storage is unavailable.

import { buildSeed } from './seed';
import { AuthError, DataStore, Db, Row, TABLES, sha256 } from './store';
import type { Session, Table } from './types';

const KEY = 'saathi.demo.db.v2';
const SKEY = 'saathi.demo.session';
let mem: Db | null = null;
let memSession: Session | null = null;

const safe = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* memory only */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

async function db(): Promise<Db> {
  if (mem) return mem;
  const raw = safe.get(KEY);
  if (raw) { try { mem = JSON.parse(raw); } catch { mem = null; } }
  if (!mem || TABLES.some(t => !Array.isArray((mem as any)[t]))) { mem = await buildSeed(); persist(); }
  return mem!;
}
function persist() { if (mem) safe.set(KEY, JSON.stringify(mem)); }

/** What a session may see. Mirrors the Supabase RLS policies in supabase/migrations. */
export function visible(all: Db, s: Session): Db {
  if (s.kind === 'platform') return all;
  const out = {} as Db;
  let patientIds: Set<string>;
  if (s.kind === 'patient') patientIds = new Set(s.patientId ? [s.patientId] : []);
  else if (s.kind === 'carer') patientIds = new Set(all.carer_links.filter(l => l.userId === s.userId && l.status === 'active').map(l => l.patientId));
  else patientIds = new Set(all.patients.filter(p => s.orgId && p.orgIds.includes(s.orgId)).map(p => p.id));
  const orgIds = new Set(s.kind === 'staff' ? [s.orgId!] : all.patients.filter(p => patientIds.has(p.id)).flatMap(p => p.orgIds));
  for (const t of TABLES) {
    const rows = (all as any)[t] as any[];
    (out as any)[t] = rows.filter(r => {
      if (t === 'users') return r.id === s.userId || (r.kind === 'staff' && orgIds.has(r.orgId)) || (r.kind === 'patient' && patientIds.has(r.patientId)) || (r.kind === 'carer' && all.carer_links.some(l => l.userId === r.id && patientIds.has(l.patientId)));
      if (t === 'patients') return patientIds.has(r.id);
      if ('patientId' in r) return patientIds.has(r.patientId);
      if ('orgId' in r) return orgIds.has(r.orgId);
      if (t === 'orgs') return orgIds.has(r.id);
      return s.kind === 'staff';
    });
  }
  out.users = out.users.map(u => ({ ...u, passwordHash: undefined }));
  return out;
}

export const demoStore: DataStore = {
  mode: 'demo',
  async loadAll() { const s = await this.restore(); if (!s) throw new AuthError('Not signed in'); return visible(structuredClone(await db()), s); },
  async insert(t, row) { const d = await db(); (d[t] as any[]).push(row); persist(); return row; },
  async update(t, id, patch) {
    const d = await db(); const rows = d[t] as any[]; const i = rows.findIndex(r => r.id === id);
    if (i < 0) throw new Error(`${t}/${id} not found`);
    if (t === 'users' && (patch as any).passwordHash === undefined) delete (patch as any).passwordHash;
    rows[i] = { ...rows[i], ...patch }; persist(); return rows[i];
  },
  async remove(t, id) { const d = await db(); (d as any)[t] = (d[t] as any[]).filter(r => r.id !== id); persist(); },
  async directory() {
    const d = await db();
    const orgName = (id?: string) => d.orgs.find(o => o.id === id)?.name;
    return {
      orgs: d.orgs,
      demoAccounts: d.users.filter(u => u.active).map(u => ({ username: u.username, name: u.displayName, kind: u.kind, org: orgName(u.orgId), role: d.roles.find(r => r.orgId === u.orgId && r.key === u.roleKey)?.label })),
    };
  },
  async signIn(username, password, kind, orgId) {
    const d = await db();
    const u = d.users.find(x => x.username.toLowerCase() === username.trim().toLowerCase());
    if (!u || !u.active) throw new AuthError('No account with that username');
    if (u.kind !== kind) throw new AuthError(`This account is a ${u.kind} account. Choose “${label(u.kind)}” on the first screen.`);
    if (kind === 'staff' && orgId && u.orgId !== orgId) throw new AuthError('This account belongs to a different organisation');
    if ((await sha256(password)) !== u.passwordHash) throw new AuthError('Wrong password');
    const s: Session = { userId: u.id, username: u.username, name: u.displayName, kind: u.kind, orgId: u.orgId, deptId: u.deptId, roleKey: u.roleKey, patientId: u.patientId };
    memSession = s; safe.set(SKEY, JSON.stringify(s));
    d.audit.push({ id: `au_${Date.now()}`, at: new Date().toISOString(), actor: u.username, action: 'sign_in', detail: kind, orgId: u.orgId });
    persist();
    return s;
  },
  async signOut() { memSession = null; safe.del(SKEY); },
  async restore() {
    if (memSession) return memSession;
    const raw = safe.get(SKEY); if (!raw) return null;
    try { memSession = JSON.parse(raw); return memSession; } catch { return null; }
  },
  async createLogin(user, password) {
    const d = await db();
    if (d.users.some(u => u.username.toLowerCase() === user.username.toLowerCase())) throw new Error('Username already taken');
    d.users.push({ ...user, passwordHash: await sha256(password) }); persist();
  },
  async resetDemo() { mem = await buildSeed(); persist(); },
};

const label = (k: string) => ({ patient: 'I am a patient', carer: 'I care for someone', staff: 'Care team', platform: 'Platform admin' } as any)[k] || k;
export type { Row, Table };
