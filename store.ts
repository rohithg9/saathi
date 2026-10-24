// DataStore: one interface, two back ends (offline demo in the browser, or Supabase).
// The UI talks to `repo` (an in-memory cache over the active store) and never to SQL.

import type { DbShape, Session, Table } from './types';

export type Row<T extends Table> = DbShape[T];
export type Db = { [T in Table]: Row<T>[] };
export const TABLES: Table[] = ['orgs', 'departments', 'roles', 'users', 'patients', 'carer_links', 'care_team', 'treatments', 'doses', 'check_results', 'observations', 'labs', 'adverse_events', 'alerts', 'messages', 'protocols', 'pathways', 'tasks_done', 'faq', 'audit', 'kb_reviews'];

export interface DataStore {
  mode: 'demo' | 'supabase';
  /** Load every row the signed-in user is allowed to see (RLS on Supabase; role filter in demo). */
  loadAll(): Promise<Db>;
  insert<T extends Table>(t: T, row: Row<T>): Promise<Row<T>>;
  update<T extends Table>(t: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>>;
  remove<T extends Table>(t: T, id: string): Promise<void>;
  /** Directory used by the login screen: org list and (demo only) the demo accounts. */
  directory(): Promise<{ orgs: Row<'orgs'>[]; demoAccounts?: { username: string; name: string; kind: string; org?: string; role?: string }[] }>;
  signIn(username: string, password: string, kind: Session['kind'], orgId?: string): Promise<Session>;
  signOut(): Promise<void>;
  restore(): Promise<Session | null>;
  /** Create a login for a new user (admin action). Supabase: via the `saathi-admin` edge function. */
  createLogin(user: Row<'users'>, password: string): Promise<void>;
  resetDemo?(): Promise<void>;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export class AuthError extends Error {}
