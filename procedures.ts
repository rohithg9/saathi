// Procedure profiles: expected recovery outcomes, complications to catch, and when to check.
// Day 0 = day of surgery. DRAFT, NOT_FOR_CLINICAL_USE until approved by the surgical team.

import { DRAFT, Profile, lab, q, redflag, score, target, vital } from './model';

const eras = (name: string) => ({ type: 'ERAS / surgical society guidance (to be approved locally)', ref: name });
const wound = q('wound', 'Wound check', 'Is your wound red, swollen, hot, or leaking fluid?', 'sev', { days: [2, 4, 7, 10, 14, 21] }, { moderate: 'amber', severe: 'amber' });
const woundFever = redflag('wound_fever', 'Fever after surgery', 'Do you have a fever or chills?', { days: [1, 2, 3, 5, 7, 10, 14], onSymptom: true }, 'amber');
const calf = q('calf', 'Calf pain or swelling', 'Any pain, swelling or warmth in your calf?', 'yn', { days: [2, 4, 7, 10, 14, 21, 28] }, { yes: 'amber' }, { todo: 'TODO(clinical-review): DVT symptom escalation tier' });
const pe = redflag('breathless', 'Breathlessness or chest pain', 'Any sudden breathlessness or chest pain?', { days: [1, 3, 7, 14, 21, 28], onSymptom: true }, 'red');
const pain = score('pain', 'Pain score (0–10)', 'pain', { every: 1, from: 0, until: 42 });
const steps = vital('steps', 'Daily steps (phone/watch)', 'steps', { every: 1, from: 1, until: 90 }, { type: 'wearable' });

export const PROCEDURES: Profile[] = [
  { key: 'tkr', kind: 'procedure', name: 'Total knee replacement', tags: ['ortho', 'vte_risk'],
    desired: [target('pain', 'Pain falls', 'decrease', 6), target('knee_flexion', 'Knee bend (flexion) improves', 'increase', 6, '°'), target('steps', 'Daily steps rise towards goal', 'increase', 6, 'steps'), target('oks', 'Oxford Knee Score improves', 'increase', 12)],
    sideEffects: [], complications: [],
    checks: [pain, steps, wound, woundFever, calf, pe, vital('knee_flexion', 'Knee bend (physio)', 'knee_flexion', { days: [3, 14, 42] }, { type: 'exam' }), score('oks', 'Oxford Knee Score', 'oks', { days: [-7, 42, 90, 365] })],
    labs: [lab('Hb', 'Haemoglobin', 'Post-op blood loss', { days: [1] })], sources: [eras('ERAS Society: hip and knee arthroplasty')], ...DRAFT },
  { key: 'thr', kind: 'procedure', name: 'Total hip replacement', tags: ['ortho', 'vte_risk'],
    desired: [target('pain', 'Pain falls', 'decrease', 6), target('steps', 'Daily steps rise towards goal', 'increase', 6, 'steps'), target('ohs', 'Oxford Hip Score improves', 'increase', 12)],
    sideEffects: [], complications: [],
    checks: [pain, steps, wound, woundFever, calf, pe, redflag('dislocation', 'Hip suddenly painful/shortened', 'Sudden severe hip pain, or your leg looks shorter or turned?', { onSymptom: true, days: [7, 14, 28] }, 'red'), score('ohs', 'Oxford Hip Score', 'ohs', { days: [-7, 42, 90, 365] })],
    labs: [lab('Hb', 'Haemoglobin', 'Post-op blood loss', { days: [1] })], sources: [eras('ERAS Society: hip and knee arthroplasty')], ...DRAFT },
  { key: 'cabg', kind: 'procedure', name: 'Coronary artery bypass (CABG)', tags: ['cardiac'],
    desired: [target('steps', 'Walking distance increases (cardiac rehab)', 'increase', 8, 'steps'), target('angina', 'Free of angina', 'reach', 12)],
    sideEffects: [], complications: [],
    checks: [pain, steps, q('sternal_wound', 'Chest wound', 'Is your chest wound red, leaking, or does your breastbone click?', 'sev', { days: [3, 7, 10, 14, 21, 28] }, { moderate: 'amber', severe: 'amber' }), woundFever, redflag('chest_pain', 'Chest pain like angina', 'Any chest pain like your old angina?', { onSymptom: true, every: 7, from: 0 }, 'red'),
      q('palpitations_af', 'Irregular heartbeat', 'Any fluttering or irregular heartbeat?', 'yn', { days: [3, 5, 7, 14] }, { yes: 'amber' }), vital('weight', 'Daily weight', 'weight', { every: 1, from: 1, until: 28 })],
    labs: [lab('Hb', 'Haemoglobin', 'Post-op', { days: [3] }), lab('creatinine', 'Creatinine', 'Post-op kidney', { days: [3] })], sources: [eras('ERAS Cardiac Society')], ...DRAFT },
  { key: 'lap_chole', kind: 'procedure', name: 'Laparoscopic cholecystectomy', tags: ['general_surgery'],
    desired: [target('pain', 'Pain settles', 'decrease', 2), target('back_to_normal', 'Back to normal activity', 'reach', 2)],
    sideEffects: [], complications: [],
    checks: [pain, wound, woundFever, redflag('bile_leak', 'Worsening tummy pain or yellow skin', 'Is your tummy pain getting worse, or have your skin or eyes turned yellow?', { days: [1, 2, 3, 5, 7], onSymptom: true }, 'red')],
    labs: [], sources: [eras('ERAS / local day-surgery protocol')], ...DRAFT },
];
