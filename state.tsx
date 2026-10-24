// App state: session + an in-memory copy of the rows this user may see + domain actions.
// Every clinical change goes through these actions so rules, alerts and the audit trail stay consistent.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { demoStore } from '../data/demoStore';
import { supabaseStore } from '../data/supabaseStore';
import { AuthError, DataStore, Db, Row } from '../data/store';
import type { AdverseEvent, Alert, AppUser, CheckResult, Dose, LabResult, Observation, Patient, Session, Table, Tier, Treatment } from '../data/types';
import { attribute } from '../engine/attribution';
import { buildPlan } from '../engine/plan';
import { combinedRules, evaluateAnswer, evaluateLab } from '../engine/rules';
import { redact } from '../engine/safety';
import { kb, type Check } from '../knowledge';
import { nowIso, today, uid } from '../lib/dates';

declare const __SAATHI_DATA_MODE__: string;
const MODE = typeof __SAATHI_DATA_MODE__ !== 'undefined' ? __SAATHI_DATA_MODE__ : 'demo';
export const store: DataStore = MODE === 'supabase' ? supabaseStore : demoStore;

export interface Toast { id: number; text: string; tone?: 'ok' | 'warn' }

function useAppState() {
  const [session, setSession] = useState<Session | null>(null);
  const [db, setDb] = useState<Db | null>(null);
  const [booting, setBooting] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dbRef = useRef<Db | null>(null); dbRef.current = db;

  const toast = useCallback((text: string, tone?: Toast['tone']) => { const id = Date.now() + Math.random(); setToasts(t => [...t, { id, text, tone }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200); }, []);
  const reload = useCallback(async () => { setDb(await store.loadAll()); }, []);

  useEffect(() => { (async () => { try { const s = await store.restore(); if (s) { setSession(s); await reload(); } } catch { /* signed out */ } setBooting(false); })(); }, [reload]);

  const signIn = async (username: string, password: string, kind: Session['kind'], orgId?: string) => { const s = await store.signIn(username, password, kind, orgId); setSession(s); await reload(); return s; };
  const signOut = async () => { await store.signOut(); setSession(null); setDb(null); };

  // ---- generic writes (keep local copy in sync) ----
  const put = async <T extends Table>(t: T, row: Row<T>) => { await store.insert(t, row); setDb(d => d && ({ ...d, [t]: [...(d[t] as any[]), row] })); return row; };
  const patch = async <T extends Table>(t: T, id: string, p: Partial<Row<T>>) => { const next = await store.update(t, id, p); setDb(d => d && ({ ...d, [t]: (d[t] as any[]).map(r => (r.id === id ? { ...r, ...p } : r)) })); return next; };
  const del = async <T extends Table>(t: T, id: string) => { await store.remove(t, id); setDb(d => d && ({ ...d, [t]: (d[t] as any[]).filter(r => r.id !== id) })); };
  const audit = (action: string, detail: string, patientId?: string) => session && put('audit', { id: uid('au'), at: nowIso(), actor: session.username, action, detail: redact(detail), orgId: session.orgId, patientId });
  const actor = () => session ? `${session.kind}:${session.name}` : 'system';

  const raiseAlert = async (patientId: string, tier: Tier, kind: string, title: string, evidence: string) => {
    if (tier === 'green') return;
    const d = dbRef.current!;
    if (d.alerts.some(a => a.patientId === patientId && a.title === title && a.status !== 'resolved' && a.createdAt.slice(0, 10) === today())) return;
    const a: Alert = { id: uid('al'), patientId, tier, kind, title, evidence, status: 'open', createdAt: nowIso() };
    await put('alerts', a);
  };

  const suggestAE = async (patientId: string, term: string, grade: number, source: AdverseEvent['source'], signal: { checkId?: string; labCode?: string }) => {
    if (grade < 2) return;
    const d = dbRef.current!;
    if (d.adverse_events.some(a => a.patientId === patientId && a.term === term && a.status !== 'resolved')) return;
    const sus = attribute({ ...signal, term }, today(), d.treatments.filter(t => t.patientId === patientId));
    await put('adverse_events', { id: uid('ae'), patientId, term, grade: Math.min(5, Math.max(1, grade)) as AdverseEvent['grade'], onset: today(), status: 'open', suspected: sus.slice(0, 2).map(s => s.treatmentId), attribution: sus[0]?.attribution || 'unknown', attributionWhy: sus[0]?.why.join('; ') || 'No matching treatment', source, serious: grade >= 3, createdAt: nowIso() });
  };

  const runCombined = async (patientId: string) => {
    const d = dbRef.current!; const tx = d.treatments.filter(t => t.patientId === patientId && t.status === 'active');
    const tags = new Set(tx.flatMap(t => [kb.get(t.ref), ...(kb.get(t.ref)?.components || []).map(k => kb.get(k))]).flatMap(p => p?.tags || []));
    const found = combinedRules({ recent: d.check_results.filter(c => c.patientId === patientId && c.date >= today()), labs: d.labs.filter(l => l.patientId === patientId), onChemo: tags.has('chemo'), onAnticoag: tags.has('anticoagulant'), temps: d.observations.filter(o => o.patientId === patientId && o.type === 'temp' && o.date === today()).map(o => o.value) });
    for (const f of found) await raiseAlert(patientId, f.tier, 'combined', f.title, f.evidence);
  };

  const actions = {
    reload, toast, put, patch, del, audit,
    async answerCheck(patientId: string, check: Check, answer: string, value?: number) {
      const { tier, grade } = evaluateAnswer(check, answer);
      const r: CheckResult = { id: uid('chk'), patientId, checkId: check.id, date: today(), answer, value, grade, tier, links: [], by: actor(), at: nowIso(), ask: check.ask || check.label };
      await put('check_results', r);
      if (tier !== 'green') await raiseAlert(patientId, tier, 'check-in', `${check.label}: ${answer}`, `Reported ${answer} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
      await suggestAE(patientId, check.term || check.label, grade, session?.kind === 'carer' ? 'carer' : 'check-in', { checkId: check.id });
      await runCombined(patientId);
      return { tier };
    },
    async markDose(dose: Dose, status: Dose['status'], reason?: string) {
      await patch('doses', dose.id, { status, reason, events: [...dose.events, { status, by: actor(), at: nowIso() }] });
      audit('dose.' + status, `${dose.time}`, dose.patientId);
    },
    /** The dose row for a scheduled time, created as 'due' if it does not exist yet. */
    async doseFor(patientId: string, treatmentId: string, date: string, time: string): Promise<Dose> {
      const found = dbRef.current!.doses.find(o => o.treatmentId === treatmentId && o.date === date && o.time === time);
      if (found) return found;
      const row: Dose = { id: uid('dose'), patientId, treatmentId, date, time, status: 'due', events: [] };
      await put('doses', row); return row;
    },
    async addObservation(o: Omit<Observation, 'id'>) { const row = { ...o, id: uid('ob') }; await put('observations', row); if (o.type === 'temp') await runCombined(o.patientId); return row; },
    async addLab(l: Omit<LabResult, 'id'>) {
      const row = { ...l, id: uid('lab') } as LabResult; await put('labs', row);
      if (row.status === 'confirmed') await actions.processLab(row);
      else await raiseAlert(row.patientId, 'amber', 'lab', `Uploaded ${row.name} result needs confirmation`, `${row.value} ${row.unit} from ${row.source}`);
      return row;
    },
    async processLab(l: LabResult) {
      const prev = dbRef.current!.labs.filter(x => x.patientId === l.patientId && x.code === l.code && x.id !== l.id && x.status === 'confirmed').sort((a, b) => a.date.localeCompare(b.date))[0];
      const ev = evaluateLab(l, l.code === 'LVEF' || l.code === 'creatinine' ? prev?.value : undefined);
      if (ev.tier !== 'green') await raiseAlert(l.patientId, ev.tier, 'lab', `${l.name} ${l.value} ${l.unit}`.trim(), ev.rule);
      if (ev.grade != null && ev.grade >= 2) await suggestAE(l.patientId, ev.term, ev.grade, 'lab', { labCode: l.code });
      await runCombined(l.patientId);
    },
    async confirmLab(l: LabResult) { await patch('labs', l.id, { status: 'confirmed', confirmedBy: session!.name }); audit('lab.confirm', `${l.code}`, l.patientId); await actions.processLab({ ...l, status: 'confirmed' }); },
    async message(patientId: string, text: string, via?: string) {
      const me = dbRef.current!.users.find(u => u.id === session!.userId);
      const role = session!.kind === 'staff' ? (dbRef.current!.roles.find(r => r.key === session!.roleKey && r.orgId === session!.orgId)?.label || 'Care team') : session!.kind === 'carer' ? `Carer` : 'Patient';
      await put('messages', { id: uid('msg'), patientId, fromUserId: session!.userId, fromName: me?.displayName || session!.name, fromKind: session!.kind, fromRole: role, text, at: nowIso(), via });
    },
    async alertStatus(a: Alert, status: Alert['status'], note?: string) { await patch('alerts', a.id, { status, ownerId: session!.userId, ackAt: nowIso(), note }); audit('alert.' + status, a.title, a.patientId); },
    async addTreatment(t: Omit<Treatment, 'id' | 'version'>) { const row = { ...t, id: uid('tx'), version: 1, signedAt: nowIso() } as Treatment; await put('treatments', row); audit('treatment.add', `${t.ref}`, t.patientId); return row; },
    /** Clinical rows are versioned: the previous version is kept in the audit trail. */
    async reviseTreatment(t: Treatment, p: Partial<Treatment>) { await put('audit', { id: uid('au'), at: nowIso(), actor: session!.username, action: 'treatment.version', detail: JSON.stringify(t), patientId: t.patientId, orgId: session!.orgId }); await patch('treatments', t.id, { ...p, version: t.version + 1, signedBy: session!.name, signedAt: nowIso() }); },
    async reviewAE(a: AdverseEvent, p: Partial<AdverseEvent>) { await patch('adverse_events', a.id, { ...p, reviewedBy: session!.name }); audit('ae.review', a.term, a.patientId); },
    async createUser(u: Omit<AppUser, 'id' | 'createdAt' | 'active'>, password: string) { const row: AppUser = { ...u, id: uid('usr'), createdAt: nowIso(), active: true }; await store.createLogin(row, password); setDb(d => d && ({ ...d, users: [...d.users, { ...row, passwordHash: undefined }] })); audit('user.create', `${u.username} (${u.kind})`); return row; },
    async registerPatient(p: Omit<Patient, 'id' | 'createdAt'>, login?: { username: string; password: string }) {
      const row: Patient = { ...p, id: uid('pat'), createdAt: nowIso() }; await put('patients', row);
      if (login) await actions.createUser({ username: login.username, displayName: p.name, kind: 'patient', patientId: row.id, phone: p.phone }, login.password);
      audit('patient.register', row.id, row.id); return row;
    },
    plan(patientId: string) { const d = dbRef.current!; const p = d.patients.find(x => x.id === patientId); return buildPlan(p || { conditions: [] }, d.treatments.filter(t => t.patientId === patientId)); },
  };
  return { session, db, booting, toasts, signIn, signOut, actions, mode: store.mode };
}

type Ctx = ReturnType<typeof useAppState>;
const AppCtx = createContext<Ctx | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) { const v = useAppState(); return <AppCtx.Provider value={v}>{children}</AppCtx.Provider>; }
export function useApp() { const c = useContext(AppCtx); if (!c) throw new Error('no app'); return c; }
export function useDb(): Db { return useApp().db!; }
export { AuthError };

/** Convenience selectors */
export function usePatient(id?: string) {
  const db = useDb();
  return useMemo(() => {
    const p = db.patients.find(x => x.id === id); if (!p) return null;
    const by = <T extends { patientId: string }>(rows: T[]) => rows.filter(r => r.patientId === p.id);
    return { p, treatments: by(db.treatments), doses: by(db.doses), checks: by(db.check_results), obs: by(db.observations), labs: by(db.labs), aes: by(db.adverse_events), alerts: by(db.alerts), messages: by(db.messages), pathways: by(db.pathways),
      carers: db.carer_links.filter(l => l.patientId === p.id).map(l => ({ link: l, user: db.users.find(u => u.id === l.userId) })).sort((a, b) => a.link.priority - b.link.priority),
      team: db.care_team.filter(t => t.patientId === p.id).map(t => ({ link: t, user: db.users.find(u => u.id === t.userId) })), orgs: db.orgs.filter(o => p.orgIds.includes(o.id)) };
  }, [db, id]);
}
