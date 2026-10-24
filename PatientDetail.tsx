import React, { useMemo, useState } from 'react';
import { useApp, useDb, usePatient } from '../../app/state';
import type { AdverseEvent, OutcomeTarget, Patient, Treatment } from '../../data/types';
import { attribute } from '../../engine/attribution';
import { evaluateOutcome, OUTCOME_LABEL } from '../../engine/outcomes';
import { cycleDay, dueChecks, labsDue } from '../../engine/plan';
import { adherence, evaluateLab } from '../../engine/rules';
import { kb, Profile, Schedule } from '../../knowledge';
import { addDays, daysBetween, fmt, today, uid } from '../../lib/dates';
import { Avatar, Draft, Empty, Field, Icon, Modal, Seg, Table, TierPill, age, fmtTime } from '../common/ui';
import { HealthView, LabsList, Thread } from '../patient/shared';
import { patientTier, Top, useCaps, AlertRow } from './StaffApp';

type T = 'summary' | 'treatments' | 'effects' | 'plan' | 'labs' | 'health' | 'messages' | 'pathway' | 'team';

export function PatientDetail({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const P = usePatient(patientId); const db = useDb(); const [tab, setTab] = useState<T>('summary');
  if (!P) return <Empty>Patient not found</Empty>;
  const { p } = P; const tier = patientTier(db.alerts, p.id);
  return <>
    <button className="btn ghost sm" onClick={onBack}><Icon n="back" s={18} /> Patients</button>
    <div className="card" style={{ marginTop: 8 }}><div className="row wrap" style={{ gap: 14 }}><Avatar name={p.name} size={54} /><div className="grow"><div className="row wrap"><h1 style={{ fontSize: 26 }}>{p.name}</h1><TierPill t={tier} /></div>
      <div className="small muted">{age(p.dob)} y · {p.sex} · {p.bloodGroup || 'blood group —'} · {p.phone} · speaks {({ en: 'English', hi: 'Hindi', kn: 'Kannada', ta: 'Tamil' } as any)[p.lang]}</div>
      <div className="small" style={{ marginTop: 4 }}>{p.allergies.length ? <span style={{ color: 'var(--red)', fontWeight: 650 }}>Allergies: {p.allergies.map(a => `${a.substance} (${a.reaction})`).join(', ')}</span> : <span className="muted">No known allergies</span>}</div></div>
      <div className="small muted" style={{ textAlign: 'right' }}>{P.carers.map(c => <div key={c.link.id}>{c.user?.displayName} · {c.link.relation}{c.link.available ? '' : ' (busy)'}</div>)}</div></div></div>
    <div style={{ margin: '14px 0' }}><Seg value={tab} onChange={setTab} options={[['summary', 'Summary'], ['treatments', 'Treatments & outcomes'], ['effects', 'Side effects'], ['plan', 'Monitoring plan'], ['labs', 'Labs'], ['health', 'Readings'], ['messages', 'Messages'], ['pathway', 'Pathway'], ['team', 'Team']]} /></div>
    {tab === 'summary' && <Summary patientId={p.id} />}
    {tab === 'treatments' && <Treatments patientId={p.id} />}
    {tab === 'effects' && <Effects patientId={p.id} />}
    {tab === 'plan' && <Plan patientId={p.id} />}
    {tab === 'labs' && <Labs patientId={p.id} />}
    {tab === 'health' && <HealthView patientId={p.id} clinician />}
    {tab === 'messages' && <div className="card"><Thread patientId={p.id} /></div>}
    {tab === 'pathway' && <PatientPathway patient={p} />}
    {tab === 'team' && <TeamTab patientId={p.id} />}
  </>;
}

function Summary({ patientId }: { patientId: string }) {
  const P = usePatient(patientId)!; const { actions } = useApp();
  const plan = useMemo(() => actions.plan(patientId), [P.treatments]); // eslint-disable-line
  const { due, deferred } = dueChecks(plan, today());
  const answered = P.checks.filter(c => c.date >= addDays(today(), -3)).sort((a, b) => b.at.localeCompare(a.at));
  const adh = adherence(P.doses.filter(d => d.date >= addDays(today(), -7) && d.date < today()));
  return <div className="grid g2 stack-m" style={{ alignItems: 'start' }}>
    <div className="col">
      <div className="card"><h3>Alerts</h3><div className="list">{P.alerts.filter(a => a.status !== 'resolved').map(a => <AlertRow key={a.id} a={a} />)}{!P.alerts.some(a => a.status !== 'resolved') && <Empty>No open alerts</Empty>}</div></div>
      <div className="card"><h3>Recent check-in answers</h3><div className="list">{answered.slice(0, 10).map(c => <div className="li" key={c.id}><span className={`dot ${c.tier}`} /><div className="grow"><div className="small">{c.ask}</div><div className="tiny muted">{fmtTime(c.at)} · {c.by.split(':')[0]}</div></div><b className="small">{c.answer}</b></div>)}{!answered.length && <Empty>No answers in the last 3 days</Empty>}</div></div>
    </div>
    <div className="col">
      <div className="card"><h3>Adherence · 7 days</h3><div className="grid g4" style={{ marginTop: 8 }}>{[['Taken', adh.taken], ['Skipped', adh.skipped], ['No answer', adh.noAnswer], ['Held', adh.held]].map(([l, v]) => <div key={l as string} className="kpi"><span className="v" style={{ fontSize: 22 }}>{v}</span><span className="l">{l}</span></div>)}</div><div className="tiny muted">“No answer” = reminder not acknowledged; kept separate from “skipped”.</div></div>
      <div className="card"><h3>Due today</h3><div className="list">{due.map(d => <div className="li" key={d.id}><div className="grow"><div className="small b">{d.check.label}</div><div className="tiny muted">{d.why}</div></div><span className="pill">{d.check.type}</span></div>)}{!due.length && <Empty>Nothing due today</Empty>}</div>{deferred.length > 0 && <div className="tiny muted">{deferred.length} more question(s) held back to avoid overloading the patient: {deferred.map(d => d.check.label).join(', ')}</div>}</div>
    </div></div>;
}

// ---------------- treatments & outcomes ----------------
function Treatments({ patientId }: { patientId: string }) {
  const P = usePatient(patientId)!; const caps = useCaps(); const [add, setAdd] = useState(false); const [edit, setEdit] = useState<Treatment | null>(null);
  const series = (m: string) => [...P.obs.filter(o => o.type === m).map(o => ({ date: o.date, value: o.value })), ...P.labs.filter(l => l.code === m && l.status === 'confirmed').map(l => ({ date: l.date, value: l.value }))];
  return <div className="col">
    <div className="spread"><div className="small muted">Expected effects come from the drug/procedure profile; numeric targets are set by the treating clinician.</div>{caps.has('sign') && <button className="btn primary" onClick={() => setAdd(true)}><Icon n="plus" s={18} /> Add treatment</button>}</div>
    {P.treatments.map(t => { const prof = kb.get(t.ref); const cd = cycleDay(t.startDate, today(), t.cycle);
      const targets: OutcomeTarget[] = [...(t.targets || []), ...(prof?.desired || []).filter(d => !(t.targets || []).some(x => x.measure === d.measure)).map(d => ({ ...d, source: 'knowledge' as const }))];
      return <div className="card" key={t.id}><div className="spread"><div><div className="row wrap"><b>{t.label}</b><span className={`pill ${t.status === 'active' ? 'green' : ''}`}>{t.status}</span>{prof?.status !== 'APPROVED' && <Draft />}</div>
        <div className="tiny muted">{prof?.class || t.kind} · started {fmt(t.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}{cd ? ` · cycle ${cd.cycle} day ${cd.day}` : ` · day ${daysBetween(t.startDate, today())}`}{t.times?.length ? ` · ${t.times.join(', ')}` : ''} · v{t.version} signed by {t.signedBy || '—'}</div></div>
        {caps.has('sign') && <button className="btn sm" onClick={() => setEdit(t)}><Icon n="edit" s={16} /> Edit</button>}</div>
        {targets.length > 0 && <Table columns={['Expected outcome', 'Target', 'Baseline → latest', 'By week', 'Status']} rows={targets.map(g => { const r = evaluateOutcome(g, series(g.measure), t.startDate, today()); const L = OUTCOME_LABEL[r.status];
          return [<div><div className="small b">{g.label}</div><div className="tiny muted">{g.source === 'clinician' ? 'Set by clinician' : 'From profile'}</div></div>, g.target != null ? `${g.target} ${g.unit || ''}` : <span className="muted small">not set</span>, r.baseline ? `${r.baseline.value} → ${r.latest!.value}${r.pct != null ? ` (${r.pct > 0 ? '+' : ''}${r.pct}%)` : ''}` : '—', g.windowWeeks ?? '—', <span className={`pill ${L.tone === 'grey' ? '' : L.tone}`}>{L.label}</span>]; })} />}
      </div>; })}
    {add && <AddTreatment patientId={patientId} onClose={() => setAdd(false)} />}
    {edit && <EditTreatment t={edit} onClose={() => setEdit(null)} />}
  </div>;
}

function AddTreatment({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { actions, session } = useApp(); const P = usePatient(patientId)!;
  const [q, setQ] = useState(''); const [prof, setProf] = useState<Profile | null>(null);
  const [f, setF] = useState({ label: '', dose: '', times: '08:00', start: today(), cycles: '6', food: '' });
  const allergy = prof && P.p.allergies.find(a => (prof.tags || []).some(t => a.substance.toLowerCase().includes(t)) || prof.name.toLowerCase().includes(a.substance.toLowerCase()));
  const save = async () => {
    if (!prof) return;
    const cycle = prof.kind === 'regimen' ? { lengthDays: prof.cycleDays || 21, count: Number(f.cycles) || 6 } : undefined;
    await actions.addTreatment({ patientId, kind: prof.kind, ref: prof.key, label: f.label || prof.name, dose: f.dose, times: prof.kind === 'drug' ? f.times.split(/[,\s]+/).filter(Boolean) : undefined, food: f.food || undefined, startDate: f.start, cycle, status: 'active', prescriberId: session!.userId, signedBy: session!.name, orgId: session!.orgId });
    actions.toast('Treatment added. The monitoring plan has been updated.'); onClose();
  };
  return <Modal title="Add treatment" onClose={onClose} wide>
    {!prof ? <div className="col"><input className="input" autoFocus placeholder="Search drug, brand, regimen, procedure or condition" value={q} onChange={e => setQ(e.target.value)} />
      <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>{kb.search(q).slice(0, 40).map(p => <div key={p.key} className="li click" onClick={() => { setProf(p); setF({ ...f, label: p.name }); }}><div className="grow"><b className="small">{p.name}</b><div className="tiny muted">{p.kind} · {p.class || (p.indications || []).join(', ')}{p.brandsIN?.length ? ` · ${p.brandsIN.slice(0, 3).join(', ')}` : ''}</div></div><span className="chev">›</span></div>)}</div></div>
    : <div className="form">
      <div className="row"><b className="grow">{prof.name}</b><button className="btn sm" onClick={() => setProf(null)}>Change</button></div>
      {allergy && <div className="banner red small"><Icon n="alert" s={18} /> Recorded allergy: {allergy.substance} ({allergy.reaction}). Check before prescribing.</div>}
      <div className="banner amber small">Draft profile: the checks and alerts it adds are not for clinical use until a pharmacist approves it in the Drug library.</div>
      <div className="grid g2"><Field label="Label shown to patient"><input className="input" value={f.label} onChange={e => setF({ ...f, label: e.target.value })} /></Field>
        {prof.kind === 'drug' && <Field label="Dose"><input className="input" value={f.dose} onChange={e => setF({ ...f, dose: e.target.value })} placeholder="e.g. 500 mg" /></Field>}
        {prof.kind === 'drug' && <Field label="Times (24 h, comma separated)"><input className="input" value={f.times} onChange={e => setF({ ...f, times: e.target.value })} /></Field>}
        {prof.kind === 'drug' && <Field label="With food?"><input className="input" value={f.food} onChange={e => setF({ ...f, food: e.target.value })} placeholder="e.g. after meals" /></Field>}
        <Field label={prof.kind === 'procedure' ? 'Date of procedure' : prof.kind === 'regimen' ? 'Cycle 1 day 1' : 'Start date'}><input className="input" type="date" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></Field>
        {prof.kind === 'regimen' && <Field label={`Number of ${prof.cycleDays}-day cycles`}><input className="input" inputMode="numeric" value={f.cycles} onChange={e => setF({ ...f, cycles: e.target.value })} /></Field>}</div>
      <div className="small muted">Adds {prof.checks.length + (prof.components || []).reduce((n, k) => n + (kb.get(k)?.checks.length || 0), 0)} patient checks and {prof.labs.length + (prof.components || []).reduce((n, k) => n + (kb.get(k)?.labs.length || 0), 0)} lab rules to the monitoring plan.</div>
      <button className="btn primary block" onClick={save}>Sign & add</button></div>}
  </Modal>;
}

function EditTreatment({ t, onClose }: { t: Treatment; onClose: () => void }) {
  const { actions } = useApp(); const prof = kb.get(t.ref);
  const [targets, setTargets] = useState<OutcomeTarget[]>(() => [...(t.targets || []), ...(prof?.desired || []).filter(d => !(t.targets || []).some(x => x.measure === d.measure)).map(d => ({ ...d, source: 'knowledge' as const }))]);
  const [status, setStatus] = useState(t.status); const [times, setTimes] = useState((t.times || []).join(', ')); const [dose, setDose] = useState(t.dose || '');
  const save = async () => { await actions.reviseTreatment(t, { status, dose, times: t.kind === 'drug' ? times.split(/[,\s]+/).filter(Boolean) : t.times, targets: targets.filter(x => x.target != null || x.source === 'clinician').map(x => ({ ...x, source: 'clinician' as const })), endDate: status === 'stopped' || status === 'completed' ? today() : t.endDate }); actions.toast(`Saved as version ${t.version + 1}`); onClose(); };
  return <Modal title={`Edit · ${t.label}`} onClose={onClose} wide><div className="form">
    <div className="grid g3"><Field label="Status"><select className="input" value={status} onChange={e => setStatus(e.target.value as any)}>{['active', 'held', 'stopped', 'completed'].map(s => <option key={s}>{s}</option>)}</select></Field>
      {t.kind === 'drug' && <Field label="Dose"><input className="input" value={dose} onChange={e => setDose(e.target.value)} /></Field>}{t.kind === 'drug' && <Field label="Times"><input className="input" value={times} onChange={e => setTimes(e.target.value)} /></Field>}</div>
    <h3>Outcome targets</h3><div className="small muted">Enter the target for this patient. Saathi never invents clinical thresholds.</div>
    {targets.map((g, i) => <div className="row wrap" key={g.measure}><b className="small grow">{g.label}</b><span className="small muted">{g.direction}</span><input className="input" style={{ width: 110 }} inputMode="decimal" placeholder="target" value={g.target ?? ''} onChange={e => setTargets(targets.map((x, j) => j === i ? { ...x, target: e.target.value === '' ? undefined : Number(e.target.value) } : x))} /><span className="small muted" style={{ width: 60 }}>{g.unit}</span><input className="input" style={{ width: 90 }} inputMode="numeric" placeholder="weeks" value={g.windowWeeks ?? ''} onChange={e => setTargets(targets.map((x, j) => j === i ? { ...x, windowWeeks: Number(e.target.value) || undefined } : x))} /></div>)}
    <div className="tiny muted">Saving creates version {t.version + 1}; the previous version is kept in the audit trail.</div>
    <button className="btn primary block" onClick={save}>Sign & save</button></div></Modal>;
}

// ---------------- side effects ----------------
function Effects({ patientId }: { patientId: string }) {
  const P = usePatient(patientId)!; const { actions } = useApp(); const [rev, setRev] = useState<AdverseEvent | null>(null); const [add, setAdd] = useState(false);
  const db = useDb(); const tname = (id: string) => db.treatments.find(t => t.id === id)?.label || id;
  const expected = P.treatments.filter(t => t.status === 'active').flatMap(t => { const ps = [kb.get(t.ref), ...(kb.get(t.ref)?.components || []).map(k => kb.get(k))].filter(Boolean) as Profile[]; return ps.flatMap(p => [...p.sideEffects, ...p.complications].map(s => ({ s, p }))); });
  const seen = new Set(P.aes.map(a => a.term.toLowerCase()));
  return <div className="col">
    <div className="card"><div className="spread"><h3>Recorded side effects & complications</h3><button className="btn sm soft" onClick={() => setAdd(true)}><Icon n="plus" s={16} /> Record</button></div>
      <Table columns={['Event', 'Grade', 'Onset', 'Suspected', 'Attribution', 'Source', 'Status', '']} rows={P.aes.map(a => [<div><b className="small">{a.term}</b>{a.serious && <span className="pill red" style={{ marginLeft: 6 }}>Serious</span>}</div>, <span className={`pill ${a.grade >= 3 ? 'red' : a.grade === 2 ? 'amber' : ''}`}>G{a.grade}</span>, fmt(a.onset), <span className="small">{a.suspected.map(tname).join(', ') || '—'}</span>, <div><span className="small b">{a.attribution}</span><div className="tiny muted">{a.attributionWhy}</div></div>, a.source, <div><span className="small">{a.status}</span>{a.reviewedBy ? <div className="tiny muted">by {a.reviewedBy}</div> : <div className="tiny" style={{ color: 'var(--amber)' }}>needs review</div>}</div>, <button className="btn sm" onClick={() => setRev(a)}>Review</button>])} /></div>
    <div className="card"><h3>Watching for (from active treatments)</h3><div className="tiny muted" style={{ marginBottom: 6 }}>How each is detected: check-in questions, readings, labs or wearable data.</div>
      <Table columns={['Effect', 'Drug', 'How often', 'Detected by', 'Seen?']} rows={expected.map(({ s, p }) => [<div><span className="small b">{s.term}</span>{s.serious && <span className="pill red" style={{ marginLeft: 6 }}>Serious</span>}</div>, p.name, s.frequency, <span className="tiny">{s.detectedBy.join(', ') || 'clinical'}</span>, seen.has(s.term.toLowerCase()) || [...seen].some(x => (s.ctcae || '').toLowerCase().includes(x)) ? <span className="pill amber">Yes</span> : <span className="muted small">No</span>])} /></div>
    {rev && <ReviewAE a={rev} onClose={() => setRev(null)} />}
    {add && <RecordAE patientId={patientId} onClose={() => setAdd(false)} />}
  </div>;
}
function ReviewAE({ a, onClose }: { a: AdverseEvent; onClose: () => void }) {
  const { actions } = useApp(); const db = useDb(); const [f, setF] = useState({ grade: a.grade, attribution: a.attribution || 'unknown', status: a.status, action: a.action || '', suspected: a.suspected });
  const tx = db.treatments.filter(t => t.patientId === a.patientId);
  return <Modal title={a.term} onClose={onClose}><div className="form">
    <div className="grid g2"><Field label="CTCAE grade"><select className="input" value={f.grade} onChange={e => setF({ ...f, grade: Number(e.target.value) as any })}>{[1, 2, 3, 4, 5].map(g => <option key={g}>{g}</option>)}</select></Field>
      <Field label="Attribution"><select className="input" value={f.attribution} onChange={e => setF({ ...f, attribution: e.target.value as any })}>{['likely', 'possible', 'unlikely', 'unknown'].map(g => <option key={g}>{g}</option>)}</select></Field>
      <Field label="Status"><select className="input" value={f.status} onChange={e => setF({ ...f, status: e.target.value as any })}>{['open', 'resolving', 'resolved'].map(g => <option key={g}>{g}</option>)}</select></Field></div>
    <Field label="Suspected treatment(s)"><div className="chips">{tx.map(t => <button key={t.id} className={`chip ${f.suspected.includes(t.id) ? 'on' : ''}`} onClick={() => setF({ ...f, suspected: f.suspected.includes(t.id) ? f.suspected.filter(x => x !== t.id) : [...f.suspected, t.id] })}>{t.label}</button>)}</div></Field>
    <Field label="Action taken"><textarea className="input" value={f.action} onChange={e => setF({ ...f, action: e.target.value })} placeholder="e.g. dose held, supportive medicine, review booked" /></Field>
    <button className="btn primary block" onClick={async () => { await actions.reviewAE(a, { ...f, resolved: f.status === 'resolved' ? today() : undefined, serious: f.grade >= 3 }); onClose(); }}>Save review</button></div></Modal>;
}
function RecordAE({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { actions, session } = useApp(); const db = useDb(); const [term, setTerm] = useState(''); const [grade, setGrade] = useState(2); const [onset, setOnset] = useState(today());
  const sus = term ? attribute({ term }, onset, db.treatments.filter(t => t.patientId === patientId)) : [];
  return <Modal title="Record side effect" onClose={onClose}><div className="form">
    <Field label="Event (CTCAE term if known)"><input className="input" value={term} onChange={e => setTerm(e.target.value)} placeholder="e.g. Diarrhoea, Neutropenia, Rash" /></Field>
    <div className="grid g2"><Field label="Grade"><select className="input" value={grade} onChange={e => setGrade(+e.target.value)}>{[1, 2, 3, 4, 5].map(g => <option key={g}>{g}</option>)}</select></Field><Field label="Onset"><input className="input" type="date" value={onset} onChange={e => setOnset(e.target.value)} /></Field></div>
    {sus.length > 0 && <div className="banner blue small"><div>Suggested: <b>{sus[0].name}</b> ({sus[0].attribution}) · {sus[0].why.join('; ')}</div></div>}
    <button className="btn primary block" onClick={async () => { await actions.put('adverse_events', { id: uid('ae'), patientId, term, grade: grade as any, onset, status: 'open', suspected: sus.slice(0, 1).map(s => s.treatmentId), attribution: sus[0]?.attribution || 'unknown', attributionWhy: sus[0]?.why.join('; '), source: 'clinician', serious: grade >= 3, reviewedBy: session!.name, createdAt: new Date().toISOString() }); onClose(); }}>Save</button></div></Modal>;
}

// ---------------- monitoring plan ----------------
const sched = (s: Schedule) => [s.days?.length ? `days ${s.days.join(', ')}` : '', s.newDaily ? `daily for ${s.newDaily} days` : '', s.every ? `every ${s.every === 1 ? 'day' : s.every + ' days'}${s.from ? ` from day ${s.from}` : ''}${s.until ? ` to ${s.until}` : ''}` : '', s.cycleDays?.length ? `cycle days ${s.cycleDays.length > 10 ? 'every day' : s.cycleDays.join(', ')}` : '', s.onSymptom ? 'on symptoms' : ''].filter(Boolean).join(' · ');
function Plan({ patientId }: { patientId: string }) {
  const P = usePatient(patientId)!; const { actions } = useApp();
  const plan = useMemo(() => actions.plan(patientId), [P.treatments]); // eslint-disable-line
  const labs = labsDue(plan, today(), addDays(today(), 42));
  return <div className="col">
    {plan.drafts.length > 0 && <div className="banner amber small"><Icon n="alert" s={18} /><div>Built from draft profiles ({plan.drafts.join(', ')}). Not for clinical use until approved in the Drug library.</div></div>}
    {plan.interactions.length > 0 && <div className="card"><h3>Interactions adding extra checks</h3><div className="list">{plan.interactions.map(i => <div className="li" key={i.id}><Icon n="alert" s={18} style={{ color: 'var(--amber)' }} /><div className="grow"><b className="small">{i.between.join(' + ')}</b><div className="tiny muted">{i.effect}</div></div></div>)}</div></div>}
    <div className="card"><h3>Patient checks ({plan.checks.length})</h3><Table columns={['Check', 'Type', 'When', 'Escalation', 'Because of']} rows={plan.checks.map(c => [<div><b className="small">{c.check.label}</b>{c.check.ask && <div className="tiny muted">“{c.check.ask}”</div>}{c.check.todo && <div className="tiny" style={{ color: 'var(--amber)' }}>{c.check.todo}</div>}</div>, c.check.type, <span className="tiny">{sched(c.check.schedule)}</span>, <span className="tiny">{Object.entries(c.check.escalate || {}).map(([k, v]) => `${k}→${v}`).join(', ') || '—'}</span>, <span className="tiny">{c.sources.map(s => s.name).join(', ')}</span>])} /></div>
    <div className="card"><h3>Labs and tests due · next 6 weeks</h3><Table columns={['Date', 'Test', 'Why', 'For']} rows={labs.map(l => [fmt(l.date), l.name, <span className="tiny">{l.why}</span>, l.for])} /></div>
  </div>;
}

function Labs({ patientId }: { patientId: string }) {
  const { actions } = useApp(); const [add, setAdd] = useState(false); const [f, setF] = useState({ code: 'ANC', name: 'Neutrophils (absolute)', value: '', unit: '×10⁹/L', refLow: '', refHigh: '', date: today() });
  const PRESET: [string, string, string, string, string][] = [['ANC', 'Neutrophils (absolute)', '×10⁹/L', '2.0', '7.5'], ['PLT', 'Platelets', '×10⁹/L', '150', '410'], ['Hb', 'Haemoglobin', 'g/dL', '12', '16'], ['ALT', 'ALT', 'U/L', '7', '40'], ['creatinine', 'Creatinine', 'mg/dL', '0.6', '1.2'], ['bilirubin', 'Bilirubin (total)', 'mg/dL', '0.2', '1.2'], ['K', 'Potassium', 'mmol/L', '3.5', '5.0'], ['Na', 'Sodium', 'mmol/L', '135', '145'], ['Mg', 'Magnesium', 'mg/dL', '1.7', '2.4'], ['INR', 'INR', '', '', ''], ['HbA1c', 'HbA1c', '%', '', '5.6'], ['LVEF', 'Echo LVEF', '%', '55', ''], ['CEA', 'CEA', 'ng/mL', '', '5'], ['TSH', 'TSH', 'mIU/L', '0.4', '4.0']];
  const ev = f.value ? evaluateLab({ code: f.code, value: Number(f.value), unit: f.unit, refLow: f.refLow ? +f.refLow : undefined, refHigh: f.refHigh ? +f.refHigh : undefined }) : null;
  const save = async () => { await actions.addLab({ patientId, code: f.code, name: f.name, value: Number(f.value), unit: f.unit, refLow: f.refLow ? +f.refLow : undefined, refHigh: f.refHigh ? +f.refHigh : undefined, date: f.date, source: 'Entered by care team', status: 'confirmed', confirmedBy: 'care team' }); setAdd(false); };
  return <div className="col"><div className="spread"><div className="small muted">Graded with CTCAE v5.0 where a grade exists, against the lab's reference range.</div><button className="btn primary" onClick={() => setAdd(true)}><Icon n="plus" s={18} /> Add result</button></div>
    <div className="card"><LabsList patientId={patientId} clinician /></div>
    {add && <Modal title="Add lab result" onClose={() => setAdd(false)}><div className="form">
      <div className="chips">{PRESET.map(p => <button key={p[0]} className={`chip ${f.code === p[0] ? 'on' : ''}`} onClick={() => setF({ ...f, code: p[0], name: p[1], unit: p[2], refLow: p[3], refHigh: p[4] })}>{p[1]}</button>)}</div>
      <div className="grid g3"><Field label="Value"><input className="input" autoFocus inputMode="decimal" value={f.value} onChange={e => setF({ ...f, value: e.target.value })} /></Field><Field label="Ref low"><input className="input" value={f.refLow} onChange={e => setF({ ...f, refLow: e.target.value })} /></Field><Field label="Ref high"><input className="input" value={f.refHigh} onChange={e => setF({ ...f, refHigh: e.target.value })} /></Field></div>
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
      {ev && ev.rule && <div className={`banner ${ev.tier === 'green' ? 'brand' : ev.tier}`}>{ev.term}: {ev.rule} → {ev.tier}</div>}
      <button className="btn primary block" disabled={!f.value} onClick={save}>Save</button></div></Modal>}
  </div>;
}

// ---------------- pathway ----------------
function PatientPathway({ patient }: { patient: Patient }) {
  const db = useDb(); const { actions, session } = useApp(); const caps = useCaps();
  const pws = db.pathways.filter(p => p.patientId === patient.id); const [assign, setAssign] = useState(false); const [proto, setProto] = useState(''); const [start, setStart] = useState(today());
  const done = new Set(db.tasks_done.map(t => t.key));
  return <div className="col">
    {caps.has('sign') && <div className="spread"><span /><button className="btn primary" onClick={() => setAssign(true)}><Icon n="plus" s={18} /> Assign pathway</button></div>}
    {pws.map(pw => { const day = daysBetween(pw.start, today()); return <div className="card" key={pw.id}><div className="spread"><div><b>{pw.protocolName}</b> <span className="pill">v{pw.version}</span><div className="tiny muted">Started {fmt(pw.start)} · today is day {day} · assigned by {pw.assignedBy}</div></div><span className={`pill ${pw.status === 'active' ? 'green' : ''}`}>{pw.status}</span></div>
      <Table columns={['Days', 'Who', 'Action', 'When', 'Today']} rows={[...pw.items].sort((a, b) => a.from - b.from).map(it => { const active = day >= it.from && day <= it.to; const keyToday = `${pw.id}|${it.id}|${today()}|`; const dn = [...done].some(k => k.startsWith(keyToday));
        return [<span className="num small">{it.from === it.to ? `Day ${it.from}` : `Day ${it.from}–${it.to}`}</span>, <span className="pill">{it.who}</span>, <div><b className="small">{it.title}</b>{it.notes && <div className="tiny muted">{it.notes}</div>}</div>, <span className="tiny">{it.repeat} {it.times.join(', ')}</span>, active ? (dn ? <span className="pill green">Done</span> : <span className="pill blue">Due</span>) : day > it.to ? <span className="tiny muted">past</span> : <span className="tiny muted">upcoming</span>]; })} /></div>; })}
    {!pws.length && <Empty>No pathway assigned</Empty>}
    {assign && <Modal title="Assign pathway" onClose={() => setAssign(false)}><div className="form">
      <Field label="Protocol"><select className="input" value={proto} onChange={e => setProto(e.target.value)}><option value="">Choose…</option>{db.protocols.filter(p => p.status === 'approved').map(p => <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>)}</select></Field>
      <Field label="Day 0 (surgery / start date)"><input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} /></Field>
      <div className="tiny muted">Only approved protocols can be assigned. Tasks then appear on each role's list on the right dates.</div>
      <button className="btn primary block" disabled={!proto} onClick={async () => { const pr = db.protocols.find(p => p.id === proto)!; await actions.put('pathways', { id: uid('pw'), patientId: patient.id, protocolId: pr.id, protocolName: pr.name, version: pr.version, start, items: pr.items, status: 'active', assignedBy: session!.name }); setAssign(false); }}>Assign</button></div></Modal>}
  </div>;
}

function TeamTab({ patientId }: { patientId: string }) {
  const P = usePatient(patientId)!; const db = useDb(); const { actions, session } = useApp(); const [uid_, setUid] = useState(''); const [resp, setResp] = useState('');
  const staff = db.users.filter(u => u.kind === 'staff' && u.orgId === session!.orgId && !P.team.some(t => t.user?.id === u.id));
  return <div className="grid g2 stack-m" style={{ alignItems: 'start' }}>
    <div className="card"><h3>Care team</h3><div className="list">{P.team.map(t => t.user && <div className="li" key={t.link.id}><Avatar name={t.user.displayName} /><div className="grow"><b className="small">{t.user.displayName}</b><div className="tiny muted">{t.link.responsibility} · {db.orgs.find(o => o.id === t.user!.orgId)?.name}</div></div><button className="iconbtn" onClick={() => actions.del('care_team', t.link.id)} aria-label="Remove"><Icon n="trash" s={16} /></button></div>)}</div>
      <div className="row" style={{ marginTop: 10 }}><select className="input" value={uid_} onChange={e => setUid(e.target.value)}><option value="">Add team member…</option>{staff.map(u => <option key={u.id} value={u.id}>{u.displayName}</option>)}</select><input className="input" placeholder="Responsibility" value={resp} onChange={e => setResp(e.target.value)} /><button className="btn soft" disabled={!uid_} onClick={async () => { await actions.put('care_team', { id: uid('ct'), patientId, userId: uid_, responsibility: resp || 'Care team' }); setUid(''); setResp(''); }}>Add</button></div></div>
    <div className="card"><h3>Carers (in order of contact)</h3><div className="list">{P.carers.map(c => <div className="li" key={c.link.id}><span className="pill">{c.link.priority}</span><div className="grow"><b className="small">{c.user?.displayName}</b><div className="tiny muted">{c.link.relation} · {c.user?.phone} · alerts: {c.link.alerts.replace(/_/g, ' + ')}</div></div><TierPill t={c.link.available ? 'green' : 'amber'} label={c.link.available ? 'Available' : 'Busy'} /></div>)}{!P.carers.length && <Empty>No carers</Empty>}</div></div>
  </div>;
}

// ---------------- register ----------------
export function RegisterPatient({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { actions, session } = useApp(); const db = useDb();
  const [f, setF] = useState({ name: '', dob: '1960-01-01', sex: 'F', phone: '', lang: 'en', dept: db.departments.find(d => d.orgId === session!.orgId)?.id || '', conditions: [] as string[], allergy: '', username: '', password: 'saathi123' }); const [err, setErr] = useState('');
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr(''); if (!f.name || !f.phone) { setErr('Name and phone are required'); return; }
    try {
      const p = await actions.registerPatient({ orgIds: [session!.orgId!], name: f.name, dob: f.dob, sex: f.sex as any, phone: f.phone, lang: f.lang as any, primaryDeptId: f.dept, allergies: f.allergy ? [{ substance: f.allergy, reaction: 'recorded at registration', source: 'staff' }] : [], conditions: f.conditions, registeredBy: `staff:${session!.userId}`, status: 'active' }, f.username ? { username: f.username.trim().toLowerCase(), password: f.password } : undefined);
      await actions.put('care_team', { id: uid('ct'), patientId: p.id, userId: session!.userId, responsibility: 'Registered by' });
      onDone(p.id);
    } catch (e: any) { setErr(e.message); }
  };
  return <Modal title="Register patient" onClose={onClose} wide><div className="form">
    <div className="grid g2"><Field label="Full name"><input className="input" value={f.name} onChange={set('name')} /></Field><Field label="Mobile"><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
      <Field label="Date of birth"><input className="input" type="date" value={f.dob} onChange={set('dob')} /></Field><Field label="Sex"><select className="input" value={f.sex} onChange={set('sex')}><option value="F">Female</option><option value="M">Male</option><option>Other</option></select></Field>
      <Field label="Saathi language"><select className="input" value={f.lang} onChange={set('lang')}><option value="en">English</option><option value="hi">Hindi</option><option value="kn">Kannada</option><option value="ta">Tamil</option></select></Field>
      <Field label="Department"><select className="input" value={f.dept} onChange={set('dept')}>{db.departments.filter(d => d.orgId === session!.orgId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Allergy (if any)"><input className="input" value={f.allergy} onChange={set('allergy')} /></Field></div>
    <Field label="Conditions"><div className="chips">{kb.conditions.map(c => <button key={c.key} className={`chip ${f.conditions.includes(c.key) ? 'on' : ''}`} onClick={() => setF({ ...f, conditions: f.conditions.includes(c.key) ? f.conditions.filter(x => x !== c.key) : [...f.conditions, c.key] })}>{c.name}</button>)}</div></Field>
    <hr className="sep" /><h3>App login for the patient (optional)</h3>
    <div className="grid g2"><Field label="Username"><input className="input" autoCapitalize="none" value={f.username} onChange={set('username')} /></Field><Field label="Temporary password"><input className="input" value={f.password} onChange={set('password')} /></Field></div>
    {err && <div className="err">{err}</div>}<button className="btn primary block" onClick={save}>Register</button></div></Modal>;
}

