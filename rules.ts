// Deterministic escalation rules. Tiers come only from here (signed profile + CTCAE + combined rules).
// An LLM never sets or changes a tier.

import type { CheckResult, LabResult, Tier } from '../data/types';
import { Check, SEV_GRADE, gradeLab } from '../knowledge';

export const TIER_ORDER: Record<Tier, number> = { green: 0, amber: 1, red: 2 };
export const maxTier = (...t: Tier[]): Tier => t.reduce((a, b) => (TIER_ORDER[b] > TIER_ORDER[a] ? b : a), 'green' as Tier);

/** Default CTCAE grade → tier policy. TODO(clinical-review): each organisation confirms or edits this table. */
export const GRADE_TIER: Record<number, Tier> = { 0: 'green', 1: 'green', 2: 'amber', 3: 'red', 4: 'red', 5: 'red' };

export function evaluateAnswer(check: Check, answer: string): { tier: Tier; grade: number } {
  const tier = (check.escalate && check.escalate[answer]) || 'green';
  const grade = SEV_GRADE[answer] ?? 0;
  return { tier, grade };
}

export function evaluateLab(l: Pick<LabResult, 'code' | 'value' | 'unit' | 'refLow' | 'refHigh'>, baseline?: number) {
  const g = gradeLab({ code: l.code, value: l.value, unit: l.unit, refLow: l.refLow, refHigh: l.refHigh, baseline });
  if (!g) {
    const out = (l.refHigh != null && l.value > l.refHigh) || (l.refLow != null && l.value < l.refLow);
    return { grade: null as number | null, tier: (out ? 'amber' : 'green') as Tier, term: out ? `${l.code} outside reference range` : '', rule: out ? 'Outside lab reference range (no CTCAE grade for this test)' : '' };
  }
  return { grade: g.grade as number | null, tier: GRADE_TIER[g.grade], term: g.term, rule: `${g.rule} (CTCAE v5.0 grade ${g.grade})` };
}

export interface CombinedFinding { id: string; tier: Tier; title: string; evidence: string }

/**
 * Rules that need more than one signal. Inputs are the latest results for one patient.
 * TODO(clinical-review): thresholds and wording confirmed by the oncology / medical team.
 */
export function combinedRules(input: { recent: CheckResult[]; labs: LabResult[]; onChemo: boolean; onAnticoag: boolean; temps?: number[] }): CombinedFinding[] {
  const out: CombinedFinding[] = [];
  const yes = (id: string) => input.recent.some(r => r.checkId === id && (r.answer === 'yes' || r.answer === 'severe' || r.answer === 'moderate'));
  const latest = (code: string) => input.labs.filter(l => l.code === code && l.status === 'confirmed').sort((a, b) => b.date.localeCompare(a.date))[0];
  const anc = latest('ANC');
  if (input.onChemo && (yes('fever_chemo') || (input.temps || []).some(t => t >= 38))) {
    out.push({ id: 'febrile_neutropenia_suspected', tier: 'red', title: 'Fever during chemotherapy', evidence: anc ? `Fever reported; last ANC ${anc.value} ×10⁹/L on ${anc.date}` : 'Fever reported; no recent ANC on record' });
  }
  if (input.onAnticoag && yes('falls')) out.push({ id: 'fall_on_anticoagulant', tier: 'amber', title: 'Fall while on an anticoagulant', evidence: 'Patient reported a fall' });
  if (yes('calf') && yes('breathless')) out.push({ id: 'vte_suspected', tier: 'red', title: 'Calf symptoms with breathlessness', evidence: 'Calf pain/swelling and breathlessness both reported' });
  return out;
}

/** Missed-dose pattern: counts doses with no answer separately from doses actively skipped. */
export function adherence(doses: { status: string }[]) {
  const taken = doses.filter(d => d.status === 'taken' || d.status === 'taken_late').length;
  const skipped = doses.filter(d => d.status === 'skipped').length;
  const noAnswer = doses.filter(d => d.status === 'no_answer').length;
  const held = doses.filter(d => d.status === 'held').length;
  const denom = taken + skipped + noAnswer;
  return { taken, skipped, noAnswer, held, pct: denom ? Math.round((taken / denom) * 100) : null };
}
