import React, { useState } from 'react';
import JSZip from 'jszip';
import { useApp, useDb } from '../../app/state';
import type { PathwayItem, PathwayWho, Protocol } from '../../data/types';
import { parseScheduleTables, parseText, readDocx } from '../../engine/pathwayImport';
import { uid } from '../../lib/dates';
import { Empty, Field, Icon, Modal, Table } from '../common/ui';
import { Top, useCaps } from './StaffApp';

const WHO: PathwayWho[] = ['patient', 'carer', 'doctor', 'nurse', 'physio', 'dietitian', 'liaison', 'pharmacist'];
const REPEAT: PathwayItem['repeat'][] = ['once', 'daily', 'twice', 'thrice', 'weekly', 'monthly'];

export function Pathways() {
  const db = useDb(); const { actions, session } = useApp(); const caps = useCaps();
  const [edit, setEdit] = useState<Protocol | null>(null); const [busy, setBusy] = useState(false); const [paste, setPaste] = useState(false);
  const mine = db.protocols.filter(p => session!.kind === 'platform' || p.orgId === session!.orgId);
  const fromItems = (items: PathwayItem[], name: string, source: string): Protocol => ({ id: '', orgId: session!.orgId || db.orgs[0].id, name: name.slice(0, 90), condition: /knee/i.test(name) ? 'Total knee replacement' : /hip/i.test(name) ? 'Total hip replacement' : '', duration: Math.max(14, ...items.map(i => i.to)), items, status: 'draft', version: 0, source });
  const importFile = async (file: File) => {
    setBusy(true);
    try { const { tables, paras } = await readDocx(file, JSZip); const items = parseScheduleTables(tables); const title = paras.find(x => x.length > 20 && !/^care pathway$/i.test(x)) || file.name.replace(/\.docx$/i, '');
      if (!items.length) actions.toast('No schedule table found. Paste the text instead.', 'warn'); else { setEdit(fromItems(items, title, file.name)); actions.toast(`${items.length} actions read from ${file.name}`); } }
    catch { actions.toast('Could not read that Word file', 'warn'); } finally { setBusy(false); }
  };
  const sample = async () => { try { const r = await fetch('samples/TKR_ERAS_Care_Pathway_DEMO.docx'); await importFile(new File([await r.blob()], 'TKR_ERAS_Care_Pathway_DEMO.docx')); } catch { actions.toast('Sample not available', 'warn'); } };
  return <>
    <Top title="Care pathways" sub="Build protocols by role and day; import from a Word document; assign to patients from their record">
      {caps.has('protocol') && <><label className="btn"><Icon n="upload" s={18} /> {busy ? 'Reading…' : 'Import Word (.docx)'}<input type="file" accept=".docx" hidden onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
        <button className="btn" onClick={sample}><Icon n="doc" s={18} /> Try sample</button><button className="btn" onClick={() => setPaste(true)}>Paste text</button>
        <button className="btn primary" onClick={() => setEdit(fromItems([], 'New pathway', 'manual'))}><Icon n="plus" s={18} /> New</button></>}</Top>
    <div className="card"><Table columns={['Pathway', 'Condition', 'Days', 'Actions', 'Status', 'Patients']} onRow={i => setEdit(mine[i])} rows={mine.map(p => [<div><b>{p.name}</b><div className="tiny muted">v{p.version}{p.source ? ` · from ${p.source}` : ''}</div></div>, p.condition, p.duration, p.items.length, <span className={`pill ${p.status === 'approved' ? 'green' : p.status === 'draft' ? 'amber' : ''}`}>{p.status}</span>, db.pathways.filter(x => x.protocolId === p.id && x.status === 'active').length])} /></div>
    {edit && <Editor proto={edit} onClose={() => setEdit(null)} />}
    {paste && <PasteText onClose={() => setPaste(false)} onItems={items => { setPaste(false); setEdit(fromItems(items, 'Pasted pathway', 'pasted text')); }} />}
  </>;
}

function PasteText({ onClose, onItems }: { onClose: () => void; onItems: (i: PathwayItem[]) => void }) {
  const [t, setT] = useState('Day 1 | 08:00 | Doctor | Procedure | Surgery\nDay 2-14 | 09:00, 18:00 | Patient | Exercise | Knee exercises\nDay 14 | 11:00 | Nurse | Wound | Clip removal');
  return <Modal title="Paste a pathway" onClose={onClose}><div className="form"><div className="small muted">One action per line: Day | Time(s) | Who | Category | Action | Notes</div><textarea className="input" style={{ minHeight: 180, fontFamily: 'ui-monospace, monospace', fontSize: 13 }} value={t} onChange={e => setT(e.target.value)} /><button className="btn primary block" onClick={() => onItems(parseText(t))}>Read actions</button></div></Modal>;
}

function Editor({ proto, onClose }: { proto: Protocol; onClose: () => void }) {
  const { actions, session } = useApp(); const caps = useCaps(); const db = useDb();
  const [p, setP] = useState<Protocol>(proto);
  const setItem = (i: number, patch: Partial<PathwayItem>) => setP({ ...p, items: p.items.map((x, j) => j === i ? { ...x, ...patch, flag: false } : x) });
  const save = async (status: Protocol['status']) => {
    const next = { ...p, status, duration: Math.max(p.duration, ...p.items.map(i => i.to)), version: status === 'approved' ? p.version + 1 : p.version, approvedBy: status === 'approved' ? session!.name : p.approvedBy };
    if (!p.id) await actions.put('protocols', { ...next, id: uid('prot') }); else await actions.patch('protocols', p.id, next);
    if (status === 'approved' && p.id) for (const pw of db.pathways.filter(x => x.protocolId === p.id && x.status === 'active')) await actions.patch('pathways', pw.id, { items: next.items, version: next.version });
    actions.audit('protocol.' + status, `${p.name} v${next.version}`); actions.toast(status === 'approved' ? `Approved v${next.version}. Active patients updated.` : 'Draft saved'); onClose();
  };
  const flagged = p.items.filter(i => i.flag).length;
  return <Modal title={p.id ? 'Edit pathway' : 'New pathway (draft)'} onClose={onClose} wide><div className="form">
    <div className="grid g3"><Field label="Name"><input className="input" value={p.name} onChange={e => setP({ ...p, name: e.target.value })} /></Field><Field label="Condition / procedure"><input className="input" value={p.condition} onChange={e => setP({ ...p, condition: e.target.value })} /></Field>
      <Field label="Department"><select className="input" value={p.deptId || ''} onChange={e => setP({ ...p, deptId: e.target.value })}><option value="">Any</option>{db.departments.filter(d => d.orgId === p.orgId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field></div>
    {flagged > 0 && <div className="banner amber small">{flagged} row(s) need a check: the role or category could not be read clearly.</div>}
    <div className="tiny muted">Day 0 = day of surgery / start. Negative days are before. Tasks land on each role's list at these times.</div>
    <div className="tbl-wrap"><table className="tbl"><thead><tr><th>From</th><th>To</th><th>Who</th><th>Action</th><th>Repeat</th><th>Times</th><th /></tr></thead><tbody>
      {p.items.map((it, i) => <tr key={it.id} style={it.flag ? { background: 'var(--amber-soft)' } : {}}>
        <td><input className="input" style={{ width: 64, minHeight: 36, padding: 6 }} value={it.from} onChange={e => setItem(i, { from: Number(e.target.value) || 0 })} /></td>
        <td><input className="input" style={{ width: 64, minHeight: 36, padding: 6 }} value={it.to} onChange={e => setItem(i, { to: Number(e.target.value) || 0 })} /></td>
        <td><select className="input" style={{ minHeight: 36, padding: 6, width: 118 }} value={it.who} onChange={e => setItem(i, { who: e.target.value as PathwayWho })}>{WHO.map(w => <option key={w}>{w}</option>)}</select></td>
        <td style={{ minWidth: 220 }}><input className="input" style={{ minHeight: 36, padding: 6 }} value={it.title} onChange={e => setItem(i, { title: e.target.value })} /><input className="input tiny" style={{ minHeight: 30, padding: 4, marginTop: 4 }} placeholder={`Category: ${it.type}`} value={it.notes || ''} onChange={e => setItem(i, { notes: e.target.value })} /></td>
        <td><select className="input" style={{ minHeight: 36, padding: 6, width: 104 }} value={it.repeat} onChange={e => setItem(i, { repeat: e.target.value as any })}>{REPEAT.map(w => <option key={w}>{w}</option>)}</select></td>
        <td><input className="input" style={{ width: 120, minHeight: 36, padding: 6 }} value={it.times.join(', ')} onChange={e => setItem(i, { times: (e.target.value.match(/\d{1,2}:\d{2}/g) || []).map(t => t.padStart(5, '0')) })} /></td>
        <td><button className="iconbtn" onClick={() => setP({ ...p, items: p.items.filter((_, j) => j !== i) })} aria-label="Remove"><Icon n="trash" s={16} /></button></td></tr>)}
    </tbody></table></div>
    {!p.items.length && <Empty>No actions yet</Empty>}
    <button className="btn soft" onClick={() => setP({ ...p, items: [...p.items, { id: uid('pi'), who: 'patient', type: 'Task', title: '', from: 0, to: 0, times: ['09:00'], repeat: 'once' }] })}><Icon n="plus" s={16} /> Add action</button>
    <div className="row wrap" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => save('draft')}>Save draft</button>{caps.has('sign') && <button className="btn primary" onClick={() => save('approved')}><Icon n="check" s={18} /> Approve & publish</button>}</div>
    {!caps.has('sign') && <div className="tiny muted">A doctor with signing rights approves pathways before they can be assigned.</div>}
  </div></Modal>;
}
