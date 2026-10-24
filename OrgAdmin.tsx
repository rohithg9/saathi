import React, { useState } from 'react';
import { useApp, useDb } from '../../app/state';
import type { AppUser, Cap, Org, PathwayWho, Role, RotaDay } from '../../data/types';
import { onLeave, onRota } from '../../engine/schedule';
import { today, uid } from '../../lib/dates';
import { Avatar, Empty, Field, Icon, Modal, Seg, Table, TierPill } from '../common/ui';
import { Top, useCaps } from './StaffApp';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CAPS: [Cap, string][] = [['sign', 'Sign treatments & approve pathways'], ['monitor', 'Monitor patients & alerts'], ['message', 'Message patients & carers'], ['protocol', 'Build pathways'], ['tasks', 'Pathway tasks'], ['register', 'Register patients'], ['drugs', 'Review drug library'], ['analytics', 'Analytics'], ['users', 'Manage people'], ['org', 'Manage organisation']];
const WHO: PathwayWho[] = ['doctor', 'nurse', 'physio', 'dietitian', 'liaison', 'pharmacist'];
const defaultRota = (): RotaDay[] => DAYS.map((_, i) => ({ on: i < 5, start: '09:00', end: '17:00', onCall: false }));

export function OrgAdmin() {
  const [tab, setTab] = useState<'people' | 'roles' | 'depts' | 'org' | 'faq'>('people');
  return <><Top title="Organisation" sub="People, roles, departments, rota and the answers Saathi gives patients"><Seg value={tab} onChange={setTab} options={[['people', 'People & rota'], ['roles', 'Roles'], ['depts', 'Departments'], ['faq', 'Saathi answers'], ['org', 'Details']]} /></Top>
    {tab === 'people' && <People />}{tab === 'roles' && <Roles />}{tab === 'depts' && <Depts />}{tab === 'org' && <OrgDetails />}{tab === 'faq' && <Faqs />}</>;
}

function People() {
  const db = useDb(); const { session } = useApp(); const caps = useCaps(); const [edit, setEdit] = useState<AppUser | null>(null); const [add, setAdd] = useState(false);
  const staff = db.users.filter(u => u.kind === 'staff' && u.orgId === session!.orgId);
  const roleLabel = (k?: string) => db.roles.find(r => r.orgId === session!.orgId && r.key === k)?.label || k;
  return <>{caps.has('users') && <div className="spread" style={{ marginBottom: 12 }}><span /><button className="btn primary" onClick={() => setAdd(true)}><Icon n="plus" s={18} /> Add person</button></div>}
    <div className="card"><Table columns={['Name', 'Role', 'Department', 'Week', 'Today', 'Login']} onRow={i => caps.has('users') && setEdit(staff[i])} rows={staff.map(u => [<div className="row"><Avatar name={u.displayName} size={30} /><b className="small">{u.displayName}</b></div>, roleLabel(u.roleKey), db.departments.find(d => d.id === u.deptId)?.name || 'All',
      <div className="rota" style={{ width: 196 }}>{(u.rota || defaultRota()).map((r, i) => <button key={i} className={r.on ? 'on' : ''} title={`${DAYS[i]} ${r.on ? r.start + '–' + r.end : 'off'}`}>{DAYS[i][0]}</button>)}</div>,
      onLeave(u, today()) ? <TierPill t="amber" label="On leave" /> : onRota(u, today()) ? <TierPill t="green" label="On" /> : <span className="pill">Off</span>, <span className="tiny muted">{u.username}{u.active ? '' : ' (disabled)'}</span>])} /></div>
    {edit && <EditPerson u={edit} onClose={() => setEdit(null)} />}{add && <AddPerson onClose={() => setAdd(false)} />}</>;
}

function EditPerson({ u, onClose }: { u: AppUser; onClose: () => void }) {
  const db = useDb(); const { actions, session } = useApp();
  const [f, setF] = useState({ displayName: u.displayName, roleKey: u.roleKey || '', deptId: u.deptId || '', phone: u.phone || '', active: u.active });
  const [rota, setRota] = useState<RotaDay[]>(u.rota || defaultRota()); const [leave, setLeave] = useState(u.leave || []); const [lv, setLv] = useState({ from: today(), to: today(), type: 'Annual leave' });
  const save = async () => { await actions.patch('users', u.id, { ...f, rota, leave }); actions.audit('user.update', u.username); onClose(); };
  return <Modal title={u.displayName} onClose={onClose} wide><div className="form">
    <div className="grid g2"><Field label="Name"><input className="input" value={f.displayName} onChange={e => setF({ ...f, displayName: e.target.value })} /></Field><Field label="Phone"><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Role"><select className="input" value={f.roleKey} onChange={e => setF({ ...f, roleKey: e.target.value })}>{db.roles.filter(r => r.orgId === session!.orgId).map(r => <option key={r.id} value={r.key}>{r.label}</option>)}</select></Field>
      <Field label="Department"><select className="input" value={f.deptId} onChange={e => setF({ ...f, deptId: e.target.value })}><option value="">All departments</option>{db.departments.filter(d => d.orgId === session!.orgId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field></div>
    <h3>Weekly rota</h3><div className="tiny muted">Set once; repeats every week. Tasks go to whoever is on.</div>
    {rota.map((r, i) => <div className="row wrap" key={i}><label className="row" style={{ width: 90 }}><input type="checkbox" checked={r.on} onChange={e => setRota(rota.map((x, j) => j === i ? { ...x, on: e.target.checked } : x))} /> <b className="small">{DAYS[i]}</b></label>
      <input type="time" className="input" style={{ width: 130 }} disabled={!r.on} value={r.start} onChange={e => setRota(rota.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} /><span>–</span><input type="time" className="input" style={{ width: 130 }} disabled={!r.on} value={r.end} onChange={e => setRota(rota.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
      <label className="row small"><input type="checkbox" checked={r.onCall} disabled={!r.on} onChange={e => setRota(rota.map((x, j) => j === i ? { ...x, onCall: e.target.checked } : x))} /> on call</label></div>)}
    <h3>Leave</h3>{leave.map(l => <div className="row" key={l.id}><span className="small grow">{l.type}: {l.from} → {l.to}</span><button className="iconbtn" onClick={() => setLeave(leave.filter(x => x.id !== l.id))}><Icon n="trash" s={16} /></button></div>)}
    <div className="row wrap"><input type="date" className="input" style={{ width: 160 }} value={lv.from} onChange={e => setLv({ ...lv, from: e.target.value })} /><input type="date" className="input" style={{ width: 160 }} value={lv.to} onChange={e => setLv({ ...lv, to: e.target.value })} /><select className="input" style={{ width: 160 }} value={lv.type} onChange={e => setLv({ ...lv, type: e.target.value })}>{['Annual leave', 'Sick leave', 'Conference', 'Other'].map(x => <option key={x}>{x}</option>)}</select><button className="btn soft" onClick={() => setLeave([...leave, { id: uid('lv'), ...lv }])}>Add leave</button></div>
    <label className="row"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Login enabled</label>
    <button className="btn primary block" onClick={save}>Save</button></div></Modal>;
}

function AddPerson({ onClose }: { onClose: () => void }) {
  const db = useDb(); const { actions, session } = useApp(); const roles = db.roles.filter(r => r.orgId === session!.orgId);
  const [f, setF] = useState({ displayName: '', username: '', password: 'saathi123', roleKey: roles[1]?.key || '', deptId: '', phone: '' }); const [err, setErr] = useState('');
  const save = async () => { setErr(''); if (!f.displayName || !f.username) { setErr('Name and username are required'); return; }
    try { await actions.createUser({ displayName: f.displayName, username: f.username.trim().toLowerCase(), kind: 'staff', orgId: session!.orgId, roleKey: f.roleKey, deptId: f.deptId || undefined, phone: f.phone, rota: defaultRota(), leave: [] }, f.password); actions.toast(`${f.displayName} can now sign in as “${f.username}”`); onClose(); } catch (e: any) { setErr(e.message); } };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return <Modal title="Add person" onClose={onClose}><div className="form">
    <Field label="Full name"><input className="input" value={f.displayName} onChange={set('displayName')} /></Field>
    <div className="grid g2"><Field label="Role"><select className="input" value={f.roleKey} onChange={set('roleKey')}>{roles.map(r => <option key={r.id} value={r.key}>{r.label}</option>)}</select></Field><Field label="Department"><select className="input" value={f.deptId} onChange={set('deptId')}><option value="">All</option>{db.departments.filter(d => d.orgId === session!.orgId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Username"><input className="input" autoCapitalize="none" value={f.username} onChange={set('username')} /></Field><Field label="Temporary password"><input className="input" value={f.password} onChange={set('password')} /></Field></div>
    <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
    {err && <div className="err">{err}</div>}<button className="btn primary block" onClick={save}>Create login</button></div></Modal>;
}

function Roles() {
  const db = useDb(); const { actions, session } = useApp(); const roles = db.roles.filter(r => r.orgId === session!.orgId); const [edit, setEdit] = useState<Role | null>(null);
  const inUse = (k: string) => db.users.filter(u => u.orgId === session!.orgId && u.roleKey === k).length;
  return <><div className="spread" style={{ marginBottom: 12 }}><span /><button className="btn primary" onClick={() => setEdit({ id: '', orgId: session!.orgId!, key: '', label: '', caps: ['monitor'], scope: 'dept', does: [] })}><Icon n="plus" s={18} /> Add role</button></div>
    <div className="card"><Table columns={['Role', 'Can', 'Pathway tasks', 'Scope', 'People', '']} rows={roles.map(r => [<b>{r.label}</b>, <span className="tiny">{r.caps.map(c => CAPS.find(x => x[0] === c)?.[1]).join(' · ')}</span>, <span className="small">{r.does.join(', ') || '—'}</span>, r.scope, inUse(r.key),
      <div className="row"><button className="iconbtn" onClick={() => setEdit(r)}><Icon n="edit" s={16} /></button><button className="iconbtn" disabled={inUse(r.key) > 0} title={inUse(r.key) ? 'Reassign people first' : 'Delete'} onClick={() => actions.del('roles', r.id)}><Icon n="trash" s={16} /></button></div>])} /></div>
    {edit && <Modal title={edit.id ? 'Edit role' : 'Add role'} onClose={() => setEdit(null)}><div className="form">
      <Field label="Name"><input className="input" value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value, key: edit.id ? edit.key : e.target.value.toLowerCase().replace(/[^a-z]+/g, '_') })} /></Field>
      <Field label="Permissions"><div className="col" style={{ gap: 6 }}>{CAPS.map(([c, l]) => <label key={c} className="row small"><input type="checkbox" checked={edit.caps.includes(c)} onChange={e => setEdit({ ...edit, caps: e.target.checked ? [...edit.caps, c] : edit.caps.filter(x => x !== c) })} />{l}</label>)}</div></Field>
      <Field label="Receives pathway tasks for"><div className="chips">{WHO.map(w => <button key={w} className={`chip ${edit.does.includes(w) ? 'on' : ''}`} onClick={() => setEdit({ ...edit, does: edit.does.includes(w) ? edit.does.filter(x => x !== w) : [...edit.does, w] })}>{w}</button>)}</div></Field>
      <Field label="Sees patients in"><Seg value={edit.scope} onChange={v => setEdit({ ...edit, scope: v })} options={[['dept', 'Own department'], ['all', 'Whole organisation']]} /></Field>
      <button className="btn primary block" disabled={!edit.label} onClick={async () => { if (edit.id) await actions.patch('roles', edit.id, edit); else await actions.put('roles', { ...edit, id: uid('role') }); setEdit(null); }}>Save</button></div></Modal>}</>;
}

function Depts() {
  const db = useDb(); const { actions, session } = useApp(); const [name, setName] = useState('');
  const ds = db.departments.filter(d => d.orgId === session!.orgId);
  return <div className="card"><div className="list">{ds.map(d => <div className="li" key={d.id}><Icon n="building" /><input className="input grow" defaultValue={d.name} onBlur={e => e.target.value !== d.name && actions.patch('departments', d.id, { name: e.target.value })} /><span className="small muted">{db.users.filter(u => u.deptId === d.id).length} people · {db.patients.filter(p => p.primaryDeptId === d.id).length} patients</span>
    <button className="iconbtn" disabled={db.users.some(u => u.deptId === d.id)} onClick={() => actions.del('departments', d.id)}><Icon n="trash" s={16} /></button></div>)}</div>
    <div className="row" style={{ marginTop: 10 }}><input className="input grow" placeholder="New department" value={name} onChange={e => setName(e.target.value)} /><button className="btn primary" disabled={!name} onClick={async () => { await actions.put('departments', { id: uid('dep'), orgId: session!.orgId!, name }); setName(''); }}>Add</button></div></div>;
}

function OrgDetails() {
  const db = useDb(); const { actions, session } = useApp(); const o = db.orgs.find(x => x.id === session!.orgId); const [f, setF] = useState<Org | undefined>(o);
  if (!f) return <Empty>No organisation</Empty>;
  const set = (k: keyof Org) => (e: any) => setF({ ...f, [k]: e.target.value });
  return <div className="card form"><div className="grid g2">
    <Field label="Name"><input className="input" value={f.name} onChange={set('name')} /></Field><Field label="Type"><select className="input" value={f.type} onChange={set('type')}>{['Clinic', 'Hospital', 'Hospital network', 'Cancer centre', 'Diagnostic centre'].map(x => <option key={x}>{x}</option>)}</select></Field>
    <Field label="City"><input className="input" value={f.city} onChange={set('city')} /></Field><Field label="Address"><input className="input" value={f.address} onChange={set('address')} /></Field>
    <Field label="Reception phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field><Field label="Emergency number (shown to patients)"><input className="input" value={f.emergency} onChange={set('emergency')} /></Field>
    <Field label="Ambulance"><input className="input" value={f.ambulance} onChange={set('ambulance')} /></Field><Field label="OPD days"><select className="input" value={f.opdDays} onChange={set('opdDays')}>{['Mon–Sat', 'Mon–Fri', 'Every day'].map(x => <option key={x}>{x}</option>)}</select></Field>
    <Field label="OPD opens"><input type="time" className="input" value={f.opdOpen} onChange={set('opdOpen')} /></Field><Field label="OPD closes"><input type="time" className="input" value={f.opdClose} onChange={set('opdClose')} /></Field></div>
    <button className="btn primary" onClick={async () => { await actions.patch('orgs', f.id, f); actions.toast('Saved'); }}>Save</button></div>;
}

function Faqs() {
  const db = useDb(); const { actions, session } = useApp(); const caps = useCaps(); const list = db.faq.filter(f => f.orgId === session!.orgId); const [f, setF] = useState({ q: '', a: '', tags: '' });
  return <div className="col"><div className="small muted">Saathi answers patients from these approved answers first. Anything else goes to the care team.</div>
    <div className="card"><div className="list">{list.map(x => <div className="li" key={x.id} style={{ alignItems: 'flex-start' }}><div className="grow"><b className="small">{x.q}</b><div className="small">{x.a}</div><div className="tiny muted">{x.tags} · {x.status}{x.approvedBy ? ` by ${x.approvedBy}` : ''}</div></div>
      {x.status !== 'approved' && caps.has('sign') && <button className="btn sm soft" onClick={() => actions.patch('faq', x.id, { status: 'approved', approvedBy: session!.name })}>Approve</button>}<button className="iconbtn" onClick={() => actions.patch('faq', x.id, { status: 'retired' })}><Icon n="trash" s={16} /></button></div>)}{!list.length && <Empty>No answers yet</Empty>}</div></div>
    <div className="card form"><h3>Add an answer</h3><Field label="Question"><input className="input" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} /></Field><Field label="Answer (plain language)"><textarea className="input" value={f.a} onChange={e => setF({ ...f, a: e.target.value })} /></Field><Field label="Keywords"><input className="input" value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })} placeholder="e.g. shower wound bath" /></Field>
      <button className="btn primary" disabled={!f.q || !f.a} onClick={async () => { await actions.put('faq', { id: uid('faq'), orgId: session!.orgId!, ...f, status: caps.has('sign') ? 'approved' : 'draft', approvedBy: caps.has('sign') ? session!.name : undefined }); setF({ q: '', a: '', tags: '' }); }}>{caps.has('sign') ? 'Add & approve' : 'Add as draft'}</button></div></div>;
}

// ---------------- platform ----------------
export function PlatformAdmin() {
  const db = useDb(); const { actions, mode } = useApp(); const [add, setAdd] = useState(false);
  const [f, setF] = useState({ name: '', type: 'Hospital', city: '', phone: '', emergency: '', admin: '', adminName: '', password: 'saathi123' }); const [err, setErr] = useState('');
  const create = async () => {
    setErr(''); if (!f.name || !f.admin) { setErr('Organisation name and admin username are required'); return; }
    try {
      const id = uid('org'); await actions.put('orgs', { id, name: f.name, type: f.type as any, city: f.city, address: '', phone: f.phone, emergency: f.emergency, ambulance: '108', opdDays: 'Mon–Sat', opdOpen: '09:00', opdClose: '17:00' });
      for (const r of db.roles.filter(r => r.orgId === db.orgs[0].id)) await actions.put('roles', { ...r, id: uid('role'), orgId: id });
      await actions.put('departments', { id: uid('dep'), orgId: id, name: 'General' });
      await actions.createUser({ username: f.admin.trim().toLowerCase(), displayName: f.adminName || f.admin, kind: 'staff', orgId: id, roleKey: 'admin', rota: defaultRota(), leave: [] }, f.password);
      actions.toast(`${f.name} created`); setAdd(false);
    } catch (e: any) { setErr(e.message); }
  };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return <><Top title="Platform" sub={`${db.orgs.length} organisations · ${db.users.length} users · ${db.patients.length} patients · ${mode} mode`}><button className="btn primary" onClick={() => setAdd(true)}><Icon n="plus" s={18} /> New organisation</button></Top>
    <div className="card"><Table columns={['Organisation', 'Type', 'City', 'Departments', 'Staff', 'Patients']} rows={db.orgs.map(o => [<b>{o.name}</b>, o.type, o.city, db.departments.filter(d => d.orgId === o.id).length, db.users.filter(u => u.orgId === o.id).length, db.patients.filter(p => p.orgIds.includes(o.id)).length])} /></div>
    <div className="card"><h3>All users</h3><Table columns={['Name', 'Username', 'Kind', 'Organisation', 'Role']} rows={db.users.map(u => [u.displayName, u.username, u.kind, db.orgs.find(o => o.id === u.orgId)?.name || '—', u.roleKey || '—'])} /></div>
    {mode === 'demo' && <ResetDemo />}
    {add && <Modal title="New organisation" onClose={() => setAdd(false)}><div className="form">
      <div className="grid g2"><Field label="Name"><input className="input" value={f.name} onChange={set('name')} /></Field><Field label="Type"><select className="input" value={f.type} onChange={set('type')}>{['Clinic', 'Hospital', 'Hospital network', 'Cancer centre', 'Diagnostic centre'].map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="City"><input className="input" value={f.city} onChange={set('city')} /></Field><Field label="Emergency number"><input className="input" value={f.emergency} onChange={set('emergency')} /></Field></div>
      <h3>First admin</h3><div className="grid g3"><Field label="Name"><input className="input" value={f.adminName} onChange={set('adminName')} /></Field><Field label="Username"><input className="input" value={f.admin} onChange={set('admin')} /></Field><Field label="Password"><input className="input" value={f.password} onChange={set('password')} /></Field></div>
      {err && <div className="err">{err}</div>}<button className="btn primary block" onClick={create}>Create</button></div></Modal>}</>;
}
function ResetDemo() { const { signOut } = useApp(); return <div className="card"><h3>Demo data</h3><div className="small muted">Reset this device's synthetic data back to the starting state.</div><button className="btn" style={{ marginTop: 8 }} onClick={async () => { const { demoStore } = await import('../../data/demoStore'); await demoStore.resetDemo!(); await signOut(); }}>Reset demo data</button></div>; }
