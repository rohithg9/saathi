// CTCAE v5.0 lab grading (NCI Common Terminology Criteria for Adverse Events, v5.0, Nov 2017).
// Source: https://ctep.cancer.gov/protocoldevelopment/electronic_applications/ctc.htm
// Grades only; clinical context (symptoms, baseline) can change the grade — a clinician confirms.
// ULN/LLN come from the reporting laboratory's reference range on the result. No range → no ULN-based grade.

export interface LabGrade { grade: 0 | 1 | 2 | 3 | 4; term: string; rule: string }
export interface LabInput { code: string; value: number; unit?: string; refLow?: number; refHigh?: number; baseline?: number }

type Grader = (v: LabInput) => LabGrade | null;
const g = (grade: LabGrade['grade'], term: string, rule: string): LabGrade => ({ grade, term, rule });

/** value in ×10⁹/L */
const anc: Grader = ({ value: v, refLow }) => {
  const lln = refLow ?? 2.0; const t = 'Neutrophil count decreased';
  if (v < 0.5) return g(4, t, '<0.5 ×10⁹/L'); if (v < 1.0) return g(3, t, '<1.0–0.5 ×10⁹/L');
  if (v < 1.5) return g(2, t, '<1.5–1.0 ×10⁹/L'); if (v < lln) return g(1, t, '<LLN–1.5 ×10⁹/L'); return g(0, t, 'within range');
};
const plt: Grader = ({ value: v, refLow }) => {
  const lln = refLow ?? 150; const t = 'Platelet count decreased';
  if (v < 25) return g(4, t, '<25 ×10⁹/L'); if (v < 50) return g(3, t, '<50–25 ×10⁹/L');
  if (v < 75) return g(2, t, '<75–50 ×10⁹/L'); if (v < lln) return g(1, t, '<LLN–75 ×10⁹/L'); return g(0, t, 'within range');
};
/** g/dL. Grade 4 anaemia is defined clinically (life-threatening), never from the number alone. */
const hb: Grader = ({ value: v, refLow }) => {
  const lln = refLow ?? 12; const t = 'Anemia';
  if (v < 8) return g(3, t, '<8.0 g/dL'); if (v < 10) return g(2, t, '<10.0–8.0 g/dL'); if (v < lln) return g(1, t, '<LLN–10.0 g/dL'); return g(0, t, 'within range');
};
const timesUln = (term: string, cuts: [number, number, number]): Grader => ({ value: v, refHigh }) => {
  if (refHigh == null) return null; const x = v / refHigh;
  if (x > cuts[2]) return g(4, term, `>${cuts[2]}×ULN`); if (x > cuts[1]) return g(3, term, `>${cuts[1]}–${cuts[2]}×ULN`);
  if (x > cuts[0]) return g(2, term, `>${cuts[0]}–${cuts[1]}×ULN`); if (x > 1) return g(1, term, `>ULN–${cuts[0]}×ULN`); return g(0, term, 'within range');
};
const alt = timesUln('Alanine aminotransferase increased', [3, 5, 20]);
const ast = timesUln('Aspartate aminotransferase increased', [3, 5, 20]);
const bili = timesUln('Blood bilirubin increased', [1.5, 3, 10]);
const creat: Grader = ({ value: v, refHigh, baseline }) => {
  const t = 'Creatinine increased'; if (refHigh == null) return null;
  const xu = v / refHigh; const xb = baseline ? v / baseline : 0;
  if (xu > 6) return g(4, t, '>6.0×ULN'); if (xu > 3 || xb > 3) return g(3, t, '>3.0×baseline or >3.0–6.0×ULN');
  if (xu > 1.5 || xb > 1.5) return g(2, t, '>1.5–3.0×baseline or ULN'); if (xu > 1) return g(1, t, '>ULN–1.5×ULN'); return g(0, t, 'within range');
};
/** mmol/L. Hyper- and hypokalaemia are separate terms. Hypokalaemia grade 1 vs 2 depends on symptoms. */
const k: Grader = ({ value: v, refLow, refHigh }) => {
  const lln = refLow ?? 3.5, uln = refHigh ?? 5.0;
  if (v > uln) { const t = 'Hyperkalemia'; if (v > 7) return g(4, t, '>7.0 mmol/L'); if (v > 6) return g(3, t, '>6.0–7.0 mmol/L'); if (v > 5.5) return g(2, t, '>5.5–6.0 mmol/L'); return g(1, t, '>ULN–5.5 mmol/L'); }
  if (v < lln) { const t = 'Hypokalemia'; if (v < 2.5) return g(4, t, '<2.5 mmol/L'); if (v < 3) return g(3, t, '<3.0–2.5 mmol/L'); return g(1, t, '<LLN–3.0 mmol/L (grade 2 if symptomatic)'); }
  return g(0, 'Potassium', 'within range');
};
const na: Grader = ({ value: v, refLow }) => {
  const lln = refLow ?? 135; const t = 'Hyponatremia';
  if (v < 120) return g(4, t, '<120 mmol/L'); if (v < 125) return g(3, t, '120–124 mmol/L'); if (v < 130) return g(2, t, '125–129 mmol/L'); if (v < lln) return g(1, t, '<LLN–130 mmol/L'); return g(0, t, 'within range');
};
/** mg/dL (convert mmol/L ×2.43) */
const mg: Grader = ({ value, unit, refLow }) => {
  const v = unit === 'mmol/L' ? value * 2.43 : value; const lln = refLow != null ? (unit === 'mmol/L' ? refLow * 2.43 : refLow) : 1.7; const t = 'Hypomagnesemia';
  if (v < 0.7) return g(4, t, '<0.7 mg/dL'); if (v < 0.9) return g(3, t, '<0.9–0.7 mg/dL'); if (v < 1.2) return g(2, t, '<1.2–0.9 mg/dL'); if (v < lln) return g(1, t, '<LLN–1.2 mg/dL'); return g(0, t, 'within range');
};
/** % resting LVEF; also uses absolute drop from baseline */
const lvef: Grader = ({ value: v, baseline }) => {
  const t = 'Ejection fraction decreased'; const drop = baseline ? baseline - v : 0;
  if (v < 20) return g(4, t, 'LVEF <20%'); if (v < 40 || drop >= 20) return g(3, t, 'LVEF 39–20% or ≥20-point drop');
  if (v <= 50 || drop >= 10) return g(2, t, 'LVEF 50–40% or 10–19-point drop'); return g(0, t, 'no decrease');
};

export const CTCAE: Record<string, Grader> = { ANC: anc, PLT: plt, Hb: hb, ALT: alt, AST: ast, bilirubin: bili, creatinine: creat, K: k, Na: na, Mg: mg, LVEF: lvef };
export const CTCAE_VERSION = 'CTCAE v5.0';

export function gradeLab(input: LabInput): LabGrade | null {
  const f = CTCAE[input.code]; return f ? f(input) : null;
}
