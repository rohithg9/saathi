import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider, useApp } from './app/state';
import { Login } from './ui/auth/Login';
import { PatientApp } from './ui/patient/PatientApp';
import { CarerApp } from './ui/carer/CarerApp';
import { StaffApp } from './ui/team/StaffApp';
import { Orb } from './ui/common/ui';
import { createAndroidChannel } from './native/bridge';

function Root() {
  const { session, db, booting, toasts } = useApp();
  let body: React.ReactNode;
  if (booting || (session && !db)) body = <div className="login-bg"><div className="col" style={{ alignItems: 'center' }}><Orb size={64} breathe /><div className="muted">Loading…</div></div></div>;
  else if (!session) body = <Login />;
  else if (session.kind === 'patient') body = <PatientApp />;
  else if (session.kind === 'carer') body = <CarerApp />;
  else body = <StaffApp />;
  return <>{body}<div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast ${t.tone || ''}`}>{t.text}</div>)}</div></>;
}

createAndroidChannel();
createRoot(document.getElementById('root')!).render(<AppProvider><Root /></AppProvider>);
