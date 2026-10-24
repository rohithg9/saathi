import React, { useMemo, useState } from 'react';
import { useApp, useDb, usePatient } from '../../app/state';
import { DayItem, patientDay } from '../../app/today';
import { answer } from '../../engine/assistant';
import { adherence } from '../../engine/rules';
import { addDays, nowIso, today, uid } from '../../lib/dates';
import { speak } from '../../native/bridge';
import { Avatar, Empty, Icon, Modal, Orb, Seg, TierPill, fmtTime } from '../common/ui';
import { CheckinFlow, DayList, Emergency, HealthView, MedsList, Thread } from '../patient/shared';

type Tab = 'today' | 'health' | 'messages' | 'ask' | 'me';

export function CarerApp() {
  const { session } = useApp(); const db = useDb();
  const links = db.carer_links.filter(l => l.userId === session!.userId && l.status === 'active');
  const [pid, setPid] = useState(links[0]?.patientId); const [tab, setTab] = useState<Tab>('today');
  const patient = db.patients.find(p => p.id === pid);
  if (!patient) return <div className="phone"><h1>Saathi</h1><Empty>No one is linked to your account yet. Ask the patient or their care team to add you as a carer.</Empty><SignOut /></div>;
  const red = db.alerts.filter(a => a.patientId === pid && a.status === 'open' && a.tier === 'red').length;
  const T: [Tab, string, string][] = [['today', 'home', 'Today'], ['health', 'heart', 'Health'], ['messages', 'chat', 'Messages'], ['ask', 'mic', 'Ask'], ['me', 'user', 'Me']];
  return <>
    <div className="phone">
      <div className="spread" style={{ margin: '6px 4px 14px' }}>
        <div className="row"><Avatar name={patient.name} size={44} /><div><div className="small muted b">Caring for</div><h2>{patient.name}</h2></div></div>
        {links.length > 1 && <select className="input" style={{ width: 'auto' }} value={pid} onChange={e => setPid(e.target.value)}>{links.map(l => <option key={l.id} value={l.patientId}>{db.patients.find(p => p.id === l.patientId)?.name}</option>)}</select>}
      </div>
      {tab === 'today' && <CarerToday patientId={patient.id} />}
      {tab === 'health' && <HealthView patientId={patient.id} />}
      {tab === 'messages' && <Thread patientId={patient.id} />}
      {tab === 'ask' && <CarerAsk patientId={patient.id} />}
      {tab === 'me' && <CarerMe patientId={patient.id} />}
    </div>
    <nav className="tabbar"><div className="in">{T.map(([k, ic, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}><Icon n={ic} />{k === 'today' && red > 0 && <span className="badge">{red}</span>}<span>{l}</span></button>)}</div></nav>
  </>;
}

function CarerToday({ patientId }: { patientId: string }) {
  const db = useDb(); const P = usePatient(patientId)!; const { actions, session } = useApp();
  const mine = useMemo(() => patientDay(db, P.p, today(), 'carer').items, [db, P.p]);
  const theirs = useMemo(() => patientDay(db, P.p, today(), 'patient').items, [db, P.p]);
  const [open, setOpen] = useState<DayItem | null>(null); const [em, setEm] = useState<string | null>(null);
  const alerts = P.alerts.filter(a => a.status !== 'resolved').sort((a, b) => (a.tier === 'red' ? -1 : 1) - (b.tier === 'red' ? -1 : 1));
  const adh = adherence(P.doses.filter(d => d.date >= addDays(today(), -7) && d.date < today()));
  const steps = P.obs.filter(o => o.type === 'steps' && o.date === today())[0]?.value || 0;
  const onBehalf = async (it: DayItem) => {
    if (it.kind === 'dose') { const d = await actions.doseFor(patientId, it.treatmentId, today(), it.time); await actions.markDose(d, 'taken'); actions.toast(`Marked taken for ${P.p.name.split(' ')[0]}`); }
    else if (it.kind === 'task') await actions.put('tasks_done', { id: uid('td'), key: it.key, by: session!.name, at: nowIso() });
    else setOpen(it);
  };
  return <div className="col" style={{ gap: 12 }}>
    {alerts.map(a => <div key={a.id} className={`banner ${a.tier}`}><Icon n="alert" s={20} /><div className="grow"><b>{a.title}</b><div className="small">{a.evidence}</div><div className="tiny" style={{ marginTop: 4 }}>{a.status === 'acknowledged' ? 'Care team is handling this' : 'Care team alerted'} · {fmtTime(a.createdAt)}</div></div></div>)}
    <div className="grid g3">
      <div className="card tight kpi"><span className="l">Medicines 7 days</span><span className="v" style={{ fontSize: 24 }}>{adh.pct ?? '—'}{adh.pct != null && '%'}</span><span className="tiny muted">{adh.noAnswer} no answer · {adh.skipped} skipped</span></div>
      <div className="card tight kpi"><span className="l">Steps today</span><span className="v" style={{ fontSize: 24 }}>{steps.toLocaleString('en-IN')}</span></div>
      <div className="card tight kpi"><span className="l">Due today</span><span className="v" style={{ fontSize: 24 }}>{theirs.filter(i => !i.done).length}</span></div>
    </div>
    {mine.length > 0 && <><div className="section-h"><h2>Your tasks</h2></div><div className="card"><DayList items={mine} lang="en" onOpen={onBehalf} /></div></>}
    <div className="section-h"><h2>{P.p.name.split(' ')[0]}'s day</h2><span className="small muted">Tap to help</span></div>
    <div className="card"><DayList items={theirs} lang="en" onOpen={onBehalf} /></div>
    <div className="section-h"><h2>Treatments</h2></div><div className="card"><MedsList patientId={patientId} /></div>
    {open?.kind === 'checkin' && <Modal title={`Check-in for ${P.p.name.split(' ')[0]}`} onClose={() => setOpen(null)}><CheckinFlow patient={P.p} checks={open.checks} onDone={() => setOpen(null)} onRed={r => { setOpen(null); setEm(r); }} /></Modal>}
    {em && <Emergency patient={P.p} reason={em} onClose={() => setEm(null)} />}
  </div>;
}

function CarerAsk({ patientId }: { patientId: string }) {
  const db = useDb(); const P = usePatient(patientId)!; const { actions } = useApp();
  const [q, setQ] = useState(''); const [log, setLog] = useState<{ me?: boolean; text: string }[]>([]);
  const first = P.p.name.split(' ')[0];
  const summary = () => {
    const adh = adherence(P.doses.filter(d => d.date >= addDays(today(), -7) && d.date < today()));
    const open = P.alerts.filter(a => a.status !== 'resolved');
    const steps = P.obs.filter(o => o.type === 'steps').sort((a, b) => b.date.localeCompare(a.date))[0];
    return `${first} took ${adh.pct ?? 0}% of medicines this week (${adh.noAnswer} reminders not answered). ${steps ? `Latest steps: ${steps.value.toLocaleString('en-IN')}.` : ''} ${open.length ? `${open.length} open alert${open.length > 1 ? 's' : ''}: ${open.map(a => a.title).join('; ')}.` : 'No open alerts.'}`;
  };
  const go = async (text: string) => {
    if (!text.trim()) return; setQ(''); setLog(l => [...l, { me: true, text }]);
    let reply: string;
    if (/how is|how's|doing|summary|update|week/i.test(text)) reply = summary();
    else { const r = answer(text, { faq: db.faq.filter(f => P.p.orgIds.includes(f.orgId)), treatments: P.treatments }); reply = r.text; if (r.kind === 'forward') await actions.message(patientId, text, 'Saathi (carer question)'); }
    setLog(l => [...l, { text: reply }]); speak(reply, 'en');
  };
  return <div className="col" style={{ gap: 12 }}>
    <div className="row"><Orb size={40} /><div className="small muted">Ask about {first}'s care. Questions Saathi can't answer go to the care team.</div></div>
    <div className="chat">{log.map((m, i) => <div key={i} className={`bubble ${m.me ? 'me' : 'bot'}`}>{m.text}</div>)}</div>
    {!log.length && <div className="chips">{[`How is ${first} doing this week?`, 'What are the side effects of the medicines?', 'What should I do if there is a fever?'].map(s => <button key={s} className="chip" onClick={() => go(s)}>{s}</button>)}</div>}
    <form className="composer" onSubmit={e => { e.preventDefault(); go(q); }}><input className="input grow" value={q} onChange={e => setQ(e.target.value)} placeholder="Ask Saathi…" /><button className="mic" aria-label="Send"><Icon n="send" /></button></form>
  </div>;
}

function CarerMe({ patientId }: { patientId: string }) {
  const db = useDb(); const { actions, session } = useApp(); const P = usePatient(patientId)!;
  const link = db.carer_links.find(l => l.userId === session!.userId && l.patientId === patientId)!;
  return <div className="col" style={{ gap: 12 }}>
    <div className="card col"><div className="spread"><div><b>I'm available</b><div className="small muted">When you're busy, alerts go to the next carer</div></div><input type="checkbox" checked={link.available} onChange={e => actions.patch('carer_links', link.id, { available: e.target.checked })} style={{ width: 24, height: 24 }} /></div>
      <div className="f small b">Alert me about<Seg value={link.alerts} options={[['red', 'Urgent only'], ['red_missed', 'Urgent + missed'], ['red_amber_missed', 'Everything']]} onChange={v => actions.patch('carer_links', link.id, { alerts: v })} /></div></div>
    <div className="card"><h3>Care circle</h3><div className="list" style={{ marginTop: 6 }}>{P.carers.map(c => <div className="li" key={c.link.id}><Avatar name={c.user?.displayName || '?'} /><div className="grow"><b className="small">{c.user?.displayName}{c.user?.id === session!.userId ? ' (you)' : ''}</b><div className="tiny muted">{c.link.relation} · priority {c.link.priority}</div></div><TierPill t={c.link.available ? 'green' : 'amber'} label={c.link.available ? 'Available' : 'Busy'} /></div>)}</div></div>
    <SignOut />
  </div>;
}
const SignOut = () => { const { signOut } = useApp(); return <button className="btn block" onClick={signOut}><Icon n="logout" s={18} /> Sign out</button>; };
