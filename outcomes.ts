// Outcome evaluation: is the treatment doing what it should?
// Compares the patient's measurements against the expected direction and the clinician-set target.
// Output is for the care team; the app never tells a patient a treatment "isn't working".

import type { OutcomeTarget } from '../data/types';
import { daysBetween } from '../lib/dates';

export type OutcomeStatus = 'no_data' | 'too_early' | 'improving' | 'achieved' | 'not_improving' | 'worsening' | 'awaiting_target' | 'tracking';
export interface Point { date: string; value: number }
export interface OutcomeResult { status: OutcomeStatus; baseline?: Point; latest?: Point; change?: number; pct?: number; weeksIn: number; note: string }

export function evaluateOutcome(t: OutcomeTarget, series: Point[], startDate: string, today: string): OutcomeResult {
  const weeksIn = Math.max(0, Math.floor(daysBetween(startDate, today) / 7));
  const pts = [...series].sort((a, b) => a.date.localeCompare(b.date));
  if (t.direction === 'reach' && t.target == null && !pts.length) return { status: 'tracking', weeksIn, note: 'Tracked through check-ins and events' };
  if (!pts.length) return { status: 'no_data', weeksIn, note: 'No measurements yet' };
  const before = pts.filter(p => p.date <= startDate);
  const baseline = before.length ? before[before.length - 1] : pts[0];
  const latest = pts[pts.length - 1];
  const change = +(latest.value - baseline.value).toFixed(2);
  const pct = baseline.value ? Math.round((change / Math.abs(baseline.value)) * 100) : undefined;
  const win = t.windowWeeks ?? 12;
  const better = t.direction === 'decrease' ? change < 0 : t.direction === 'increase' ? change > 0 : t.target != null ? Math.abs(latest.value - t.target) < Math.abs(baseline.value - t.target) : false;
  const worse = t.direction === 'decrease' ? change > 0 : t.direction === 'increase' ? change < 0 : false;
  if (t.target != null) {
    const hit = t.direction === 'decrease' ? latest.value <= t.target : t.direction === 'increase' ? latest.value >= t.target : Math.abs(latest.value - t.target) < 1e-9;
    if (hit) return { status: 'achieved', baseline, latest, change, pct, weeksIn, note: `Target ${t.target}${t.unit ? ' ' + t.unit : ''} reached` };
  }
  if (latest === baseline) return { status: weeksIn < win ? 'too_early' : 'no_data', baseline, latest, weeksIn, note: 'Only a baseline value so far' };
  if (worse && weeksIn >= Math.min(2, win)) return { status: 'worsening', baseline, latest, change, pct, weeksIn, note: 'Moving the wrong way: review' };
  if (better) return { status: t.target == null ? 'awaiting_target' : 'improving', baseline, latest, change, pct, weeksIn, note: t.target == null ? 'Improving: clinician to set a target' : 'Improving towards target' };
  if (weeksIn < win) return { status: 'too_early', baseline, latest, change, pct, weeksIn, note: `Expected effect by week ${win}` };
  return { status: 'not_improving', baseline, latest, change, pct, weeksIn, note: `No improvement after ${weeksIn} weeks: review` };
}

export const OUTCOME_LABEL: Record<OutcomeStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'grey' | 'blue' }> = {
  no_data: { label: 'No data', tone: 'grey' }, too_early: { label: 'Too early', tone: 'blue' }, improving: { label: 'Improving', tone: 'green' },
  achieved: { label: 'Target met', tone: 'green' }, not_improving: { label: 'Not improving', tone: 'amber' }, worsening: { label: 'Worsening', tone: 'red' },
  awaiting_target: { label: 'Improving · set target', tone: 'blue' }, tracking: { label: 'Tracking', tone: 'grey' },
};
