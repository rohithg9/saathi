import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useDb, usePatient } from '../../app/state';
import { callName, DayItem, LANGS, minutes, nowHM, patientDay, say, ui } from '../../app/today';
import type { Patient } from '../../data/types';
import { answer, SymptomFlow, triageSymptomAnswers } from '../../engine/assistant';
import { today, uid, nowIso, fmt } from '../../lib/dates';
import { capabilities, chime, haptic, listen, requestNotificationPermission, scheduleReminders, speak, stopSpeaking, syncWatch, voicesFor } from '../../native/bridge';
import { Avatar, Empty, Icon, Modal, Orb, Ring, Seg } from '../common/ui';
import { CheckinFlow, Contacts, DayList, Emergency, HealthView, LabsList, MedsList, Thread, UploadReport, useDayStats } from './shared';

type Tab = 'today' | 'health' | 'saathi' | 'records' | 'me';
const pref = { get: (k: string, d: any) => { try { const v = localStorage.getItem('saathi.pref.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k: string, v: any) => { try { localStorage.setItem('saathi.pref.' + k, JSON.stringify(v)); } catch { /* ignore */ } } };

export function PatientApp() {
  const { session } = useApp(); const db = useDb();
  const patient = db.patients.find(p => p.id === session!.patientId);
  const [tab, setTab] = useState<Tab>('today');
  const [emergency, setEmergency] = useState<string | null>(null);
  if (!patient) return <div className="phone"><Empty>No patient record is linked to this login.</Empty></div>;
  const lang = patient.lang;
  const unread = db.messages.filter(m => m.patientId === patient.id && m.fromKind === 'staff' && m.at.slice(0, 10) === today()).length;
  const T: [Tab, string, string][] = [['today', 'home', ui(lang, 'home')], ['health', 'heart', ui(lang, 'health')], ['saathi', 'chat', ui(lang, 'talk')], ['records', 'folder', ui(lang, 'records')], ['me', 'user', ui(lang, 'me')]];
  return <>
    <div className="phone">
      {tab === 'today' && <Today patient={patient} onRed={setEmergency} />}
      {tab === 'health' && <><h1 style={{ margin: '8px 4px 14px' }}>{ui(lang, 'health')}</h1><HealthView patientId={patient.id} /></>}
      {tab === 'saathi' && <SaathiChat patient={patient} onEmergency={setEmergency} />}
      {tab === 'records' && <Records patient={patient} />}
      {tab === 'me' && <Me patient={patient} />}
    </div>
    <nav className="tabbar"><div className="in">{T.map(([k, ic, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{k === 'saathi' ? <Orb size={26} /> : <Icon n={ic} />}{k === 'records' && unread > 0 && <span className="badge">{unread}</span>}<span>{l}</span></button>)}</div></nav>
    {emergency && <Emergency patient={patient} reason={emergency} onClose={() => setEmergency(null)} />}
    <ReminderEngine patient={patient} />
  </>;
}

// ---------------- Today ----------------
function greeting(lang: string, n: string) { const h = new Date().getHours(); return say(lang, h < 12 ? 'greetM' : h < 17 ? 'greetA' : 'greetE', { n }); }

function Today({ patient, onRed }: { patient: Patient; onRed: (r: string) => void }) {
  const db = useDb(); const lang = patient.lang;
  const { items } = useMemo(() => patientDay(db, patient, today()), [db, patient]);
  const st = useDayStats(items, patient.id);
  const [open, setOpen] = useState<DayItem | null>(null);
  const name = callName(patient);
  const pct = st.doses.n ? st.doses.done / st.doses.n : 1;
  return <>
    <div className="spread" style={{ margin: '6px 4px 14px' }}>
      <div><div className="small muted b">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>{ui(lang, 'today')}</h1></div>
      <button className="iconbtn" style={{ width: 52, height: 52, background: 'transparent' }} onClick={() => speak(greeting(lang, name) + ' ' + say(lang, 'praise', { n: name, x: st.doses.done + st.tasks.done, y: st.doses.n + st.tasks.n }), lang as any)} aria-label="Hear Saathi"><Orb size={50} breathe /></button>
    </div>
    <div className="card"><div className="rings">
      <Ring pct={pct} color="var(--meds)" size={92}><Ring pct={st.steps / st.goal} color="var(--activity)" size={66} w={10}><Ring pct={st.tasks.n ? st.tasks.done / st.tasks.n : 1} color="var(--vitals)" size={40} w={9} /></Ring></Ring>
      <div className="legend grow">
        <div><span className="tiny b" style={{ color: 'var(--meds)' }}>{ui(lang, 'meds').toUpperCase()}</span><div className="v">{st.doses.done}/{st.doses.n}</div></div>
        <div><span className="tiny b" style={{ color: 'var(--activity)' }}>{ui(lang, 'steps').toUpperCase()}</span><div className="v">{st.steps.toLocaleString('en-IN')} <span className="small muted">/ {st.goal.toLocaleString('en-IN')}</span></div></div>
        <div><span className="tiny b" style={{ color: 'var(--vitals)' }}>{ui(lang, 'done').toUpperCase()}</span><div className="v">{st.tasks.done}/{st.tasks.n}</div></div>
      </div></div></div>
    <div className="section-h"><h2>{ui(lang, 'upnext')}</h2><span className="small muted">{items.filter(i => !i.done).length} {ui(lang, 'pending').toLowerCase()}</span></div>
    <div className="card"><DayList items={items} lang={lang} onOpen={setOpen} /></div>
    {open && <ItemSheet patient={patient} item={open} onClose={() => setOpen(null)} onRed={r => { setOpen(null); onRed(r); }} />}
  </>;
}

function ItemSheet({ patient, item, onClose, onRed }: { patient: Patient; item: DayItem; onClose: () => void; onRed: (r: string) => void }) {
  const { actions, session } = useApp(); const db = useDb(); const lang = patient.lang;
  const [skip, setSkip] = useState(false); const [coach, setCoach] = useState(false);
  const late = minutes(nowHM()) - minutes(item.time) > 60;
  const takeDose = async (status: 'taken' | 'skipped', reason?: string) => {
    if (item.kind !== 'dose') return;
    const fresh = await actions.doseFor(patient.id, item.treatmentId, today(), item.time);
    await actions.markDose(fresh, status === 'taken' && late ? 'taken_late' : status, reason);
    haptic('success'); if (status === 'taken') speak(say(lang, 'praise', { n: callName(patient), x: '', y: '' }).split('!')[0] + '!', lang as any);
    onClose();
  };
  const taskDone = async () => { await actions.put('tasks_done', { id: uid('td'), key: item.key, by: session!.name, at: nowIso() }); haptic('success'); onClose(); };
  if (item.kind === 'checkin') return <Modal title="Check-in" onClose={onClose}><CheckinFlow patient={patient} checks={item.checks} onDone={onClose} onRed={onRed} /></Modal>;
  return <Modal title={item.title} onClose={onClose}>
    <div className="col" style={{ gap: 12 }}>
      <div className="muted">{item.time}{item.sub ? ` · ${item.sub}` : ''}</div>
      {item.kind === 'dose' && !skip && <><button className="btn ok xl block" onClick={() => takeDose('taken')}><Icon n="check" /> {ui(lang, 'taken')}</button>
        <button className="btn block" onClick={() => setSkip(true)}>{ui(lang, 'skip')}</button></>}
      {item.kind === 'dose' && skip && <><div className="small b">Why are you not taking it?</div><div className="chips">{['Feeling sick', 'Ran out', 'Forgot earlier', 'Side effects', 'Told by doctor to hold', 'Other'].map(r => <button key={r} className="chip" onClick={() => takeDose('skipped', r)}>{r}</button>)}</div><div className="tiny muted">Your care team will see this. Saathi never advises changing your medicines.</div></>}
      {item.kind === 'task' && /Exercise|Walk/.test(item.type) && <button className="btn soft xl block" onClick={() => setCoach(true)}><Icon n="speaker" /> {ui(lang, 'count')}</button>}
      {item.kind === 'task' && <button className="btn ok xl block" onClick={taskDone}><Icon n="check" /> {ui(lang, 'done')}</button>}
    </div>
    {coach && <CountCoach lang={lang} onClose={() => setCoach(false)} onFinish={taskDone} />}
  </Modal>;
}

/** Counts reps aloud at a pace the patient chooses (slow by default for older or post-op patients). */
function CountCoach({ lang, onClose, onFinish }: { lang: string; onClose: () => void; onFinish: () => void }) {
  const [pace, setPace] = useState<number>(pref.get('pace', 5)); const [n, setN] = useState(0); const [run, setRun] = useState(false); const total = 10;
  useEffect(() => { if (!run) return; if (n >= total) { setRun(false); speak(say(lang, 'praise', { n: '', x: total, y: total }), lang as any); return; } const t = setTimeout(() => { setN(n + 1); speak(String(n + 1), lang as any, { rate: .85 }); }, n === 0 ? 1500 : pace * 1000); return () => clearTimeout(t); }, [run, n, pace, lang]);
  useEffect(() => () => stopSpeaking(), []);
  return <Modal title={ui(lang, 'count')} onClose={onClose}><div className="col" style={{ alignItems: 'center', gap: 16 }}>
    <Ring pct={n / total} color="var(--activity)" size={170} w={16}><span style={{ fontSize: 54 }} className="num">{n}</span></Ring>
    <Seg value={String(pace) as any} options={[['8', 'Very slow'], ['5', 'Slow'], ['3', 'Normal']]} onChange={v => { setPace(+v); pref.set('pace', +v); }} />
    <div className="row" style={{ width: '100%' }}><button className="btn block" onClick={() => setRun(!run)}>{run ? 'Pause' : n ? 'Resume' : ui(lang, 'start')}</button>{!run && <button className="btn block" onClick={() => { setN(n + 1); speak(String(n + 1), lang as any); }}>+1</button>}</div>
    {n >= total && <button className="btn ok block xl" onClick={onFinish}>{ui(lang, 'done')}</button>}
    <div className="tiny muted">Go at your own pace. Stop if you feel sharp pain.</div></div></Modal>;
}

// ---------------- reminders: centred pop-up + voice; device notifications ----------------
function ReminderEngine({ patient }: { patient: Patient }) {
  const db = useDb(); const { actions } = useApp(); const lang = patient.lang;
  const [snooze, setSnooze] = useState<Record<string, number>>(() => pref.get('snooze.' + today(), {}));
  const [current, setCurrent] = useState<DayItem | null>(null); const [open, setOpen] = useState<DayItem | null>(null);
  const spoken = useRef<Set<string>>(new Set()); const lastClose = useRef(0);
  const { items } = useMemo(() => patientDay(db, patient, today()), [db, patient]);
  const n = callName(patient);
  const voiceFor = (it: DayItem, firm: boolean) => it.kind === 'dose' ? say(lang, firm ? 'doseFirm' : 'dose', { n, meds: it.title.split(/\s\d/)[0] }) : it.kind === 'checkin' ? say(lang, 'checkin', { n }) : /walk/i.test(`${(it as any).type} ${it.title}`) ? say(lang, firm ? 'walkFirm' : 'walk', { n, s: 500 }) : /exercis/i.test(`${(it as any).type} ${it.title}`) ? say(lang, firm ? 'exerciseFirm' : 'exercise', { n }) : `${n}, ${it.title}`;

  useEffect(() => { // device notifications for the rest of today (work when the app is closed on iOS/Android)
    const list = items.filter(i => !i.done).map((i, k) => { const [h, m] = i.time.split(':').map(Number); const at = new Date(); at.setHours(h, m, 0, 0); return { id: 1000 + k, title: i.title, body: voiceFor(i, false), at, voice: voiceFor(i, false), extra: { key: i.key } }; });
    scheduleReminders(list); syncWatch({ reminders: items.map(i => ({ time: i.time, title: i.title, kind: i.kind })), name: n, lang: lang as any, stepGoal: 3000 });
  }, [items.map(i => i.key + i.done).join()]); // eslint-disable-line

  useEffect(() => {
    const tick = () => {
      if (current || open || Date.now() - lastClose.current < 90000) return;
      const now = minutes(nowHM());
      const due = items.find(i => !i.done && minutes(i.time) <= now && now - minutes(i.time) < 60 && (!snooze[i.key] || snooze[i.key] <= Date.now()));
      if (due) {
        setCurrent(due);
        const firm = now - minutes(due.time) > 30;
        const k = due.key + (firm ? ':firm' : '');
        if (!spoken.current.has(k)) { spoken.current.add(k); chime(); setTimeout(() => speak(voiceFor(due, firm), lang as any), 900); }
      }
    };
    const first = setTimeout(tick, 2500); const t = setInterval(tick, 30000); return () => { clearTimeout(first); clearInterval(t); };
  }, [items, snooze, current, open]); // eslint-disable-line

  const later = (min: number) => { const s = { ...snooze, [current!.key]: Date.now() + min * 60000 }; setSnooze(s); pref.set('snooze.' + today(), s); setCurrent(null); lastClose.current = Date.now(); stopSpeaking(); actions.toast(`I'll remind you in ${min} minutes`); };
  if (open) return <ItemSheet patient={patient} item={open} onClose={() => setOpen(null)} onRed={() => setOpen(null)} />;
  if (!current) return null;
  return <Modal onClose={() => later(10)}>
    <div className="col" style={{ alignItems: 'center', gap: 14, textAlign: 'center' }}>
      <Orb size={74} breathe /><div className="small muted b">{current.time}</div><h2 style={{ fontSize: 24 }}>{current.title}</h2>
      <div className="muted">{voiceFor(current, false)}</div>
      <button className="btn primary xl block" onClick={() => { setOpen(current); setCurrent(null); lastClose.current = Date.now(); stopSpeaking(); }}>{current.kind === 'dose' ? ui(lang, 'taken') + ' / ' + ui(lang, 'skip') : ui(lang, 'start')}</button>
      <div className="small b muted">{ui(lang, 'later')}</div>
      <div className="row" style={{ width: '100%' }}>{[10, 30, 60].map(m => <button key={m} className="btn block" onClick={() => later(m)}>{m} min</button>)}</div>
      <button className="btn ghost sm" onClick={() => speak(voiceFor(current, false), lang as any)}><Icon n="speaker" s={16} /> Hear again</button>
    </div></Modal>;
}

// ---------------- Saathi (talking companion) ----------------
interface Msg { id: string; me?: boolean; text: string; src?: string; flow?: SymptomFlow }
function SaathiChat({ patient, onEmergency }: { patient: Patient; onEmergency: (r: string) => void }) {
  const db = useDb(); const { actions } = useApp(); const lang = patient.lang;
  const n = callName(patient);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 'g', text: greeting(lang, n) + ' Ask me anything about your treatment, or tell me how you feel.' }]);
  const [text, setText] = useState(''); const [rec, setRec] = useState<null | (() => void)>(null);
  const [flow, setFlow] = useState<{ f: SymptomFlow; step: number; ans: string[] } | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, flow]);
  const faq = db.faq.filter(f => patient.orgIds.includes(f.orgId));
  const bot = (t: string, src?: string) => { setMsgs(m => [...m, { id: uid('m'), text: t, src }]); speak(t, lang as any); };
  const ask = async (q: string) => {
    if (!q.trim()) return; setText(''); setMsgs(m => [...m, { id: uid('m'), me: true, text: q }]);
    const r = answer(q, { faq, treatments: db.treatments.filter(t => t.patientId === patient.id) });
    if (r.kind === 'emergency') { await actions.put('alerts', { id: uid('al'), patientId: patient.id, tier: 'red', kind: 'saathi', title: `Emergency words: ${r.hit.kind.replace('_', ' ')}`, evidence: 'Patient message to Saathi (text withheld from logs)', status: 'open', createdAt: nowIso() }); await actions.message(patient.id, q, 'Saathi (emergency)'); bot(r.text); onEmergency(r.hit.crisis ? 'You told Saathi you may be in danger' : 'This could be serious'); return; }
    if (r.kind === 'symptom') { bot(r.text); setFlow({ f: r.flow, step: 0, ans: [] }); speak(r.flow.steps[0].ask, lang as any); return; }
    if (r.kind === 'forward') { await actions.message(patient.id, q, 'Saathi (question for the team)'); bot(say(lang, 'forward') || r.text, 'Sent to your care team'); return; }
    bot(r.text, r.source);
  };
  const flowAnswer = async (a: string) => {
    if (!flow) return; const ans = [...flow.ans, a]; setMsgs(m => [...m, { id: uid('m'), me: true, text: a }]);
    if (flow.step + 1 < flow.f.steps.length) { setFlow({ ...flow, step: flow.step + 1, ans }); speak(flow.f.steps[flow.step + 1].ask, lang as any); return; }
    setFlow(null); const tier = triageSymptomAnswers(flow.f.id, ans);
    const summary = flow.f.steps.map((s, i) => `${s.ask} ${ans[i]}`).join(' · ');
    await actions.message(patient.id, `Symptom report (${flow.f.title}): ${summary}`, 'Saathi history-taking');
    if (tier !== 'green') await actions.put('alerts', { id: uid('al'), patientId: patient.id, tier, kind: 'symptom', title: `${flow.f.title} reported`, evidence: summary, status: 'open', createdAt: nowIso() });
    if (tier === 'red') { bot(say(lang, 'urgent')); onEmergency(`${flow.f.title}: possible emergency`); }
    else bot(say(lang, 'hxSent'), tier === 'amber' ? 'Marked for review today' : undefined);
  };
  const mic = () => { if (rec) { rec(); setRec(null); return; } const stop = listen(lang as any, (t, fin) => { setText(t); if (fin) { setRec(null); ask(t); } }); if (!stop) actions.toast('Voice input is not available in this browser. Type instead.'); else setRec(() => stop); };
  return <>
    <div className="row" style={{ margin: '6px 4px 14px' }}><Orb size={46} breathe /><div><h1 style={{ fontSize: 26 }}>Saathi</h1><div className="small muted">Answers come from your care team first</div></div></div>
    <div className="chat">{msgs.map(m => <div key={m.id} className={`bubble ${m.me ? 'me' : 'bot'}`}>{m.text}{m.src && <div className="src">{m.src}</div>}</div>)}
      {flow && <div className="card tight"><b>{flow.f.steps[flow.step].ask}</b><div className="chips" style={{ marginTop: 8 }}>{flow.f.steps[flow.step].options.map(o => <button key={o} className="chip" onClick={() => flowAnswer(o)}>{o}</button>)}</div></div>}
      <div ref={endRef} /></div>
    {msgs.length < 3 && !flow && <div className="chips" style={{ marginTop: 12 }}>{['What are the side effects of my medicines?', 'I have pain', 'When can I shower?', 'I feel dizzy'].map(s => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}</div>}
    <form className="composer" onSubmit={e => { e.preventDefault(); ask(text); }}><input className="input grow" placeholder="Ask Saathi…" value={text} onChange={e => setText(e.target.value)} /><button type="button" className={`mic ${rec ? 'on' : ''}`} onClick={mic} aria-label="Speak"><Icon n="mic" /></button></form>
  </>;
}

// ---------------- Records ----------------
function Records({ patient }: { patient: Patient }) {
  const [seg, setSeg] = useState<'meds' | 'labs' | 'messages' | 'contacts'>('meds'); const [up, setUp] = useState(false);
  return <>
    <h1 style={{ margin: '8px 4px 14px' }}>{ui(patient.lang, 'records')}</h1>
    <Seg value={seg} options={[['meds', 'Treatments'], ['labs', 'Tests'], ['messages', 'Messages'], ['contacts', 'Contacts']]} onChange={setSeg} />
    <div style={{ marginTop: 12 }}>
      {seg === 'meds' && <div className="card"><MedsList patientId={patient.id} /></div>}
      {seg === 'labs' && <><div className="card"><LabsList patientId={patient.id} /></div><button className="btn block soft" style={{ marginTop: 12 }} onClick={() => setUp(true)}><Icon n="upload" s={18} /> Add a test report</button></>}
      {seg === 'messages' && <Thread patientId={patient.id} />}
      {seg === 'contacts' && <Contacts patientId={patient.id} />}
    </div>
    {up && <UploadReport patientId={patient.id} onClose={() => setUp(false)} />}
  </>;
}

// ---------------- Me / settings ----------------
function Me({ patient }: { patient: Patient }) {
  const { actions, signOut } = useApp(); const P = usePatient(patient.id)!;
  const [cn, setCn] = useState(patient.callName || ''); const [addCarer, setAddCarer] = useState(false); const [notif, setNotif] = useState<string>('');
  const [rate, setRate] = useState<number>(pref.get('rate', .95)); const [large, setLarge] = useState<boolean>(pref.get('large', false));
  useEffect(() => { document.body.classList.toggle('large', large); pref.set('large', large); }, [large]);
  const caps = capabilities();
  const setLang = async (l: Patient['lang']) => { await actions.patch('patients', patient.id, { lang: l }); speak(greeting(l, callName({ ...patient, callName: cn || patient.callName })), l, { rate }); };
  const saveName = async () => { await actions.patch('patients', patient.id, { callName: cn.trim() || undefined }); speak(greeting(patient.lang, cn.trim() || patient.name.split(' ')[0]), patient.lang as any, { rate }); actions.toast('Saved'); };
  return <>
    <div className="row" style={{ margin: '8px 4px 14px' }}><Avatar name={patient.name} size={56} /><div><h1 style={{ fontSize: 26 }}>{patient.name}</h1><div className="small muted">{patient.phone}</div></div></div>
    <div className="card col">
      <h3>Saathi's voice</h3>
      <label className="f">What should Saathi call you?<div className="row"><input className="input grow" value={cn} placeholder={patient.name.split(' ')[0]} onChange={e => setCn(e.target.value)} /><button className="btn soft" onClick={saveName}>Save</button></div></label>
      <div className="f">Language<div className="chips">{LANGS.map(l => <button key={l.key} className={`chip ${patient.lang === l.key ? 'on' : ''}`} onClick={() => setLang(l.key as any)}>{l.native}</button>)}</div></div>
      <div className="f">Speaking speed<Seg value={String(rate) as any} options={[['0.8', 'Slow'], ['0.95', 'Normal'], ['1.1', 'Faster']]} onChange={v => { setRate(+v); pref.set('rate', +v); speak(greeting(patient.lang, callName(patient)), patient.lang as any, { rate: +v }); }} /></div>
      {!voicesFor(patient.lang as any).length && !caps.nativeVoice && <div className="banner amber small">This device has no {LANGS.find(l => l.key === patient.lang)?.label} voice installed. The mobile app uses the phone's natural voice.</div>}
      <label className="row"><input type="checkbox" checked={large} onChange={e => setLarge(e.target.checked)} /> Larger text</label>
    </div>
    <div className="card col"><h3>My carers</h3>
      <div className="list">{P.carers.map(c => <div className="li" key={c.link.id}><Avatar name={c.user?.displayName || '?'} /><div className="grow"><b className="small">{c.user?.displayName}</b><div className="tiny muted">{c.link.relation} · priority {c.link.priority} · {c.link.available ? 'available' : 'busy'}</div></div></div>)}{!P.carers.length && <Empty>No carers yet</Empty>}</div>
      <button className="btn soft" onClick={() => setAddCarer(true)}><Icon n="plus" s={18} /> Add a carer</button></div>
    <div className="card col"><h3>Reminders & devices</h3>
      <div className="kv"><span>Reminders when app closed</span><span>{caps.backgroundReminders ? 'Yes (phone app)' : 'Install the phone app for this'}</span><span>Phone / watch health data</span><span>{caps.health ? 'Connected' : 'Available in the phone app'}</span><span>Watch app</span><span>{caps.watch ? 'Paired' : 'Apple Watch / Wear OS app'}</span></div>
      <button className="btn" onClick={async () => setNotif((await requestNotificationPermission()) ? 'Notifications on' : 'Notifications blocked: enable them in settings')}><Icon n="bell" s={18} /> Turn on notifications</button>{notif && <div className="small muted">{notif}</div>}</div>
    <button className="btn block" style={{ marginTop: 12 }} onClick={signOut}><Icon n="logout" s={18} /> Sign out</button>
    {addCarer && <AddCarer patient={patient} onClose={() => setAddCarer(false)} />}
  </>;
}

export function AddCarer({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { actions } = useApp(); const P = usePatient(patient.id)!;
  const [f, setF] = useState({ name: '', relation: 'Son', phone: '', username: '', password: 'saathi123' }); const [err, setErr] = useState('');
  const save = async () => {
    setErr(''); if (!f.name || !f.username) { setErr('Name and username are needed'); return; }
    try {
      const u = await actions.createUser({ username: f.username.trim().toLowerCase(), displayName: f.name, kind: 'carer', phone: f.phone }, f.password);
      await actions.put('carer_links', { id: uid('cl'), patientId: patient.id, userId: u.id, relation: f.relation, priority: P.carers.length + 1, available: true, perms: { meds: true, activity: true, symptoms: true, readings: true, mood: false, records: true }, alerts: 'red_missed', status: 'active' });
      actions.toast(`${f.name} added. They can sign in as “${f.username}”.`); onClose();
    } catch (e: any) { setErr(e.message); }
  };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return <Modal title="Add a carer" onClose={onClose}><div className="form">
    <label className="f">Name<input className="input" value={f.name} onChange={set('name')} /></label>
    <label className="f">Relation<select className="input" value={f.relation} onChange={set('relation')}>{['Son', 'Daughter', 'Spouse', 'Parent', 'Sibling', 'Friend', 'Paid carer', 'Other'].map(x => <option key={x}>{x}</option>)}</select></label>
    <label className="f">Phone<input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
    <div className="row"><label className="f grow">Username<input className="input" autoCapitalize="none" value={f.username} onChange={set('username')} /></label><label className="f grow">Password<input className="input" value={f.password} onChange={set('password')} /></label></div>
    {err && <div className="err">{err}</div>}<button className="btn primary block" onClick={save}>Add carer</button></div></Modal>;
}
export { fmt };
