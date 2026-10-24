// Building blocks shared by the patient and carer apps.
import React, { useMemo, useState } from 'react';
import { useApp, useDb, usePatient } from '../../app/state';
import { DayItem, minutes, nowHM, ui } from '../../app/today';
import type { Org, Patient } from '../../data/types';
import type { DueCheck } from '../../engine/plan';
import { evaluateOutcome, OUTCOME_LABEL } from '../../engine/outcomes';
import { ANSWERS, kb } from '../../knowledge';
import { addDays, fmt, today, weekday } from '../../lib/dates';
import { haptic, readSteps } from '../../native/bridge';
import { Avatar, Draft, Empty, Field, Icon, MiniChart, Modal, TierPill, TileIcon, fmtTime } from '../common/ui';

const KIND_ICON: Record<string, [string, string]> = { dose: ['pill', 'var(--meds)'], Exercise: ['walk', 'var(--activity)'], Walk: ['walk', 'var(--activity)'], Wound: ['heart', 'var(--heart)'], Diet: ['drop', 'var(--mind)'], checkin: ['chat', 'var(--vitals)'], Check: ['thermo', 'var(--vitals)'], Lab: ['lab', 'var(--labs)'], Appointment: ['calendar', 'var(--blue)'], Review: ['calendar', 'var(--blue)'], Call: ['phone', 'var(--blue)'], Support: ['users', 'var(--activity)'] };
export const itemIcon = (it: DayItem) => KIND_ICON[it.kind === 'task' ? it.type : it.kind] || ['task', 'var(--muted)'];

// ---------- day timeline ----------
export function DayList({ items, lang, onOpen, readOnly }: { items: DayItem[]; lang: string; onOpen: (it: DayItem) => void; readOnly?: boolean }) {
  const now = minutes(nowHM());
  const nextIdx = items.findIndex(i => !i.done && minutes(i.time) <= now + 30);
  if (!items.length) return <Empty>Nothing planned for today</Empty>;
  return <div className="tl">{items.map((it, i) => {
    const [ic, c] = itemIcon(it); const late = !it.done && minutes(it.time) < now - 30;
    return <div key={it.key} className={`tl-item ${it.done ? 'done' : ''} ${i === nextIdx ? 'now' : ''}`} onClick={() => !readOnly && !it.done && onOpen(it)} style={{ cursor: readOnly || it.done ? 'default' : 'pointer' }}>
      <span className="tl-time">{it.time}</span><TileIcon n={ic} c={c} />
      <div className="grow"><div className="tl-title b ellipsis">{it.title}</div>{(it.sub || late) && <div className="small muted ellipsis">{late ? <span style={{ color: 'var(--amber)', fontWeight: 650 }}>{ui(lang, 'pending')} · </span> : null}{it.sub}</div>}</div>
      {it.done ? <span className="check"><Icon n="check" s={18} w={3} /></span> : !readOnly && <span className="chev">›</span>}
    </div>;
  })}</div>;
}

// ---------- check-in questions ----------
const ANS_LABEL: Record<string, string> = { none: 'None', mild: 'Mild', moderate: 'Moderate', severe: 'Severe', no: 'No', yes: 'Yes' };
export function CheckinFlow({ patient, checks, onDone, onRed }: { patient: Patient; checks: DueCheck[]; onDone: () => void; onRed: (title: string) => void }) {
  const { actions } = useApp(); const [i, setI] = useState(0); const [busy, setBusy] = useState(false);
  const c = checks[i];
  if (!c) return <div className="col" style={{ alignItems: 'center', padding: 10 }}><span className="check" style={{ width: 56, height: 56 }}><Icon n="check" s={30} w={3} /></span><h2>Thank you</h2><div className="muted small" style={{ textAlign: 'center' }}>Your answers have gone to your care team.</div><button className="btn primary block" onClick={onDone}>Done</button></div>;
  const opts = ANSWERS[c.check.answers || 'sev'];
  const pick = async (a: string) => {
    setBusy(true); haptic('light');
    const { tier } = await actions.answerCheck(patient.id, c.check, a);
    setBusy(false);
    if (tier === 'red') { onRed(c.check.label); return; }
    setI(i + 1);
  };
  return <div className="col" style={{ gap: 14 }}>
    <div className="spread"><span className="small muted">Question {i + 1} of {checks.length}</span><span className="tiny muted ellipsis" style={{ maxWidth: '60%' }}>{c.sources[0]}</span></div>
    <div className="bar"><i style={{ width: `${(i / checks.length) * 100}%` }} /></div>
    <h2 style={{ fontSize: 22, lineHeight: 1.25 }}>{c.check.ask}</h2>
    <div className="qopt">{opts.map(o => <button key={o} disabled={busy} className={`btn ${o === 'severe' || (o === 'yes' && c.check.escalate?.yes) ? '' : ''}`} onClick={() => pick(o)}>{ANS_LABEL[o] || o}</button>)}</div>
    <button className="btn ghost sm" onClick={() => setI(i + 1)}>Skip this question</button>
  </div>;
}

// ---------- emergency ----------
export function Emergency({ patient, reason, onClose }: { patient: Patient; reason: string; onClose: () => void }) {
  const P = usePatient(patient.id)!; const org: Org | undefined = P.orgs[0]; const carer = P.carers.find(c => c.link.available) || P.carers[0];
  return <div className="emergency" role="alertdialog">
    <div className="row"><Icon n="alert" s={34} w={2.4} /><h1 style={{ color: '#fff' }}>Get help now</h1></div>
    <div style={{ fontSize: 18 }}>{reason}. Your care team{carer?.user ? ` and ${carer.user.displayName}` : ''} have been alerted.</div>
    <a className="btn xl block" href={`tel:${org?.ambulance || '108'}`}><Icon n="phone" /> Call ambulance {org?.ambulance || '108'}</a>
    {org && <a className="btn xl block" href={`tel:${org.emergency.replace(/\s/g, '')}`}><Icon n="phone" /> {org.name} emergency</a>}
    {carer?.user?.phone && <a className="btn ghost block" href={`tel:${carer.user.phone.replace(/\s/g, '')}`}>Call {carer.user.displayName}</a>}
    <div className="small" style={{ opacity: .9 }}>If you feel you may harm yourself, call Tele-MANAS 14416 (free, 24×7).</div>
    <button className="btn ghost" onClick={onClose}>I am safe now · close</button>
  </div>;
}

// ---------- health / outcomes ----------
const MEASURES: { key: string; label: string; unit: string; color: string; kind?: 'bar' | 'line'; icon: string }[] = [
  { key: 'steps', label: 'Steps', unit: 'steps', color: 'var(--activity)', kind: 'bar', icon: 'walk' },
  { key: 'pain', label: 'Pain', unit: '/10', color: 'var(--heart)', icon: 'heart' },
  { key: 'bp_sys', label: 'Blood pressure', unit: 'mmHg', color: 'var(--vitals)', icon: 'heart' },
  { key: 'fpg', label: 'Fasting sugar', unit: 'mg/dL', color: 'var(--labs)', icon: 'drop' },
  { key: 'weight', label: 'Weight', unit: 'kg', color: 'var(--mind)', icon: 'chart' },
  { key: 'hr', label: 'Resting pulse', unit: 'bpm', color: 'var(--heart)', icon: 'heart' },
  { key: 'temp', label: 'Temperature', unit: '°C', color: 'var(--red)', icon: 'thermo' },
  { key: 'PHQ9', label: 'Mood score (PHQ-9)', unit: '', color: 'var(--mind)', icon: 'chat' },
  { key: 'mood', label: 'Daily mood', unit: '/5', color: 'var(--mind)', icon: 'chat', kind: 'bar' },
];
export function HealthView({ patientId, canAdd = true, clinician }: { patientId: string; canAdd?: boolean; clinician?: boolean }) {
  const P = usePatient(patientId)!; const [add, setAdd] = useState(false); const { actions } = useApp();
  const targets = P.treatments.filter(t => t.status === 'active').flatMap(t => (t.targets || []).map(g => ({ t, g })));
  const series = (m: string) => [...P.obs.filter(o => o.type === m).map(o => ({ date: o.date, value: o.value, value2: o.value2 })), ...P.labs.filter(l => l.code === m && l.status === 'confirmed').map(l => ({ date: l.date, value: l.value, value2: undefined as number | undefined }))].sort((a, b) => a.date.localeCompare(b.date));
  const sync = async () => {
    const r = await readSteps(7);
    if (!r) { actions.toast('Phone/watch health data is available in the mobile app'); return; }
    for (const d of r) if (!P.obs.some(o => o.type === 'steps' && o.date === d.date)) await actions.addObservation({ patientId, type: 'steps', value: d.steps, unit: 'steps', date: d.date, source: 'device', device: d.source });
    actions.toast('Synced from Health');
  };
  const shown = MEASURES.filter(m => series(m.key).length);
  return <div className="col" style={{ gap: 12 }}>
    {targets.length > 0 && <div className="card"><div className="spread"><h3>{clinician ? 'Treatment outcomes' : 'My goals'}</h3></div><div className="list" style={{ marginTop: 6 }}>
      {targets.map(({ t, g }) => { const s = series(g.measure); const r = evaluateOutcome(g, s, t.startDate, today()); const lab = OUTCOME_LABEL[r.status];
        return <div className="li" key={t.id + g.measure}><div className="grow"><b className="small">{g.label}</b><div className="tiny muted">{t.label}{g.target != null ? ` · target ${g.target}${g.unit ? ' ' + g.unit : ''}` : ''}</div></div>
          <div style={{ textAlign: 'right' }}><div className="b num">{r.latest ? `${r.latest.value}${g.unit && g.unit.length < 4 ? g.unit : ''}` : '—'}</div>{clinician ? <span className={`pill ${lab.tone === 'grey' ? '' : lab.tone}`}>{lab.label}</span> : r.status === 'improving' || r.status === 'achieved' ? <span className="pill green">{r.status === 'achieved' ? 'Goal reached 🎉' : 'Getting better'}</span> : null}</div></div>; })}
    </div></div>}
    <div className="spread"><h3 style={{ margin: '6px 4px 0' }}>Readings</h3><div className="row">{!clinician && <button className="btn sm" onClick={sync}><Icon n="watch" s={16} /> Sync</button>}{canAdd && <button className="btn sm soft" onClick={() => setAdd(true)}><Icon n="plus" s={16} /> Add</button>}</div></div>
    <div className="grid g2">{shown.map(m => { const s = series(m.key).slice(-10); const tgt = targets.find(x => x.g.measure === m.key)?.g.target;
      return <div className="card tight" key={m.key}><div className="row" style={{ marginBottom: 4 }}><TileIcon n={m.icon} c={m.color} /><div className="grow"><b className="small">{m.label}</b><div className="tiny muted">{fmt(s[s.length - 1].date)}</div></div></div>
        <MiniChart points={s.map(x => ({ label: fmt(x.date, { day: 'numeric' }), value: x.value, value2: x.value2 }))} color={m.color} kind={m.kind} unit={m.unit} target={tgt} h={110} fmt={v => m.key === 'steps' ? v.toLocaleString('en-IN') : String(Math.round(v * 10) / 10)} /></div>; })}</div>
    {!shown.length && <Empty>No readings yet. Tap Add to enter one.</Empty>}
    {add && <AddReading patientId={patientId} onClose={() => setAdd(false)} />}
  </div>;
}

export function AddReading({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { actions, session } = useApp(); const [type, setType] = useState('bp_sys'); const [v, setV] = useState(''); const [v2, setV2] = useState('');
  const m = MEASURES.find(x => x.key === type)!;
  const save = async () => {
    const n = Number(v); if (!v || isNaN(n)) return;
    await actions.addObservation({ patientId, type, value: n, value2: type === 'bp_sys' && v2 ? Number(v2) : undefined, unit: m.unit, date: today(), time: nowHM(), source: session!.kind === 'carer' ? 'carer' : session!.kind === 'staff' ? 'clinic' : 'patient', by: session!.name });
    actions.toast('Saved'); haptic('success'); onClose();
  };
  return <Modal title="Add a reading" onClose={onClose}><div className="form">
    <div className="chips">{MEASURES.filter(x => x.key !== 'PHQ9').map(x => <button key={x.key} className={`chip ${type === x.key ? 'on' : ''}`} onClick={() => setType(x.key)}>{x.label}</button>)}</div>
    <div className="row"><Field label={type === 'bp_sys' ? 'Top number' : `${m.label} ${m.unit}`}><input className="input" inputMode="decimal" value={v} onChange={e => setV(e.target.value)} autoFocus /></Field>{type === 'bp_sys' && <Field label="Bottom number"><input className="input" inputMode="numeric" value={v2} onChange={e => setV2(e.target.value)} /></Field>}</div>
    <button className="btn primary block" onClick={save}>Save</button></div></Modal>;
}

// ---------- messages thread ----------
export function Thread({ patientId, compact }: { patientId: string; compact?: boolean }) {
  const db = useDb(); const { actions, session } = useApp(); const [text, setText] = useState('');
  const msgs = db.messages.filter(m => m.patientId === patientId).sort((a, b) => a.at.localeCompare(b.at));
  const send = async (e: React.FormEvent) => { e.preventDefault(); if (!text.trim()) return; await actions.message(patientId, text.trim()); setText(''); };
  return <div className="col" style={{ gap: 10 }}>
    <div className="chat" style={compact ? { maxHeight: 360, overflowY: 'auto' } : {}}>
      {msgs.map(m => <div key={m.id} className={`bubble ${m.fromUserId === session!.userId ? 'me' : 'bot'}`}><div className="tiny" style={{ fontWeight: 700, opacity: .75 }}>{m.fromName} · {m.fromRole}</div>{m.text}<div className="src">{fmtTime(m.at)}{m.via ? ` · via ${m.via}` : ''}</div></div>)}
      {!msgs.length && <Empty>No messages yet</Empty>}
    </div>
    <form className="row" onSubmit={send}><input className="input grow" placeholder="Write a message" value={text} onChange={e => setText(e.target.value)} /><button className="mic" style={{ width: 46, height: 46 }} aria-label="Send"><Icon n="send" s={20} /></button></form>
  </div>;
}

// ---------- medicines ----------
export function MedsList({ patientId }: { patientId: string }) {
  const P = usePatient(patientId)!; const [open, setOpen] = useState<string | null>(null);
  const meds = P.treatments.filter(t => t.status === 'active');
  return <div className="list">{meds.map(t => { const p = kb.get(t.ref); return <div key={t.id}>
    <div className="li click" onClick={() => setOpen(open === t.id ? null : t.id)}><TileIcon n={t.kind === 'drug' ? 'pill' : t.kind === 'procedure' ? 'heart' : 'flow'} c={t.kind === 'drug' ? 'var(--meds)' : 'var(--care)'} />
      <div className="grow"><b className="small">{t.label}</b><div className="tiny muted">{t.times?.length ? t.times.join(' · ') : t.kind === 'regimen' ? 'Treatment cycles' : t.kind === 'procedure' ? `Since ${fmt(t.startDate)}` : ''}{t.food ? ` · ${t.food}` : ''}</div></div><span className="chev">{open === t.id ? '–' : '+'}</span></div>
    {open === t.id && p && <div className="card flat" style={{ background: 'var(--card2)', marginBottom: 10 }}>
      <div className="small">{p.patientInfo || `Used for ${(p.indications || []).join(', ').toLowerCase()}.`}</div>
      {p.sideEffects.length > 0 && <><div className="tiny muted b" style={{ marginTop: 8 }}>COMMON SIDE EFFECTS</div><div className="small">{p.sideEffects.slice(0, 4).map(s => s.term).join(' · ')}</div></>}
      {p.complications.length > 0 && <><div className="tiny b" style={{ marginTop: 8, color: 'var(--red)' }}>TELL YOUR TEAM STRAIGHT AWAY</div><div className="small">{p.complications.map(s => s.term).join(' · ')}</div></>}
      <div style={{ marginTop: 8 }}><Draft /></div></div>}
  </div>; })}{!meds.length && <Empty>No active treatments</Empty>}</div>;
}

// ---------- contacts & hospitals ----------
export function openNow(o: Org) {
  const d = weekday(today()); const days = o.opdDays === 'Every day' ? 7 : o.opdDays === 'Mon–Sat' ? 6 : 5;
  const t = nowHM(); return d < days && t >= o.opdOpen && t < o.opdClose;
}
export function Contacts({ patientId }: { patientId: string }) {
  const P = usePatient(patientId)!;
  return <div className="col" style={{ gap: 12 }}>
    {P.orgs.map(o => <div className="card" key={o.id}><div className="spread"><div><b>{o.name}</b><div className="small muted">{o.address}</div></div>{openNow(o) ? <span className="pill green">Open now</span> : <span className="pill">Closed</span>}</div>
      <div className="small muted" style={{ marginTop: 6 }}>OPD {o.opdDays} {o.opdOpen}–{o.opdClose}</div>
      <div className="row wrap" style={{ marginTop: 10 }}><a className="btn sm danger" href={`tel:${o.emergency.replace(/\s/g, '')}`}><Icon n="phone" s={16} /> Emergency</a><a className="btn sm" href={`tel:${o.phone.replace(/\s/g, '')}`}>Reception</a><a className="btn sm" href={`https://maps.google.com/?q=${encodeURIComponent(o.name + ' ' + o.city)}`} target="_blank" rel="noreferrer"><Icon n="map" s={16} /> Map</a></div></div>)}
    <div className="card"><h3>Care team</h3><div className="list" style={{ marginTop: 6 }}>{P.team.map(t => t.user && <div className="li" key={t.link.id}><Avatar name={t.user.displayName} /><div className="grow"><b className="small">{t.user.displayName}</b><div className="tiny muted">{t.link.responsibility}</div></div></div>)}</div></div>
    <a className="btn block" href="https://www.google.com/maps/search/hospital+near+me" target="_blank" rel="noreferrer"><Icon n="map" s={18} /> Find the nearest hospital</a>
  </div>;
}

export function LabsList({ patientId, clinician }: { patientId: string; clinician?: boolean }) {
  const P = usePatient(patientId)!; const { actions } = useApp();
  const labs = [...P.labs].sort((a, b) => b.date.localeCompare(a.date));
  return <div className="list">{labs.map(l => { const hi = l.refHigh != null && l.value > l.refHigh, lo = l.refLow != null && l.value < l.refLow;
    return <div className="li" key={l.id}><TileIcon n="lab" c="var(--labs)" /><div className="grow"><b className="small">{l.name}</b><div className="tiny muted">{fmt(l.date)} · {l.source}{l.refLow != null || l.refHigh != null ? ` · range ${l.refLow ?? ''}–${l.refHigh ?? ''}` : ''}</div></div>
      <div style={{ textAlign: 'right' }}><div className="b num" style={{ color: hi || lo ? 'var(--amber)' : undefined }}>{l.value} <span className="tiny muted">{l.unit}</span></div>
        {l.status === 'candidate' ? (clinician ? <button className="btn sm soft" onClick={() => actions.confirmLab(l)}>Confirm</button> : <span className="pill amber">Awaiting check</span>) : (hi || lo) ? <span className="pill amber">{hi ? 'High' : 'Low'}</span> : null}</div></div>; })}
    {!labs.length && <Empty>No results yet</Empty>}</div>;
}

export function UploadReport({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { actions } = useApp(); const [name, setName] = useState(''); const [value, setValue] = useState(''); const [unit, setUnit] = useState(''); const [file, setFile] = useState<string>('');
  const COMMON = ['Haemoglobin', 'HbA1c', 'Creatinine', 'Potassium', 'INR', 'Platelets', 'Neutrophils (absolute)', 'ALT'];
  const CODE: Record<string, string> = { Haemoglobin: 'Hb', HbA1c: 'HbA1c', Creatinine: 'creatinine', Potassium: 'K', INR: 'INR', Platelets: 'PLT', 'Neutrophils (absolute)': 'ANC', ALT: 'ALT' };
  const save = async () => { if (!name || !value) return; await actions.addLab({ patientId, code: CODE[name] || name, name, value: Number(value), unit, date: today(), source: `Uploaded by patient${file ? ` (${file})` : ''}`, status: 'candidate' }); actions.toast('Sent to your care team to check'); onClose(); };
  return <Modal title="Add a test report" onClose={onClose}><div className="form">
    <div className="banner blue small">Results you add are checked by your care team before they count.</div>
    <Field label="Photo or PDF of the report"><input type="file" accept="image/*,application/pdf" capture="environment" onChange={e => setFile(e.target.files?.[0]?.name || '')} /></Field>
    <div className="chips">{COMMON.map(c => <button key={c} className={`chip ${name === c ? 'on' : ''}`} onClick={() => setName(c)}>{c}</button>)}</div>
    <div className="row"><Field label="Test"><input className="input" value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Result"><input className="input" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /></Field><Field label="Unit"><input className="input" value={unit} onChange={e => setUnit(e.target.value)} /></Field></div>
    <button className="btn primary block" onClick={save}>Send for review</button></div></Modal>;
}

export function useDayStats(items: DayItem[], patientId: string) {
  const db = useDb();
  return useMemo(() => {
    const doses = items.filter(i => i.kind === 'dose'); const tasks = items.filter(i => i.kind !== 'dose');
    const steps = db.observations.filter(o => o.patientId === patientId && o.type === 'steps' && o.date === today()).reduce((a, b) => Math.max(a, b.value), 0);
    const goal = db.treatments.filter(t => t.patientId === patientId && t.status === 'active').flatMap(t => t.targets || []).find(g => g.measure === 'steps')?.target || 3000;
    const yesterday = db.observations.filter(o => o.patientId === patientId && o.type === 'steps' && o.date === addDays(today(), -1))[0]?.value;
    return { doses: { done: doses.filter(d => d.done).length, n: doses.length }, tasks: { done: tasks.filter(d => d.done).length, n: tasks.length }, steps, goal, yesterday };
  }, [db, items, patientId]);
}
export { TierPill };
