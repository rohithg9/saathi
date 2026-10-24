// Condition profiles: what "working" looks like for a managed condition and the checks that track it.
// DRAFT, NOT_FOR_CLINICAL_USE until approved. Targets carry no numbers: the treating clinician sets them.

import { DRAFT, Profile, S, lab, q, redflag, score, target, vital } from './model';

const guideline = (name: string) => ({ type: 'Clinical guideline (to be selected & approved locally)', ref: name });

export const CONDITIONS: Profile[] = [
  { key: 'hypertension', kind: 'condition', name: 'Hypertension', tags: ['cardiometabolic'],
    desired: [target('bp_sys', 'Home systolic BP at target', 'decrease', 12, 'mmHg'), target('bp_dia', 'Home diastolic BP at target', 'decrease', 12, 'mmHg')],
    sideEffects: [], complications: [],
    checks: [vital('bp', 'Home blood pressure', 'bp_sys', S.daily), redflag('stroke_signs', 'Stroke warning signs', 'Any sudden face droop, arm weakness or slurred speech?', { onSymptom: true }, 'red')],
    labs: [lab('creatinine', 'Creatinine', 'Kidney', { everyWeeks: 52 }), lab('K', 'Potassium', 'Electrolytes', { everyWeeks: 52 })], sources: [guideline('Hypertension guideline (e.g. ISH / ESH / Indian guideline)')], ...DRAFT },
  { key: 't2d', kind: 'condition', name: 'Type 2 diabetes', tags: ['cardiometabolic'],
    desired: [target('HbA1c', 'HbA1c at individual target', 'decrease', 12, '%')], sideEffects: [], complications: [],
    checks: [vital('fpg_log', 'Fasting glucose', 'fpg', { every: 3, from: 0 }), q('foot_check', 'Foot check', 'Any cuts, sores, or numbness on your feet?', 'yn', S.weekly, { yes: 'amber' })],
    labs: [lab('HbA1c', 'HbA1c', 'Control', { everyWeeks: 12 }), lab('eGFR', 'eGFR / urine ACR', 'Kidney', { everyWeeks: 52 }), lab('LDL', 'Lipids', 'CV risk', { everyWeeks: 52 })], sources: [guideline('Diabetes guideline (e.g. ADA / RSSDI)')], ...DRAFT },
  { key: 'heart_failure', kind: 'condition', name: 'Heart failure', tags: ['cardiac'],
    desired: [target('weight', 'Stable dry weight', 'reach', 4, 'kg'), target('nyha', 'Breathlessness class improves', 'decrease', 12)], sideEffects: [], complications: [],
    checks: [vital('weight', 'Daily weight', 'weight', S.daily, { todo: 'TODO(clinical-review): weight-gain escalation threshold set per patient by clinician' }),
      q('orthopnoea', 'Breathless lying flat', 'Do you need more pillows to breathe at night?', 'yn', { every: 2, from: 0 }, { yes: 'amber' }),
      q('hf_swelling', 'Ankle swelling', 'Any increase in ankle or leg swelling?', 'sev', { every: 2, from: 0 }), redflag('breathless', 'Breathlessness', 'Are you breathless at rest?', { onSymptom: true, every: 7, from: 0 })],
    labs: [lab('K', 'Potassium', 'On RAAS/diuretics', { everyWeeks: 12 }), lab('creatinine', 'Creatinine', 'Kidney', { everyWeeks: 12 })], sources: [guideline('Heart-failure guideline (e.g. ESC / ACC-AHA)')], ...DRAFT },
  { key: 'ckd', kind: 'condition', name: 'Chronic kidney disease', tags: ['renal'],
    desired: [target('eGFR', 'eGFR decline slows', 'reach', 26, 'mL/min')], sideEffects: [], complications: [],
    checks: [vital('bp', 'Home blood pressure', 'bp_sys', S.daily)],
    labs: [lab('eGFR', 'eGFR', 'Progression', { everyWeeks: 12 }), lab('K', 'Potassium', 'Electrolytes', { everyWeeks: 12 }), lab('Hb', 'Haemoglobin', 'Anaemia of CKD', { everyWeeks: 26 })], sources: [guideline('KDIGO CKD guideline')], ...DRAFT },
  { key: 'depression', kind: 'condition', name: 'Depression', tags: ['mental_health'],
    desired: [target('PHQ9', 'PHQ-9 falls (response / remission)', 'decrease', 8)], sideEffects: [], complications: [],
    checks: [score('phq9', 'PHQ-9', 'PHQ9', { days: [0, 14, 28], every: 28, from: 28 }), score('mood', 'Daily mood', 'mood', S.daily),
      redflag('self_harm', 'Thoughts of self-harm', 'Have you had thoughts of harming yourself?', { every: 7, from: 0, onSymptom: true }, 'red', { crisis: true })],
    labs: [], sources: [guideline('Depression guideline (e.g. NICE / IPS)')], ...DRAFT },
  { key: 'anticoagulation', kind: 'condition', name: 'On anticoagulation', tags: ['bleeding_risk'],
    desired: [], sideEffects: [], complications: [],
    checks: [redflag('bleed_major', 'Major bleeding sign', 'Any black stools, blood in urine or vomit, or sudden severe headache?', { every: 7, from: 0, onSymptom: true }), redflag('falls', 'Fall', 'Have you had a fall (especially hitting your head)?', { every: 14, from: 0, onSymptom: true }, 'amber')],
    labs: [], sources: [guideline('Anticoagulation clinic protocol')], ...DRAFT },
  { key: 'cancer_systemic', kind: 'condition', name: 'Cancer on systemic therapy', tags: ['oncology'],
    desired: [target('ecog', 'Performance status maintained (ECOG)', 'reach', 12)], sideEffects: [], complications: [],
    checks: [score('ecog_self', 'Daily activity level (patient-reported ECOG)', 'ecog', S.weekly), vital('temp', 'Temperature', 'temp', S.daily, { todo: 'TODO(clinical-review): febrile-neutropenia temperature cut-off per local policy' }),
      vital('weight', 'Weekly weight', 'weight', S.weekly), q('appetite', 'Appetite', 'How is your appetite?', 'sev', S.weekly)],
    labs: [], sources: [guideline('MASCC / ESMO supportive-care guidance; local oncology protocol')], ...DRAFT },
];
