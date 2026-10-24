import React, { useState } from 'react';
import { useApp, useDb } from '../../app/state';
import { kb, Profile } from '../../knowledge';
import { CTCAE_VERSION } from '../../knowledge';
import { nowIso, uid } from '../../lib/dates';
import { Draft, Field, Icon, Modal, Seg, Table } from '../common/ui';
import { Top, useCaps } from './StaffApp';

export function DrugLibrary() {
  const db = useDb(); const [q, setQ] = useState(''); const [kind, setKind] = useState<'all' | 'drug' | 'onc' | 'regimen' | 'condition' | 'procedure'>('all'); const [open, setOpen] = useState<Profile | null>(null);
  const isOnc = (p: Profile) => (p.tags || []).some(t => ['chemo', 'immunotherapy', 'targeted', 'hormonal'].includes(t));
  const list = kb.search(q).filter(p => kind === 'all' || (kind === 'onc' ? isOnc(p) : p.kind === kind));
  const review = (k: string) => db.kb_reviews.filter(r => r.key === k).sort((a, b) => b.at.localeCompare(a.at))[0];
  return <>
    <Top title="Drug & treatment library" sub={`${kb.drugs.length} drugs · ${kb.regimens.length} regimens · ${kb.conditions.length} conditions · ${kb.procedures.length} procedures. Draft content compiled from prescribing information; lab grading ${CTCAE_VERSION}.`} />
    <div className="banner amber small" style={{ marginBottom: 12 }}><Icon n="alert" s={18} /><div>Every profile is <b>NOT FOR CLINICAL USE</b> until a pharmacist or doctor approves it. Add more drugs from openFDA labels with <code>npm run import:drug -- &lt;name&gt;</code>.</div></div>
    <div className="row wrap" style={{ marginBottom: 12 }}><input className="input" style={{ maxWidth: 340 }} placeholder="Search name, brand (e.g. Glycomet), class or use" value={q} onChange={e => setQ(e.target.value)} />
      <Seg value={kind} onChange={setKind} options={[['all', 'All'], ['drug', 'Drugs'], ['onc', 'Oncology'], ['regimen', 'Regimens'], ['condition', 'Conditions'], ['procedure', 'Procedures']]} /></div>
    <div className="card"><Table columns={['Name', 'Class / type', 'Indian brands', 'Checks', 'Labs', 'Review']} onRow={i => setOpen(list[i])} rows={list.map(p => { const r = review(p.key); return [<b>{p.name}</b>, <span className="small">{p.class || p.kind}</span>, <span className="small">{(p.brandsIN || []).join(', ') || '—'}</span>, p.checks.length || (p.components || []).length + ' drugs', p.labs.length, r?.status === 'approved' ? <span className="pill green">Approved · {r.reviewedBy}</span> : r ? <span className="pill amber">Changes requested</span> : <Draft />]; })} /></div>
    {open && <ProfileView p={open} onClose={() => setOpen(null)} />}
  </>;
}

function ProfileView({ p, onClose }: { p: Profile; onClose: () => void }) {
  const caps = useCaps(); const { actions, session } = useApp(); const db = useDb(); const [notes, setNotes] = useState('');
  const reviews = db.kb_reviews.filter(r => r.key === p.key);
  const decide = async (status: 'approved' | 'changes_requested') => { await actions.put('kb_reviews', { id: uid('kbr'), key: p.key, orgId: session!.orgId || '', status, reviewedBy: session!.name, reviewerId: session!.userId, at: nowIso(), notes, version: p.version }); actions.audit('kb.' + status, p.key); actions.toast(status === 'approved' ? 'Approved for your organisation' : 'Changes requested'); onClose(); };
  return <Modal title={p.name} onClose={onClose} wide><div className="col" style={{ gap: 14 }}>
    <div className="row wrap"><span className="pill">{p.kind}</span>{p.class && <span className="pill brand">{p.class}</span>}<Draft /><span className="tiny muted">v{p.version}</span></div>
    {p.indications && <div className="small"><b>Used for:</b> {p.indications.join(', ')}</div>}
    {p.components && <div className="small"><b>Components:</b> {p.components.map(k => kb.get(k)?.name).join(' + ')} · {p.cycleDays}-day cycles</div>}
    {p.desired.length > 0 && <div><h3>Desired effects (outcomes)</h3><Table columns={['Measure', 'Direction', 'Expected by']} rows={p.desired.map(d => [d.label, d.direction, d.windowWeeks ? `week ${d.windowWeeks}` : '—'])} /><div className="tiny muted">Targets are set per patient by the clinician.</div></div>}
    {(p.sideEffects.length > 0 || p.complications.length > 0) && <div><h3>Side effects & complications</h3><Table columns={['Effect', 'Frequency', 'Serious', 'Onset', 'Detected by', 'CTCAE term']} rows={[...p.sideEffects, ...p.complications].map(s => [s.term, s.frequency, s.serious ? <span className="pill red">Yes</span> : '', s.typicalOnset || '', <span className="tiny">{s.detectedBy.join(', ')}</span>, <span className="tiny">{s.ctcae || ''}</span>])} /></div>}
    {p.checks.length > 0 && <div><h3>Checks</h3><Table columns={['Check', 'Type', 'Patient question', 'Escalation']} rows={p.checks.map(c => [c.label, c.type, <span className="small">{c.ask || c.measure}</span>, <span className="tiny">{Object.entries(c.escalate || {}).map(([k, v]) => `${k}→${v}`).join(', ')}{c.todo ? ` · ${c.todo}` : ''}</span>])} /></div>}
    {p.labs.length > 0 && <div><h3>Lab monitoring</h3><Table columns={['Test', 'When', 'Why']} rows={p.labs.map(l => [l.name, [l.baseline && 'baseline', l.days?.length && `days ${l.days.join(', ')}`, l.beforeEachCycle && 'before each cycle', l.everyWeeks && `every ${l.everyWeeks} wk`].filter(Boolean).join(' · '), <span className="small">{l.why}</span>])} /></div>}
    {(p.interactions || []).length > 0 && <div><h3>Interactions</h3>{p.interactions!.map((i, k) => <div key={k} className="small">With {i.with.join(', ')}: {i.effect}</div>)}</div>}
    <div className="small muted">Sources: {p.sources.map((s, i) => <span key={i}>{s.ref.startsWith('http') ? <a href={s.ref} target="_blank" rel="noreferrer">{s.type}</a> : `${s.type}: ${s.ref}`}{i < p.sources.length - 1 ? '; ' : ''}</span>)}</div>
    {reviews.length > 0 && <div className="small">{reviews.map(r => <div key={r.id}>{r.status === 'approved' ? '✅' : '✏️'} {r.reviewedBy} · {r.at.slice(0, 10)}{r.notes ? ` · ${r.notes}` : ''}</div>)}</div>}
    {caps.has('drugs') && <div className="card flat" style={{ background: 'var(--card2)' }}><h3>Pharmacist review</h3><Field label="Notes"><textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Checked against the Indian package insert…" /></Field>
      <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}><button className="btn" onClick={() => decide('changes_requested')}>Request changes</button><button className="btn primary" onClick={() => decide('approved')}><Icon n="check" s={18} /> Approve for my organisation</button></div>
      <div className="tiny muted" style={{ marginTop: 6 }}>Approval is recorded with your name. In production, approved content is copied into a signed, versioned profile in the database.</div></div>}
  </div></Modal>;
}
