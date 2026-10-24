// Knowledge-base model: how a drug, regimen, condition or procedure is monitored.
// Every profile ships status NOT_FOR_CLINICAL_USE until a named clinician/pharmacist approves it.
// Numeric clinical thresholds are never invented here: targets are set by the treating clinician;
// lab grading uses CTCAE v5.0 definitions (see ctcae.ts) and the lab's own reference range.

import type { OutcomeTarget, Tier } from '../data/types';

export type CheckType = 'question' | 'vital' | 'lab' | 'score' | 'exam' | 'wearable';
export type AnswerSet = 'sev' | 'yn' | 'freq' | 'scale10' | 'value';

export const ANSWERS: Record<AnswerSet, string[]> = {
  sev: ['none', 'mild', 'moderate', 'severe'],
  yn: ['no', 'yes'],
  freq: ['not at all', 'several days', 'more than half the days', 'nearly every day'],
  scale10: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  value: [],
};
/** Patient-reported severity → CTCAE-style grade (PRO-CTCAE convention). */
export const SEV_GRADE: Record<string, number> = { none: 0, mild: 1, moderate: 2, severe: 3, no: 0, yes: 2 };

export interface Schedule {
  /** specific days since start (day 0 = first dose / surgery / day 1 of cycle 1) */
  days?: number[];
  /** ask every day for the first N days after starting (new treatment, highest risk) */
  newDaily?: number;
  /** then every N days from `from` (default 14) until `until` */
  every?: number; from?: number; until?: number;
  /** for cyclical regimens: 1-based days of every cycle */
  cycleDays?: number[];
  /** ask whenever the patient reports feeling unwell (always available in symptom flow) */
  onSymptom?: boolean;
}

export interface Check {
  id: string;
  type: CheckType;
  label: string;           // short clinician label, also the adverse-event term
  ask?: string;            // patient-facing question (plain language)
  answers?: AnswerSet;
  measure?: string;        // observation/lab code for vital/lab/score/wearable checks
  schedule: Schedule;
  escalate?: Record<string, Tier>;  // answer → tier (deterministic, from the signed profile)
  term?: string;           // adverse-event / CTCAE term this check detects
  crisis?: boolean;        // routes to crisis support (self-harm)
  todo?: string;           // TODO(clinical-review) notes
}

export interface LabRule {
  code: string; name: string;
  baseline?: boolean; everyWeeks?: number; beforeEachCycle?: boolean; days?: number[];
  why: string;
}

export interface SideEffect {
  term: string; frequency: 'very common' | 'common' | 'uncommon' | 'rare';
  serious?: boolean; typicalOnset?: string; detectedBy: string[]; // check ids or lab codes
  ctcae?: string; patientTip?: string;
}

export interface Interaction { with: string[]; /** drug keys or class tags */ effect: string; addChecks?: Check[]; addLabs?: LabRule[] }

export interface Profile {
  key: string; kind: 'drug' | 'regimen' | 'condition' | 'procedure';
  name: string; class?: string; tags?: string[]; brandsIN?: string[];
  indications?: string[];
  desired: Omit<OutcomeTarget, 'source'>[];
  sideEffects: SideEffect[];
  /** complications / red flags: serious events to catch early */
  complications: SideEffect[];
  checks: Check[];
  labs: LabRule[];
  interactions?: Interaction[];
  patientInfo?: string;
  missedDoseRule?: null; // never set by software; clinician-approved text only
  components?: string[];   // regimens: component drug keys
  cycleDays?: number;      // regimens: cycle length
  sources: { type: string; ref: string }[];
  status: 'NOT_FOR_CLINICAL_USE' | 'APPROVED';
  approvedBy: string | null;
  version: string;
}

// ---------- compact builders ----------
export const q = (id: string, label: string, ask: string, answers: AnswerSet, schedule: Schedule, escalate: Record<string, Tier> = { severe: 'amber' }, extra: Partial<Check> = {}): Check =>
  ({ id, type: 'question', label, ask, answers, schedule, escalate, term: label, ...extra });
export const redflag = (id: string, label: string, ask: string, schedule: Schedule, tier: Tier = 'red', extra: Partial<Check> = {}): Check =>
  ({ id, type: 'question', label, ask, answers: 'yn', schedule, escalate: { yes: tier }, term: label, ...extra });
export const vital = (id: string, label: string, measure: string, schedule: Schedule, extra: Partial<Check> = {}): Check =>
  ({ id, type: 'vital', label, measure, schedule, ...extra });
export const score = (id: string, label: string, measure: string, schedule: Schedule, extra: Partial<Check> = {}): Check =>
  ({ id, type: 'score', label, measure, schedule, ...extra });
export const lab = (code: string, name: string, why: string, r: Partial<LabRule> = {}): LabRule => ({ code, name, why, ...r });
export const se = (term: string, frequency: SideEffect['frequency'], detectedBy: string[], extra: Partial<SideEffect> = {}): SideEffect => ({ term, frequency, detectedBy, ...extra });
export const target = (measure: string, label: string, direction: OutcomeTarget['direction'], windowWeeks?: number, unit?: string): Omit<OutcomeTarget, 'source'> =>
  ({ measure, label, direction, windowWeeks, unit });

export const LABEL_SOURCE = (drug: string) => ({ type: 'Prescribing information (US FDA label via DailyMed/openFDA); verify against Indian package insert', ref: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(drug)}` });
export const DRAFT = { status: 'NOT_FOR_CLINICAL_USE' as const, approvedBy: null, version: '0.1-draft' };

// Common schedules
export const S = {
  newThenFortnightly: { days: [3, 7, 14], newDaily: 0, every: 14, from: 14 } as Schedule,
  earlyThenMonthly: { days: [3, 7, 14], every: 30, from: 30 } as Schedule,
  dailyFirst2Weeks: { newDaily: 14, every: 7, from: 14 } as Schedule,
  weekly: { every: 7, from: 0 } as Schedule,
  monthly: { every: 30, from: 30 } as Schedule,
  daily: { every: 1, from: 0 } as Schedule,
  chemoCycle: { cycleDays: [2, 3, 5, 8, 12, 15, 21] } as Schedule,
  chemoDaily: { cycleDays: Array.from({ length: 21 }, (_, i) => i + 1) } as Schedule,
};
