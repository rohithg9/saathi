import React, { useMemo, useState } from 'react';
import { useApp, useDb } from '../../app/state';
import type { Alert, Cap, Patient, Tier } from '../../data/types';
import { parseQuery, Table_ } from '../../engine/analytics';
import { assignee, onRota, tasksOn } from '../../engine/schedule';
import { adherence } from '../../engine/rules';
import { kb } from '../../knowledge';
import { addDays, fmt, nowIso, today, uid } from '../../lib/dates';
import { listen, speak } from '../../native/bridge';
import { Avatar, Empty, Icon, Modal, Orb, Seg, Table, TierPill, age, fmtTime } from '../common/ui';
import { DrugLibrary } from './DrugLibrary';
import { OrgAdmin, PlatformAdmin } from './OrgAdmin';
import { PatientDetail, RegisterPatient } from './PatientDetail';
import { Pathways } from './Pathways';

type View = 'overview' | 'patients' | 'tasks' | 'alerts' | 'pathways' | 'drugs' | 'ask' | 'org' | 'audit' | 'platform';

export function useCaps(): Set<Cap> {
  const { session } = useApp(); const db = useDb();
  if (session!.kind === 'platform') return new Set(['sign', 'monitor', 'message', 'protocol', 'tasks', 'register', 'org', 'users', 'analytics', 'drugs']);
  return new Set(db.roles.find(r => r.orgId === session!.orgId && r.key === session!.roleKey)?.caps || []);
}
export const patientTier = (alerts: Alert[], pid: string): Tier => { const a = alerts.filter(x => x.patientId === pid && x.status !== 'resolved'); return a.some(x => x.tier === 'red') ? 'red' : a.some(x => x.tier === 'amber') ? 'amber' : 'green'; };

export function StaffApp() {
  const { session, signOut, mode } = useApp(); const db = useDb(); const caps = useCaps();
  const [view, setView] = useState<View>(session!.kind === 'platform' ? 'platform' : 'overview');
  const [pid, setPid] = useState<string | null>(null);
  const org = db.orgs.find(o => o.id === session!.orgId);
  const role = db.roles.find(r => r.orgId === session!.orgId && r.key === session!.roleKey);
  const openAlerts = db.alerts.filter(a => a.status === 'open').length;
  const NAV: [View, string, string, boolean][] = [
    ['overview', 'grid', 'Overview', true], ['patients', 'users', 'Patients', true], ['alerts', 'alert', 'Alerts', caps.has('monitor')], ['tasks', 'task', 'Tasks', true],
    ['pathways', 'flow', 'Pathways', caps.has('protocol') || caps.has('sign')], ['drugs', 'pill', 'Drug library', true], ['ask', 'mic', 'Ask Saathi', caps.has('analytics') || caps.has('monitor')],
    ['org', 'building', 'Organisation', session!.kind === 'staff' && (caps.has('org') || caps.has('users'))], ['audit', 'shield', 'Audit', caps.has('org')], ['platform', 'settings', 'Platform', session!.kind === 'platform'],
  ];
  const nav = NAV.filter(n => n[3]);
  const go = (v: View) => { setView(v); setPid(null); window.scrollTo(0, 0); };
  const mobileNav = nav.filter(n => ['overview', 'patients', 'alerts', 'tasks', 'ask'].includes(n[0]));
  const [more, setMore] = useState(false);
  return <div className="staff">
    <aside className="side">
      <div className="brand"><Orb size={34} /><div><b>Saathi</b><div className="tiny muted ellipsis" style={{ maxWidth: 160 }}>{org?.name || 'Platform'}</div></div></div>
      {nav.map(([k, ic, l]) => <button key={k} className={`nav ${view === k ? 'on' : ''}`} onClick={() => go(k)}><Icon n={ic} />{l}{k === 'alerts' && openAlerts > 0 && <span className="cnt">{openAlerts}</span>}</button>)}
      <div style={{ marginTop: 'auto', paddingTop: 16 }}><div className="row" style={{ padding: '0 8px 8px' }}><Avatar name={session!.name} size={32} /><div className="grow"><div className="small b ellipsis">{session!.name}</div><div className="tiny muted ellipsis">{role?.label || session!.kind}</div></div></div>
        <button className="nav" onClick={signOut}><Icon n="logout" />Sign out</button>{mode === 'demo' && <div className="tiny muted" style={{ padding: '4px 10px' }}>Demo mode · synthetic data</div>}</div>
    </aside>
    <main className="main">
      {pid ? <PatientDetail patientId={pid} onBack={() => setPid(null)} /> : <>
        {view === 'overview' && <Overview onPatient={setPid} onView={go} />}
        {view === 'patients' && <Patients onPatient={setPid} />}
        {view === 'alerts' && <Alerts onPatient={setPid} />}
        {view === 'tasks' && <Tasks onPatient={setPid} />}
        {view === 'pathways' && <Pathways />}
        {view === 'drugs' && <DrugLibrary />}
        {view === 'ask' && <Ask onPatient={setPid} />}
        {view === 'org' && <OrgAdmin />}
        {view === 'audit' && <Audit />}
        {view === 'platform' && <PlatformAdmin />}
      </>}
    </main>
    <nav className="tabbar hide-d"><div className="in">{mobileNav.map(([k, ic, l]) => <button key={k} className={`tab ${view === k && !pid ? 'on' : ''}`} onClick={() => go(k)}><Icon n={ic} />{k === 'alerts' && openAlerts > 0 && <span className="badge">{openAlerts}</span>}<span>{l}</span></button>)}
      <button className="tab" onClick={() => setMore(true)}><Icon n="list" /><span>More</span></button></div></nav>
    {more && <Modal title="More" onClose={() => setMore(false)}><div className="list">{nav.filter(n => !mobileNav.includes(n)).map(([k, ic, l]) => <div key={k} className="li click" onClick={() => { go(k); setMore(false); }}><Icon n={ic} /><b className="grow">{l}</b><span className="chev">›</span></div>)}
      <div className="li click" onClick={signOut}><Icon n="logout" /><b className="grow">Sign out</b></div></div></Modal>}
  </div>;
}

export const Top = ({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) => <div className="topbar"><div><h1>{title}</h1>{sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}</div><div className="row wrap">{children}</div></div>;

// ---------------- overview ----------------
function Overview({ onPatient, onView }: { onPatient: (id: string) => void; onView: (v: View) => void }) {
  const db = useDb(); const { session } = useApp();
  const red = db.alerts.filter(a => a.status === 'open' && a.tier === 'red'); const amber = db.alerts.filter(a => a.status === 'open' && a.tier === 'amber');
  const myTasks = useMyTasks();
  const adh = adherence(db.doses.filter(d => d.date >= addDays(today(), -7) && d.date < today()));
  const aes = db.adverse_events.filter(a => a.status !== 'resolved');
  const onDuty = db.users.filter(u => u.kind === 'staff' && u.orgId === session!.orgId && onRota(u, today()));
  return <>
    <Top title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${session!.name.replace(/\s*\(.*\)/, '').split(' ').slice(0, 2).join(' ')}`} sub={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} />
    <div className="grid g4">
      <div className="card kpi" onClick={() => onView('alerts')} style={{ cursor: 'pointer' }}><span className="l">Urgent alerts</span><span className="v" style={{ color: red.length ? 'var(--red)' : undefined }}>{red.length}</span><span className="tiny muted">{amber.length} for review</span></div>
      <div className="card kpi" onClick={() => onView('patients')} style={{ cursor: 'pointer' }}><span className="l">Patients</span><span className="v">{db.patients.length}</span><span className="tiny muted">{db.patients.filter(p => patientTier(db.alerts, p.id) !== 'green').length} need attention</span></div>
      <div className="card kpi"><span className="l">Medicine adherence (7d)</span><span className="v">{adh.pct ?? '—'}%</span><span className="tiny muted">{adh.noAnswer} unanswered · {adh.skipped} skipped</span></div>
      <div className="card kpi"><span className="l">Open side effects</span><span className="v">{aes.length}</span><span className="tiny muted">{aes.filter(a => a.grade >= 3).length} grade ≥3</span></div>
    </div>
    <div className="grid g2 stack-m" style={{ marginTop: 12, alignItems: 'start' }}>
      <div className="card"><div className="spread"><h2>Needs attention</h2><button className="btn ghost sm" onClick={() => onView('alerts')}>All alerts</button></div>
        <div className="list" style={{ marginTop: 6 }}>{[...red, ...amber].slice(0, 7).map(a => <AlertRow key={a.id} a={a} onPatient={onPatient} />)}{!red.length && !amber.length && <Empty>No open alerts 🎉</Empty>}</div></div>
      <div className="card"><div className="spread"><h2>My tasks today</h2><button className="btn ghost sm" onClick={() => onView('tasks')}>All tasks</button></div>
        <div className="list" style={{ marginTop: 6 }}>{myTasks.slice(0, 7).map(t => <TaskRow key={t.key} t={t} onPatient={onPatient} />)}{!myTasks.length && <Empty>No pathway tasks for you today</Empty>}</div></div>
    </div>
    <div className="card" style={{ marginTop: 12 }}><h2>On duty today</h2><div className="row wrap" style={{ marginTop: 10, gap: 14 }}>{onDuty.map(u => { const r = u.rota![(new Date().getDay() + 6) % 7]; return <div key={u.id} className="row" style={{ gap: 8 }}><Avatar name={u.displayName} size={32} /><div><div className="small b">{u.displayName}</div><div className="tiny muted">{db.roles.find(x => x.key === u.roleKey && x.orgId === u.orgId)?.label} · {r.start}–{r.end}{r.onCall ? ' · on call' : ''}</div></div></div>; })}{!onDuty.length && <span className="muted small">Nobody on the rota today</span>}</div></div>
  </>;
}

export function AlertRow({ a, onPatient }: { a: Alert; onPatient?: (id: string) => void }) {
  const db = useDb(); const { actions } = useApp(); const p = db.patients.find(x => x.id === a.patientId);
  const owner = db.users.find(u => u.id === a.ownerId);
  return <div className="li"><span className={`dot ${a.tier}`} style={{ width: 11, height: 11 }} /><div className="grow" onClick={() => onPatient?.(a.patientId)} style={{ cursor: onPatient ? 'pointer' : 'default' }}>
    <b className="small">{p?.name}</b> <span className="small">· {a.title}</span><div className="tiny muted">{a.evidence}</div><div className="tiny muted">{fmtTime(a.createdAt)}{a.status === 'acknowledged' ? ` · handled by ${owner?.displayName || '—'}` : ''}</div></div>
    {a.status === 'open' && <button className="btn sm soft" onClick={() => actions.alertStatus(a, 'acknowledged')}>I'll take it</button>}
    {a.status === 'acknowledged' && <button className="btn sm" onClick={() => actions.alertStatus(a, 'resolved')}>Resolve</button>}
  </div>;
}

// ---------------- patients ----------------
function Patients({ onPatient }: { onPatient: (id: string) => void }) {
  const db = useDb(); const caps = useCaps(); const [q, setQ] = useState(''); const [dept, setDept] = useState(''); const [reg, setReg] = useState(false);
  const rank = { red: 0, amber: 1, green: 2 };
  const list = db.patients.filter(p => (!q || p.name.toLowerCase().includes(q.toLowerCase()) || db.treatments.some(t => t.patientId === p.id && t.label.toLowerCase().includes(q.toLowerCase()))) && (!dept || p.primaryDeptId === dept))
    .sort((a, b) => rank[patientTier(db.alerts, a.id)] - rank[patientTier(db.alerts, b.id)]);
  return <>
    <Top title="Patients" sub={`${db.patients.length} under your organisation`}>{caps.has('register') && <button className="btn primary" onClick={() => setReg(true)}><Icon n="plus" s={18} /> Register patient</button>}</Top>
    <div className="row wrap" style={{ marginBottom: 12 }}><input className="input" style={{ maxWidth: 320 }} placeholder="Search name or treatment" value={q} onChange={e => setQ(e.target.value)} />
      <select className="input" style={{ maxWidth: 240 }} value={dept} onChange={e => setDept(e.target.value)}><option value="">All departments</option>{db.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
    <div className="card"><Table columns={['', 'Patient', 'Treatments', 'Day / cycle', 'Adherence 7d', 'Alerts']} onRow={i => onPatient(list[i].id)} rows={list.map(p => {
      const tx = db.treatments.filter(t => t.patientId === p.id && t.status === 'active'); const main = tx.find(t => t.kind !== 'drug') || tx[0];
      const adh = adherence(db.doses.filter(d => d.patientId === p.id && d.date >= addDays(today(), -7) && d.date < today()));
      const al = db.alerts.filter(a => a.patientId === p.id && a.status !== 'resolved');
      const day = main ? Math.round((Date.parse(today()) - Date.parse(main.startDate)) / 864e5) : null;
      return [<Avatar name={p.name} size={34} />, <div><b>{p.name}</b><div className="tiny muted">{age(p.dob)} y · {p.sex} · {db.departments.find(d => d.id === p.primaryDeptId)?.name}</div></div>,
        <div className="small">{tx.slice(0, 3).map(t => kb.get(t.ref)?.name || t.label).join(', ')}{tx.length > 3 ? ` +${tx.length - 3}` : ''}</div>,
        <span className="small num">{main?.cycle ? `Cycle ${Math.floor((day || 0) / main.cycle.lengthDays) + 1}` : day != null && day < 400 ? `Day ${day}` : '—'}</span>,
        <span className="num">{adh.pct == null ? '—' : `${adh.pct}%`}</span>, al.length ? <TierPill t={patientTier(db.alerts, p.id)} label={`${al.length}`} /> : <TierPill t="green" />];
    })} /></div>
    {reg && <RegisterPatient onClose={() => setReg(false)} onDone={id => { setReg(false); onPatient(id); }} />}
  </>;
}

// ---------------- alerts ----------------
function Alerts({ onPatient }: { onPatient: (id: string) => void }) {
  const db = useDb(); const [f, setF] = useState<'open' | 'acknowledged' | 'resolved'>('open');
  const list = db.alerts.filter(a => a.status === f).sort((a, b) => (a.tier === 'red' ? 0 : 1) - (b.tier === 'red' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt));
  return <><Top title="Alerts" sub="Tiers come from signed clinical rules, never from AI"><Seg value={f} options={[['open', 'Open'], ['acknowledged', 'In progress'], ['resolved', 'Resolved']]} onChange={setF} /></Top>
    <div className="card"><div className="list">{list.map(a => <AlertRow key={a.id} a={a} onPatient={onPatient} />)}{!list.length && <Empty>No alerts here</Empty>}</div></div></>;
}

// ---------------- tasks (pathways × rota) ----------------
type Task = ReturnType<typeof tasksOn>[0] & { assignee?: string; assigneeId?: string; cover: boolean; reason: string; patient?: Patient; done: boolean };
function useTasks(date: string): Task[] {
  const db = useDb(); const staff = db.users.filter(u => u.kind === 'staff');
  const keysFor = (orgId: string) => (w: string) => db.roles.filter(r => r.orgId === orgId && r.does.includes(w as any)).map(r => r.key);
  const done = new Set(db.tasks_done.map(t => t.key));
  return useMemo(() => tasksOn(db.pathways, date).filter(t => !['patient', 'carer'].includes(t.who)).map(t => {
    const p = db.patients.find(x => x.id === t.patientId); const team = db.care_team.filter(c => c.patientId === t.patientId).map(c => c.userId);
    const orgId = db.protocols.find(pr => pr.id === db.pathways.find(pw => pw.id === t.pathwayId)?.protocolId)?.orgId || p?.orgIds[0] || '';
    const pool = staff.filter(u => team.includes(u.id)).concat(staff.filter(u => !team.includes(u.id)));
    const a = assignee(pool, keysFor(orgId), t.who, date, [orgId]);
    return { ...t, assignee: a.user?.displayName, assigneeId: a.user?.id, cover: a.cover, reason: a.reason, patient: p, done: done.has(t.key) };
  }), [db, date]); // eslint-disable-line
}
function useMyTasks() { const { session } = useApp(); return useTasks(today()).filter(t => t.assigneeId === session!.userId && !t.done); }
function TaskRow({ t, onPatient }: { t: Task; onPatient: (id: string) => void }) {
  const { actions, session } = useApp();
  return <div className="li"><span className="tl-time">{t.time}</span><div className="grow" onClick={() => onPatient(t.patientId)} style={{ cursor: 'pointer' }}><b className="small" style={{ textDecoration: t.done ? 'line-through' : undefined }}>{t.item.title}</b>{t.item.flag && <span className="pill amber" style={{ marginLeft: 6 }}>Key step</span>}
    <div className="tiny muted">{t.patient?.name} · {t.who} · {t.assignee || 'Unassigned'}{t.cover ? ` (${t.reason})` : ''}</div></div>
    {!t.done ? <button className="btn sm ok" onClick={() => actions.put('tasks_done', { id: uid('td'), key: t.key, by: session!.name, at: nowIso() })}>Done</button> : <span className="check"><Icon n="check" s={16} w={3} /></span>}</div>;
}
function Tasks({ onPatient }: { onPatient: (id: string) => void }) {
  const { session } = useApp(); const [date, setDate] = useState(today()); const [who, setWho] = useState<'mine' | 'all'>('mine');
  const tasks = useTasks(date).filter(t => who === 'all' || t.assigneeId === session!.userId);
  return <><Top title="Tasks" sub="From active care pathways, assigned by role and today's rota (with leave cover)">
    <Seg value={who} options={[['mine', 'Mine'], ['all', 'Everyone']]} onChange={setWho} /><input type="date" className="input" style={{ width: 170 }} value={date} onChange={e => setDate(e.target.value)} /></Top>
    <div className="card"><div className="list">{tasks.map(t => <TaskRow key={t.key} t={t} onPatient={onPatient} />)}{!tasks.length && <Empty>No tasks on {fmt(date)}</Empty>}</div></div></>;
}

// ---------------- ask (voice analytics → predefined tools) ----------------
function Ask({ onPatient }: { onPatient: (id: string) => void }) {
  const db = useDb(); const { actions } = useApp(); const [q, setQ] = useState(''); const [res, setRes] = useState<{ q: string; t: Table_ | null; tool?: string }[]>([]); const [rec, setRec] = useState<null | (() => void)>(null);
  const run = (text: string) => {
    if (!text.trim()) return; setQ('');
    const m = parseQuery(text);
    if (!m) { setRes(r => [{ q: text, t: null }, ...r]); speak("I can show alerts, adherence, activity, abnormal labs, side effects, or patients on a treatment.", 'en'); return; }
    const t = m.tool.run(db, m.params); setRes(r => [{ q: text, t, tool: m.tool.name }, ...r]);
    speak(`${t.title}. ${t.rows.length} result${t.rows.length === 1 ? '' : 's'}.`, 'en');
  };
  const mic = () => { if (rec) { rec(); setRec(null); return; } const s = listen('en', (t, fin) => { setQ(t); if (fin) { setRec(null); run(t); } }); if (!s) actions.toast('Voice input not available in this browser'); else setRec(() => s); };
  return <><Top title="Ask Saathi" sub="Questions are mapped to predefined, permission-checked reports (no free-form database access)" />
    <form className="row" onSubmit={e => { e.preventDefault(); run(q); }}><input className="input grow" placeholder="e.g. Show patients on capecitabine in the last 6 months" value={q} onChange={e => setQ(e.target.value)} /><button type="button" className={`mic ${rec ? 'on' : ''}`} onClick={mic}><Icon n="mic" /></button></form>
    <div className="chips" style={{ margin: '12px 0' }}>{['Show red alerts', 'Who missed doses this week?', 'Patients who had a knee replacement in the last 6 months', 'Side effects on capecitabine', 'Abnormal labs last 14 days', 'Average steps this week'].map(s => <button key={s} className="chip" onClick={() => run(s)}>{s}</button>)}</div>
    {res.map((r, i) => <div className="card" key={i}><div className="small muted">“{r.q}”{r.tool ? ` → ${r.tool}` : ''}</div>{r.t ? <><h3 style={{ margin: '6px 0 8px' }}>{r.t.title}</h3><Table columns={r.t.columns} rows={r.t.rows.map(row => row.map(c => String(c)))} onRow={j => { const name = r.t!.rows[j][0]; const p = db.patients.find(x => x.name === name); if (p) onPatient(p.id); }} />{r.t.note && <div className="tiny muted" style={{ marginTop: 6 }}>{r.t.note}</div>}</> : <div style={{ marginTop: 6 }}>I didn't understand that one. Try one of the examples.</div>}</div>)}
  </>;
}

function Audit() {
  const db = useDb(); const rows = [...db.audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
  return <><Top title="Audit trail" sub="Every sign-in and clinical change. Identifiers are redacted." /><div className="card"><Table columns={['When', 'Who', 'Action', 'Detail']} rows={rows.map(a => [fmtTime(a.at), a.actor, a.action, <span className="small ellipsis" style={{ display: 'block', maxWidth: 420 }}>{a.action === 'treatment.version' ? 'Previous version saved' : a.detail}</span>])} /></div></>;
}
