// Analytics as predefined tools. Voice/text questions are mapped to one of these tools with
// parameters (by the intent parser below, or by Claude via tool-use on the server). Never raw SQL.

import type { Db } from '../data/store';
import { addDays, daysBetween, today } from '../lib/dates';
import { kb } from '../knowledge';
import { adherence } from './rules';

export interface Table_ { title: string; columns: string[]; rows: (string | number)[][]; note?: string }
export interface Tool { name: string; description: string; params: Record<string, string>; run: (db: Db, p: any) => Table_ }

const pname = (db: Db, id: string) => db.patients.find(p => p.id === id)?.name || id;
const refName = (ref: string) => kb.get(ref)?.name || ref;

export const TOOLS: Tool[] = [
  { name: 'patients_by_treatment', description: 'Patients who started a treatment (drug, regimen, procedure) in the last N days', params: { ref: 'knowledge-base key', days: 'number' },
    run: (db, { ref, days = 180 }) => {
      const since = addDays(today(), -days);
      const rows = db.treatments.filter(t => (!ref || t.ref === ref || kb.get(t.ref)?.components?.includes(ref)) && t.startDate >= since)
        .map(t => [pname(db, t.patientId), t.label, t.startDate, t.status, db.adverse_events.filter(a => a.patientId === t.patientId && a.suspected.includes(t.id)).length]);
      return { title: `${ref ? refName(ref) : 'All treatments'} · last ${days} days`, columns: ['Patient', 'Treatment', 'Started', 'Status', 'Side effects'], rows };
    } },
  { name: 'open_alerts', description: 'Open alerts by tier', params: { tier: 'red|amber|any' },
    run: (db, { tier = 'any' }) => ({ title: 'Open alerts', columns: ['Tier', 'Patient', 'Alert', 'Raised'], rows: db.alerts.filter(a => a.status !== 'resolved' && (tier === 'any' || a.tier === tier)).sort((a, b) => (a.tier === 'red' ? -1 : 1) - (b.tier === 'red' ? -1 : 1)).map(a => [a.tier.toUpperCase(), pname(db, a.patientId), a.title, a.createdAt.slice(0, 10)]) }) },
  { name: 'side_effects_by_drug', description: 'Adverse events grouped by suspected treatment', params: { ref: 'optional key' },
    run: (db, { ref }) => {
      const m = new Map<string, { n: number; g3: number; terms: Set<string> }>();
      for (const a of db.adverse_events) for (const tid of a.suspected) {
        const t = db.treatments.find(x => x.id === tid); if (!t || (ref && t.ref !== ref)) continue;
        const k = refName(t.ref); const e = m.get(k) || { n: 0, g3: 0, terms: new Set() }; e.n++; if (a.grade >= 3) e.g3++; e.terms.add(`${a.term} G${a.grade}`); m.set(k, e);
      }
      return { title: 'Side effects by treatment', columns: ['Treatment', 'Events', 'Grade ≥3', 'Terms'], rows: [...m].map(([k, v]) => [k, v.n, v.g3, [...v.terms].join('; ')]) };
    } },
  { name: 'adherence', description: 'Medicine adherence over the last N days', params: { days: 'number' },
    run: (db, { days = 7 }) => {
      const since = addDays(today(), -days);
      const rows = db.patients.map(p => { const a = adherence(db.doses.filter(d => d.patientId === p.id && d.date >= since && d.date < today())); return [p.name, a.pct == null ? '—' : `${a.pct}%`, a.taken, a.skipped, a.noAnswer]; });
      return { title: `Adherence · last ${days} days`, columns: ['Patient', 'Taken', 'Doses taken', 'Skipped', 'No answer'], rows, note: '“No answer” means the reminder was not acknowledged. It is counted separately from “skipped”.' };
    } },
  { name: 'activity', description: 'Average daily steps last N days', params: { days: 'number' },
    run: (db, { days = 7 }) => {
      const since = addDays(today(), -days);
      const rows = db.patients.map(p => { const s = db.observations.filter(o => o.patientId === p.id && o.type === 'steps' && o.date >= since); const avg = s.length ? Math.round(s.reduce((a, b) => a + b.value, 0) / s.length) : 0; return [p.name, s.length ? avg : '—', s.length ? Math.max(...s.map(x => x.value)) : '—']; });
      return { title: `Activity · last ${days} days`, columns: ['Patient', 'Avg steps/day', 'Best day'], rows };
    } },
  { name: 'labs_abnormal', description: 'Abnormal or unconfirmed lab results', params: { days: 'number' },
    run: (db, { days = 14 }) => ({ title: `Abnormal labs · last ${days} days`, columns: ['Patient', 'Test', 'Value', 'Range', 'Date', 'Status'],
      rows: db.labs.filter(l => daysBetween(l.date, today()) <= days && ((l.refHigh != null && l.value > l.refHigh) || (l.refLow != null && l.value < l.refLow) || l.status === 'candidate')).map(l => [pname(db, l.patientId), l.name, `${l.value} ${l.unit}`, `${l.refLow ?? ''}–${l.refHigh ?? ''}`, l.date, l.status]) }) },
];

/** Simple intent parser so voice analytics work offline. The server can swap this for Claude tool-use. */
export function parseQuery(text: string): { tool: Tool; params: any } | null {
  const t = text.toLowerCase();
  const daysM = t.match(/(\d+)\s*(day|week|month)/); const days = daysM ? Number(daysM[1]) * (daysM[2] === 'week' ? 7 : daysM[2] === 'month' ? 30 : 1) : undefined;
  const tool = (n: string) => TOOLS.find(x => x.name === n)!;
  if (/alert|red flag|urgent/.test(t)) return { tool: tool('open_alerts'), params: { tier: /red/.test(t) ? 'red' : /amber/.test(t) ? 'amber' : 'any' } };
  if (/adheren|missed|compliance|doses/.test(t)) return { tool: tool('adherence'), params: { days } };
  if (/step|walk|activity/.test(t)) return { tool: tool('activity'), params: { days } };
  if (/lab|blood test|abnormal/.test(t)) return { tool: tool('labs_abnormal'), params: { days } };
  const drug = kb.all.find(p => t.includes(p.name.toLowerCase().split(' ')[0].toLowerCase()) || t.includes(p.key.toLowerCase()) || (p.brandsIN || []).some(b => t.includes(b.toLowerCase().split(' ')[0])));
  if (/side effect|adverse|toxicit/.test(t)) return { tool: tool('side_effects_by_drug'), params: { ref: drug?.key } };
  if (drug || /patients? (who|on|with)|undergone|started/.test(t)) return { tool: tool('patients_by_treatment'), params: { ref: drug?.key, days: days ?? 180 } };
  return null;
}
