// Pathway → dated tasks per role, assigned to whoever is on the rota that day (with leave cover).

import type { AppUser, Pathway, PathwayItem, PathwayWho, Treatment } from '../data/types';
import { addDays, daysBetween, weekday } from '../lib/dates';

export interface DatedTask { key: string; pathwayId: string; patientId: string; item: PathwayItem; date: string; time: string; who: PathwayWho; dayIndex: number }

export function itemOccursOn(item: PathwayItem, dayIndex: number): boolean {
  if (dayIndex < item.from || dayIndex > item.to) return false;
  if (item.repeat === 'once') return dayIndex === item.from;
  if (item.repeat === 'weekly') return (dayIndex - item.from) % 7 === 0;
  if (item.repeat === 'monthly') return (dayIndex - item.from) % 30 === 0;
  return true;
}

export function tasksOn(pathways: Pathway[], date: string): DatedTask[] {
  const out: DatedTask[] = [];
  for (const pw of pathways) {
    if (pw.status !== 'active') continue;
    const d = daysBetween(pw.start, date);
    for (const it of pw.items) if (itemOccursOn(it, d)) for (const time of it.times.length ? it.times : ['09:00'])
      out.push({ key: `${pw.id}|${it.id}|${date}|${time}`, pathwayId: pw.id, patientId: pw.patientId, item: it, date, time, who: it.who, dayIndex: d });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export const onLeave = (u: AppUser, date: string) => (u.leave || []).some(l => date >= l.from && date <= l.to);
export const onRota = (u: AppUser, date: string) => { const r = u.rota?.[weekday(date)]; return !!r?.on && !onLeave(u, date); };

/** Assign a role task to a staff member: first rostered user of that role, otherwise a cover from the same org. */
export function assignee(staff: AppUser[], roleKeyForWho: (w: PathwayWho) => string[], who: PathwayWho, date: string, orgIds: string[]): { user?: AppUser; cover: boolean; reason: string } {
  const keys = roleKeyForWho(who);
  const pool = staff.filter(u => u.kind === 'staff' && u.active && u.roleKey && keys.includes(u.roleKey) && (!u.orgId || orgIds.includes(u.orgId)));
  const primary = pool.find(u => onRota(u, date));
  if (primary) return { user: primary, cover: false, reason: 'On rota' };
  const anyOn = staff.find(u => u.kind === 'staff' && u.active && onRota(u, date) && (!u.orgId || orgIds.includes(u.orgId)) && u.roleKey && ['doctor', 'nurse', 'coordinator'].includes(u.roleKey));
  if (anyOn) return { user: anyOn, cover: true, reason: pool.length ? `${pool[0].displayName} off today → cover` : 'No one in this role → cover' };
  return { cover: true, reason: 'Nobody on rota: unassigned' };
}

/** Patient's medicine doses for a date from active drug treatments. */
export function dosesOn(treatments: Treatment[], date: string): { treatmentId: string; label: string; time: string; food?: string }[] {
  const out: { treatmentId: string; label: string; time: string; food?: string }[] = [];
  for (const t of treatments) {
    if (t.status !== 'active' || t.kind !== 'drug' || !t.times?.length) continue;
    if (date < t.startDate || (t.endDate && date > t.endDate)) continue;
    if (t.cycle) { const d = daysBetween(t.startDate, date) % t.cycle.lengthDays; if (t.notes?.includes('days 1-14') && d > 13) continue; }
    for (const time of t.times) out.push({ treatmentId: t.id, label: t.label, time, food: t.food });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export const nextDays = (start: string, n: number) => Array.from({ length: n }, (_, i) => addDays(start, i));
