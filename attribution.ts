// Side-effect attribution: which active treatment could have caused a symptom or abnormal lab?
// Uses (1) known association in the drug profile, (2) timing after start / within a chemo cycle.
// A suggestion only. A clinician confirms attribution on the adverse-event record.

import type { AdverseEvent, Treatment } from '../data/types';
import { daysBetween } from '../lib/dates';
import { profilesFor, cycleDay } from './plan';

export interface Suspect { treatmentId: string; name: string; attribution: NonNullable<AdverseEvent['attribution']>; why: string[] }

export function attribute(signal: { checkId?: string; labCode?: string; term?: string }, onset: string, treatments: Treatment[]): Suspect[] {
  const out: Suspect[] = [];
  const term = (signal.term || '').toLowerCase();
  for (const t of treatments) {
    if (t.startDate > onset) continue; // started after the event → cannot be the cause
    if (t.status === 'stopped' && t.endDate && daysBetween(t.endDate, onset) > 90) continue;
    for (const p of profilesFor(t)) {
      if (p.kind === 'condition') continue;
      const effects = [...p.sideEffects, ...p.complications];
      const match = effects.find(e => (signal.checkId && e.detectedBy.includes(signal.checkId)) || (signal.labCode && e.detectedBy.includes(signal.labCode)) || (term && (e.term.toLowerCase().includes(term) || (e.ctcae || '').toLowerCase().includes(term))));
      const days = daysBetween(t.startDate, onset);
      const cd = cycleDay(t.startDate, onset, t.cycle || (p.cycleDays ? { lengthDays: p.cycleDays, count: 6 } : undefined));
      const why: string[] = [];
      if (match) why.push(`Listed ${match.serious ? 'complication' : 'side effect'} of ${p.name} (${match.frequency})`);
      why.push(cd ? `Onset on cycle ${cd.cycle} day ${cd.day}` : `Onset ${days} day${days === 1 ? '' : 's'} after starting`);
      let a: Suspect['attribution'];
      if (match && (days <= 90 || cd)) a = 'likely';
      else if (match) a = 'possible';
      else if (days <= 14) a = 'unlikely';
      else continue;
      if (!out.some(s => s.treatmentId === t.id && s.name === p.name)) out.push({ treatmentId: t.id, name: p.name, attribution: a, why });
    }
  }
  const rank = { likely: 0, possible: 1, unlikely: 2, unknown: 3 };
  return out.sort((x, y) => rank[x.attribution] - rank[y.attribution]);
}
