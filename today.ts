// Builds a patient's day: medicine doses, pathway tasks and due check-ins, as one ordered list.
import type { Db } from '../data/store';
import type { Dose, Patient } from '../data/types';
import { buildPlan, dueChecks, DueCheck } from '../engine/plan';
import { dosesOn, tasksOn } from '../engine/schedule';
import i18n from '../i18n.json';

export type DayItem =
  | { key: string; kind: 'dose'; time: string; title: string; sub?: string; done: boolean; dose?: Dose; treatmentId: string }
  | { key: string; kind: 'task'; time: string; title: string; sub?: string; done: boolean; type: string; who: string }
  | { key: string; kind: 'checkin'; time: string; title: string; sub?: string; done: boolean; checks: DueCheck[] };

export function patientDay(db: Db, patient: Patient, date: string, who: 'patient' | 'carer' = 'patient') {
  const tx = db.treatments.filter(t => t.patientId === patient.id);
  const items: DayItem[] = [];
  if (who === 'patient') for (const d of dosesOn(tx, date)) {
    const row = db.doses.find(x => x.treatmentId === d.treatmentId && x.date === date && x.time === d.time);
    items.push({ key: `dose|${d.treatmentId}|${d.time}`, kind: 'dose', time: d.time, title: d.label, sub: d.food, done: !!row && row.status !== 'due' && row.status !== 'no_answer', dose: row, treatmentId: d.treatmentId });
  }
  const done = new Set(db.tasks_done.map(t => t.key));
  for (const t of tasksOn(db.pathways.filter(p => p.patientId === patient.id), date)) if (t.who === who && !/medic/i.test(t.item.type))
    items.push({ key: t.key, kind: 'task', time: t.time, title: t.item.title, sub: t.item.notes, done: done.has(t.key), type: t.item.type, who: t.who });
  const plan = buildPlan(patient, tx);
  const { due } = dueChecks(plan, date);
  const qs = due.filter(d => d.check.type === 'question');
  if (qs.length && who === 'patient') {
    const answered = new Set(db.check_results.filter(c => c.patientId === patient.id && c.date === date).map(c => c.checkId));
    const open = qs.filter(q => !answered.has(q.id));
    items.push({ key: `checkin|${date}`, kind: 'checkin', time: '10:30', title: 'How are you feeling?', sub: `${qs.length} quick question${qs.length > 1 ? 's' : ''}`, done: open.length === 0, checks: open });
  }
  items.sort((a, b) => a.time.localeCompare(b.time));
  return { items, plan, due };
}

type Lang = keyof typeof i18n;
export function say(lang: string, key: string, vars: Record<string, string | number> = {}) {
  const L = (i18n as any)[lang] || i18n.en; const t: string = L.say[key] || (i18n.en.say as any)[key] || '';
  return t.replace(/\{(\w)\}|\{(\w+)\}/g, (_: string, a: string, b: string) => String(vars[a || b] ?? ''));
}
export const ui = (lang: string, key: string) => ((i18n as any)[lang]?.ui?.[key] as string) || (i18n.en.ui as any)[key] || key;
export const LANGS = Object.entries(i18n).map(([k, v]: [string, any]) => ({ key: k as Lang, label: v.label, native: v.native }));
export const callName = (p: Patient) => p.callName || p.name.split(' ')[0];
export const minutes = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
