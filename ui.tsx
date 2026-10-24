import React, { useEffect } from 'react';
import type { Tier } from '../../data/types';

// ---------- icons (inline SVG, stroke = currentColor) ----------
const P: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  heart: 'M12 20s-7-4.4-9.2-9A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z',
  chat: 'M4 5h16v11H8l-4 4z', folder: 'M3 6h6l2 2h10v11H3z', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  pill: 'M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7zM7 7l7 7', walk: 'M13 4a2 2 0 1 0 0 .01M9 21l2-6 3 3v3m-6-9 3-3 3 2 2 3M9 9l-2 4',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0', alert: 'M12 3 2 20h20zM12 10v4m0 3v.01', check: 'M5 12l5 5 9-10',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6 6 18', mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zm-7 9a7 7 0 0 0 14 0M12 19v3',
  send: 'M4 12 20 4l-6 16-3-7z', users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6m3 16a6 6 0 0 0-3-5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  flow: 'M5 5h5v5H5zM14 14h5v5h-5zM7.5 10v4a2 2 0 0 0 2 2H14', book: 'M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM18 20H7', building: 'M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', task: 'M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11',
  phone: 'M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z', watch: 'M8 6V3h8v3M8 18v3h8v-3M6 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM12 10v2l1.5 1.5',
  lab: 'M9 3h6M10 3v6L5 19a1 1 0 0 0 1 2h12a1 1 0 0 0 1-2l-5-10V3', upload: 'M12 16V4m-5 5 5-5 5 5M4 20h16', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.3-4.3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4l3 2', speaker: 'M4 10v4h4l5 4V6L8 10zm12-1a4 4 0 0 1 0 6m2.5-8.5a8 8 0 0 1 0 11',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13', thermo: 'M10 13V5a2 2 0 0 1 4 0v8a4 4 0 1 1-4 0z', drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14', doc: 'M6 3h9l4 4v14H6zM14 3v5h5', back: 'M15 5l-7 7 7 7',
};
export function Icon({ n, s = 22, w = 1.9, style }: { n: string; s?: number; w?: number; style?: React.CSSProperties }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true"><path d={P[n] || P.grid} /></svg>;
}
export const TileIcon = ({ n, c }: { n: string; c: string }) => <span className="tile-ic" style={{ background: c }}><Icon n={n} s={20} w={2.1} /></span>;

export function Orb({ size = 44, breathe }: { size?: number; breathe?: boolean }) {
  return <span className={`orb ${breathe ? 'breathe' : ''}`} style={{ ['--s' as any]: `${size}px` }} aria-label="Saathi"><span className="bars"><i /><i /><i /><i /><i /></span></span>;
}

export function Modal({ onClose, children, title, wide }: { onClose: () => void; children: React.ReactNode; title?: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="scrim" onClick={e => e.target === e.currentTarget && onClose()}><div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
    {title != null && <div className="sheet-h"><h2>{title}</h2><button className="iconbtn" onClick={onClose} aria-label="Close"><Icon n="x" s={18} /></button></div>}
    {children}</div></div>;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg" role="tablist">{options.map(([v, l]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)} role="tab" aria-selected={v === value}>{l}</button>)}</div>;
}
export const TierPill = ({ t, label }: { t: Tier; label?: string }) => <span className={`pill ${t}`}><span className={`dot ${t}`} />{label || (t === 'red' ? 'Urgent' : t === 'amber' ? 'Review' : 'OK')}</span>;
export const Draft = () => <span className="draft" title="Draft clinical content: not for clinical use until approved by a pharmacist or doctor">DRAFT · NOT FOR CLINICAL USE</span>;
export const Empty = ({ children }: { children: React.ReactNode }) => <div className="empty small">{children}</div>;
export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="f">{label}{children}</label>;

export function Table({ columns, rows, onRow, stack = true }: { columns: string[]; rows: React.ReactNode[][]; onRow?: (i: number) => void; stack?: boolean }) {
  if (!rows.length) return <Empty>Nothing to show</Empty>;
  return <div className="tbl-wrap"><table className={`tbl ${stack ? 'stack' : ''}`}><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className={onRow ? 'click' : ''} onClick={() => onRow?.(i)}>{r.map((c, j) => <td key={j} data-l={columns[j]}>{c}</td>)}</tr>)}</tbody></table></div>;
}

/** Activity-style ring */
export function Ring({ pct, color, size = 86, w = 11, children }: { pct: number; color: string; size?: number; w?: number; children?: React.ReactNode }) {
  const r = (size - w) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}><circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeOpacity=".18" strokeWidth={w} fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: 'stroke-dasharray .6s' }} /></svg>
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 750 }}>{children}</div></div>;
}

/** Small line/bar chart with optional target line. Values in date order. */
export function MiniChart({ points, color = 'var(--brand)', target, kind = 'line', unit = '', h = 120, fmt = (v: number) => String(Math.round(v * 10) / 10) }: { points: { label: string; value: number; value2?: number }[]; color?: string; target?: number; kind?: 'line' | 'bar'; unit?: string; h?: number; fmt?: (v: number) => string }) {
  if (!points.length) return <Empty>No readings yet</Empty>;
  const W = 320, H = h, pad = { l: 6, r: 6, t: 18, b: 20 };
  const vals = points.flatMap(p => [p.value, p.value2 ?? p.value]).concat(target != null ? [target] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals); if (kind === 'bar') lo = 0; if (hi === lo) { hi += 1; lo -= kind === 'bar' ? 0 : 1; }
  const span = hi - lo; lo -= kind === 'bar' ? 0 : span * .12; hi += span * .12;
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const bw = Math.min(26, (W - pad.l - pad.r) / points.length * .62);
  const last = points[points.length - 1];
  return <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Latest ${fmt(last.value)} ${unit}`}>
    {target != null && <g><line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth="1" /><text x={W - pad.r} y={y(target) - 4} textAnchor="end" fontSize="10" fill="var(--muted)">target {fmt(target)}</text></g>}
    {kind === 'bar' ? points.map((p, i) => <rect key={i} x={x(i) - bw / 2} y={y(p.value)} width={bw} height={Math.max(2, y(lo) - y(p.value))} rx="5" fill={color} opacity={i === points.length - 1 ? 1 : .55} />)
      : <>{points.some(p => p.value2 != null) && <polyline fill="none" stroke={color} strokeOpacity=".45" strokeWidth="2" points={points.map((p, i) => `${x(i)},${y(p.value2 ?? p.value)}`).join(' ')} />}
        <polyline fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4.5 : 3} fill={i === points.length - 1 ? color : 'var(--card)'} stroke={color} strokeWidth="2" />)}</>}
    <text x={x(points.length - 1)} y={y(last.value) - 9} textAnchor={points.length > 1 ? 'end' : 'middle'} fontSize="12" fontWeight="700" fill="var(--ink)">{fmt(last.value)}{last.value2 != null ? `/${fmt(last.value2)}` : ''}</text>
    {points.map((p, i) => (points.length <= 8 || i % Math.ceil(points.length / 7) === 0 || i === points.length - 1) && <text key={'l' + i} x={x(i)} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--muted)">{p.label}</text>)}
  </svg>;
}

export function Avatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  const init = name.replace(/^(Dr|Mr|Ms|Mrs|Sr)\.?\s+/i, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return <span style={{ width: size, height: size, borderRadius: '50%', background: color || `hsl(${hue} 55% 46%)`, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * .38, flex: 'none' }}>{init}</span>;
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const age = (dob: string) => Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400e3));
