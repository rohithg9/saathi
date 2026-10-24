import React, { useEffect, useState } from 'react';
import { store, useApp } from '../../app/state';
import type { Org, UserKind } from '../../data/types';
import { DEMO_PASSWORD } from '../../data/seed';
import { Icon, Orb } from '../common/ui';
import { unlockAudio } from '../../native/bridge';

const WHO: { kind: UserKind; title: string; sub: string; icon: string; color: string }[] = [
  { kind: 'patient', title: 'I am a patient', sub: 'My medicines, exercises and Saathi', icon: 'heart', color: 'var(--meds)' },
  { kind: 'carer', title: 'I care for someone', sub: 'Family member or friend', icon: 'users', color: 'var(--activity)' },
  { kind: 'staff', title: 'Hospital or clinic team', sub: 'Doctors, nurses, physios, pharmacists, liaison', icon: 'building', color: 'var(--care)' },
];

export function Login() {
  const { signIn } = useApp();
  const [kind, setKind] = useState<UserKind | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [dir, setDir] = useState<Awaited<ReturnType<typeof store.directory>> | null>(null);
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { store.directory().then(setDir).catch(() => setDir({ orgs: [] })); }, []);

  const step = !kind ? 'who' : kind === 'staff' && !org ? 'org' : 'creds';
  const back = () => { setErr(''); if (step === 'creds' && kind === 'staff') setOrg(null); else { setKind(null); setOrg(null); } };
  const demo = (dir?.demoAccounts || []).filter(a => a.kind === kind && (kind !== 'staff' || a.org === org?.name));
  const go = async (e?: React.FormEvent, u = username, p = password) => {
    e?.preventDefault(); setErr(''); setBusy(true); unlockAudio();
    try { await signIn(u, p, kind!, org?.id); } catch (x: any) { setErr(x.message || 'Could not sign in'); } finally { setBusy(false); }
  };

  return <div className="login-bg"><div className="login col" style={{ gap: 18 }}>
    <div className="row" style={{ gap: 14 }}><Orb size={56} breathe /><div><h1>Saathi</h1><div className="muted">Your care companion</div></div></div>
    {step !== 'who' && <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={back}><Icon n="back" s={18} /> Back</button>}

    {step === 'who' && <>
      <h2>Who are you?</h2>
      {WHO.map(w => <button key={w.kind} className="who-card" onClick={() => setKind(w.kind)}>
        <span className="ic" style={{ background: w.color }}><Icon n={w.icon} s={26} w={2.1} /></span>
        <span className="grow"><b style={{ fontSize: 18 }}>{w.title}</b><div className="muted small">{w.sub}</div></span><span className="chev">›</span></button>)}
      <button className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={() => setKind('platform')}>Platform administrator</button>
    </>}

    {step === 'org' && <>
      <h2>Your hospital or clinic</h2>
      {(dir?.orgs || []).map(o => <button key={o.id} className="who-card" onClick={() => setOrg(o)}>
        <span className="ic" style={{ background: 'var(--care)' }}><Icon n="building" s={24} /></span>
        <span className="grow"><b>{o.name}</b><div className="muted small">{o.type} · {o.city}</div></span><span className="chev">›</span></button>)}
      {!dir?.orgs.length && <div className="muted">Loading organisations…</div>}
    </>}

    {step === 'creds' && <form className="card col" onSubmit={go} style={{ gap: 14 }}>
      <div><h2>Sign in</h2><div className="muted small">{kind === 'staff' ? org?.name : WHO.find(w => w.kind === kind)?.title || 'Platform administrator'}</div></div>
      <label className="f">Username<input className="input" autoCapitalize="none" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></label>
      <label className="f">Password<input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {err && <div className="err">{err}</div>}
      <button className="btn primary block xl" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {store.mode === 'demo' && demo.length > 0 && <div>
        <div className="small muted" style={{ margin: '4px 0 6px' }}>Demo accounts (synthetic). Password for all: <b className="num">{DEMO_PASSWORD}</b></div>
        <div className="list">{demo.map(a => <div key={a.username} className="li click" onClick={() => { setUsername(a.username); setPassword(DEMO_PASSWORD); go(undefined, a.username, DEMO_PASSWORD); }}>
          <div className="grow"><b className="small">{a.name}</b><div className="tiny muted">{a.username}{a.role ? ` · ${a.role}` : ''}</div></div><span className="chev">›</span></div>)}</div>
      </div>}
    </form>}
    <div className="tiny muted" style={{ textAlign: 'center' }}>{store.mode === 'demo' ? 'Demo mode: synthetic data stored on this device only.' : 'Secure sign-in'} · Not for clinical use until clinical content is approved.</div>
  </div></div>;
}
