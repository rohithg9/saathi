// Monitoring plan: merges the checks and labs of every active treatment (drugs, regimens, procedures,
// conditions), adds interaction checks, and works out what is due on a given date.
// Deterministic. No LLM involved.

import type { Patient, Treatment } from '../data/types';
import { daysBetween, addDays } from '../lib/dates';
import { CLASS_INTERACTIONS, Check, LabRule, Profile, Schedule, kb } from '../knowledge';

export interface PlannedCheck { check: Check; sources: { treatmentId: string; ref: string; name: string; startDate: string; cycle?: Treatment['cycle'] }[]; reason: string[] }
export interface PlannedLab { lab: LabRule; sources: { treatmentId: string; name: string; startDate: string; cycle?: Treatment['cycle'] }[] }
export interface MonitoringPlan { checks: PlannedCheck[]; labs: PlannedLab[]; interactions: { id: string; effect: string; between: string[] }[]; drafts: string[]; unknown: string[] }

/** Expand a treatment to the profiles it brings in (a regimen brings its component drugs). */
export function profilesFor(t: Treatment): Profile[] {
  const p = kb.get(t.ref); if (!p) return [];
  if (p.kind === 'regimen') return [p, ...(p.components || []).map(k => kb.get(k)).filter(Boolean) as Profile[]];
  return [p];
}

const tagsOf = (p: Profile) => new Set([p.key, ...(p.tags || [])]);

export function buildPlan(patient: Pick<Patient, 'conditions'>, treatments: Treatment[]): MonitoringPlan {
  const active = treatments.filter(t => t.status === 'active');
  const checks = new Map<string, PlannedCheck>();
  const labs = new Map<string, PlannedLab>();
  const drafts = new Set<string>(); const unknown: string[] = [];
  const profilesByTreatment: { t: Treatment; ps: Profile[] }[] = [];

  for (const t of active) {
    const ps = profilesFor(t);
    if (!ps.length) { unknown.push(t.label); continue; }
    profilesByTreatment.push({ t, ps });
    for (const p of ps) {
      if (p.status !== 'APPROVED') drafts.add(p.name);
      const cycle = t.cycle || (p.cycleDays ? { lengthDays: p.cycleDays, count: 6 } : undefined);
      for (const c of p.checks) addCheck(checks, c, { treatmentId: t.id, ref: p.key, name: p.name, startDate: t.startDate, cycle }, `${p.name}: ${c.label}`);
      for (const l of p.labs) {
        const cur = labs.get(l.code);
        const src = { treatmentId: t.id, name: p.name, startDate: t.startDate, cycle };
        if (cur) cur.sources.push(src); else labs.set(l.code, { lab: l, sources: [src] });
      }
    }
  }
  // patient conditions listed on the record without a treatment row still get their condition checks
  for (const ck of patient.conditions || []) {
    if (active.some(t => t.ref === ck)) continue;
    const p = kb.get(ck); if (!p || p.kind !== 'condition') continue;
    if (p.status !== 'APPROVED') drafts.add(p.name);
    for (const c of p.checks) addCheck(checks, c, { treatmentId: `cond:${ck}`, ref: ck, name: p.name, startDate: '1970-01-01' }, `${p.name}: ${c.label}`);
  }

  // drug-specific interactions declared on a profile
  const interactions: MonitoringPlan['interactions'] = [];
  const all = profilesByTreatment.flatMap(x => x.ps.map(p => ({ t: x.t, p })));
  for (const { t, p } of all) for (const ix of p.interactions || []) {
    const hit = all.find(o => o.p.key !== p.key && ix.with.some(w => tagsOf(o.p).has(w)));
    if (!hit) continue;
    interactions.push({ id: `${p.key}+${hit.p.key}`, effect: ix.effect, between: [p.name, hit.p.name] });
    for (const c of ix.addChecks || []) addCheck(checks, c, { treatmentId: t.id, ref: p.key, name: p.name, startDate: t.startDate }, `Interaction: ${ix.effect}`);
    for (const l of ix.addLabs || []) labs.set(`${l.code}:${p.key}+${hit.p.key}`, { lab: l, sources: [{ treatmentId: t.id, name: `${p.name} + ${hit.p.name}`, startDate: t.startDate }] });
  }
  // class-level interactions
  for (const rule of CLASS_INTERACTIONS) {
    const A = all.filter(x => rule.a.some(tag => tagsOf(x.p).has(tag)));
    const B = all.filter(x => rule.b.some(tag => tagsOf(x.p).has(tag)));
    const pair = A.flatMap(a => B.filter(b => b.p.key !== a.p.key).map(b => [a, b] as const))[0];
    if (!pair) continue;
    const [a, b] = pair; const later = a.t.startDate > b.t.startDate ? a.t : b.t;
    interactions.push({ id: rule.id, effect: rule.effect, between: [a.p.name, b.p.name] });
    for (const c of rule.addChecks || []) addCheck(checks, c, { treatmentId: later.id, ref: rule.id, name: `${a.p.name} + ${b.p.name}`, startDate: later.startDate }, `Interaction: ${rule.effect}`);
    for (const l of rule.addLabs || []) labs.set(`${l.code}:${rule.id}`, { lab: l, sources: [{ treatmentId: later.id, name: `${a.p.name} + ${b.p.name}`, startDate: later.startDate }] });
  }
  return { checks: [...checks.values()], labs: [...labs.values()], interactions, drafts: [...drafts], unknown };
}

function addCheck(map: Map<string, PlannedCheck>, c: Check, src: PlannedCheck['sources'][0], reason: string) {
  const cur = map.get(c.id);
  if (cur) { if (!cur.sources.some(s => s.treatmentId === src.treatmentId && s.ref === src.ref)) cur.sources.push(src); cur.reason.push(reason); return; }
  map.set(c.id, { check: c, sources: [src], reason: [reason] });
}

/** Which day of which cycle a date falls on (1-based), or null if outside the treatment's cycles. */
export function cycleDay(start: string, date: string, cycle?: Treatment['cycle']): { cycle: number; day: number } | null {
  if (!cycle) return null;
  if (cycle.day1Dates?.length) {
    const d1 = [...cycle.day1Dates].filter(x => x <= date).sort().pop(); if (!d1) return null;
    const n = cycle.day1Dates.indexOf(d1); const d = daysBetween(d1, date) + 1;
    return d <= cycle.lengthDays ? { cycle: n + 1, day: d } : null;
  }
  const d = daysBetween(start, date); if (d < 0) return null;
  const n = Math.floor(d / cycle.lengthDays); if (n >= cycle.count) return null;
  return { cycle: n + 1, day: (d % cycle.lengthDays) + 1 };
}

export function isDueOn(s: Schedule, dayIndex: number, cd: { day: number } | null): boolean {
  if (dayIndex < 0 && !(s.days || []).some(x => x < 0 && x === dayIndex)) return false;
  if (s.days?.includes(dayIndex)) return true;
  if (s.newDaily && dayIndex >= 0 && dayIndex < s.newDaily) return true;
  if (s.every) { const from = s.from ?? 14; if (dayIndex >= from && (s.until == null || dayIndex <= s.until) && (dayIndex - from) % s.every === 0) return true; }
  if (s.cycleDays && cd && s.cycleDays.includes(cd.day)) return true;
  return false;
}

export interface DueCheck { id: string; check: Check; sources: string[]; dayIndex: number; cycle?: { cycle: number; day: number } | null; why: string }

/**
 * Checks due on `date`. Red-flag questions come first; the patient is never asked more than `cap`
 * routine questions in a day (the rest roll to the clinician view as "deferred").
 */
export function dueChecks(plan: MonitoringPlan, date: string, cap = 6): { due: DueCheck[]; deferred: DueCheck[] } {
  const out: DueCheck[] = [];
  for (const pc of plan.checks) {
    for (const src of pc.sources) {
      const dayIndex = daysBetween(src.startDate, date);
      const cd = cycleDay(src.startDate, date, src.cycle);
      if (isDueOn(pc.check.schedule, dayIndex, cd)) {
        out.push({ id: pc.check.id, check: pc.check, sources: pc.sources.map(s => s.name), dayIndex, cycle: cd, why: cd ? `${src.name} · cycle ${cd.cycle} day ${cd.day}` : src.startDate === '1970-01-01' || dayIndex > 3650 ? src.name : `${src.name} · day ${dayIndex}` });
        break;
      }
    }
  }
  const isRed = (d: DueCheck) => Object.values(d.check.escalate || {}).includes('red');
  out.sort((a, b) => Number(isRed(b)) - Number(isRed(a)) || (a.check.type === 'question' ? 0 : 1) - (b.check.type === 'question' ? 0 : 1));
  const questions = out.filter(d => d.check.type === 'question');
  const other = out.filter(d => d.check.type !== 'question');
  const keepQ = questions.filter(isRed).concat(questions.filter(d => !isRed(d)).slice(0, Math.max(0, cap - questions.filter(isRed).length)));
  return { due: [...keepQ, ...other], deferred: questions.filter(d => !keepQ.includes(d)) };
}

/** Lab tests due within the window [from, to] inclusive. */
export function labsDue(plan: MonitoringPlan, from: string, to: string): { code: string; name: string; date: string; why: string; for: string }[] {
  const res: { code: string; name: string; date: string; why: string; for: string }[] = [];
  const span = daysBetween(from, to);
  for (const pl of plan.labs) for (const src of pl.sources) {
    const L = pl.lab;
    for (let i = 0; i <= span; i++) {
      const date = addDays(from, i); const d = daysBetween(src.startDate, date);
      let hit = false; let why = L.why;
      if (L.baseline && d === -1) { hit = true; why = `Baseline before starting · ${L.why}`; }
      if (L.days?.includes(d)) hit = true;
      if (L.everyWeeks && d > 0 && d % (L.everyWeeks * 7) === 0) hit = true;
      if (L.beforeEachCycle) { const cd = cycleDay(src.startDate, addDays(date, 1), src.cycle); if (cd && cd.day === 1 && cd.cycle > 1) { hit = true; why = `Before cycle ${cd.cycle} · ${L.why}`; } }
      if (hit) res.push({ code: L.code, name: L.name, date, why, for: src.name });
    }
  }
  const seen = new Set<string>();
  return res.sort((a, b) => a.date.localeCompare(b.date)).filter(r => { const k = r.code + r.date; if (seen.has(k)) return false; seen.add(k); return true; });
}
