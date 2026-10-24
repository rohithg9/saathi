// Saathi's answering logic that works offline. Order: emergency check → care-team FAQ → drug facts
// from the knowledge base → symptom history-taking → otherwise forward to the care team.
// When the server AI (supabase/functions/saathi-ai) is configured it can phrase answers better,
// but every reply still passes `checkOutput` and the tier still comes from the rules engine.

import type { Faq, Treatment } from '../data/types';
import { kb } from '../knowledge';
import { checkOutput, detectEmergency, EmergencyHit } from './safety';

export type Reply =
  | { kind: 'emergency'; hit: EmergencyHit; text: string }
  | { kind: 'faq'; text: string; source: string }
  | { kind: 'drug'; text: string; source: string }
  | { kind: 'symptom'; flow: SymptomFlow; text: string }
  | { kind: 'forward'; text: string };

export interface SymptomFlow { id: string; title: string; steps: { ask: string; options: string[] }[] }

export const SYMPTOM_FLOWS: (SymptomFlow & { match: RegExp })[] = [
  { id: 'pain', title: 'Pain', match: /pain|ache|hurt|dard|दर्द|ನೋವು|வலி/i, steps: [
    { ask: 'Where is the pain?', options: ['Operated area', 'Chest', 'Calf / leg', 'Stomach', 'Head', 'Other'] },
    { ask: 'How bad is it, 0 to 10?', options: ['1–3', '4–6', '7–8', '9–10'] },
    { ask: 'When did it start?', options: ['Today', '1–3 days', 'Longer'] },
    { ask: 'Is it getting worse?', options: ['Better', 'Same', 'Worse'] }] },
  { id: 'fever', title: 'Fever', match: /fever|temperature|bukhar|बुखार|ಜ್ವರ|காய்ச்சல்|chills/i, steps: [
    { ask: 'Have you measured your temperature?', options: ['Below 38 °C', '38 °C or higher', 'Not measured'] },
    { ask: 'Any shivering or chills?', options: ['No', 'Yes'] },
    { ask: 'When did it start?', options: ['Today', '1–3 days', 'Longer'] }] },
  { id: 'breath', title: 'Breathing', match: /breath|saans|सांस|ಉಸಿರು|மூச்சு|cough/i, steps: [
    { ask: 'Are you breathless at rest or only when walking?', options: ['Only walking', 'At rest'] },
    { ask: 'Any chest pain with it?', options: ['No', 'Yes'] },
    { ask: 'Do your ankles look more swollen?', options: ['No', 'Yes'] }] },
  { id: 'stomach', title: 'Stomach', match: /vomit|nausea|diarr|loose|stomach|ulti|उल्टी|दस्त|ವಾಂತಿ|வாந்தி/i, steps: [
    { ask: 'What is the main problem?', options: ['Nausea', 'Vomiting', 'Loose stools', 'Constipation', 'Stomach pain'] },
    { ask: 'How many times today?', options: ['1–2', '3–5', '6 or more'] },
    { ask: 'Can you keep fluids down?', options: ['Yes', 'No'] }] },
  { id: 'dizzy', title: 'Dizziness', match: /dizz|chakkar|चक्कर|ತಲೆ ಸುತ್ತು|தலைசுற்ற|faint/i, steps: [
    { ask: 'Did you fall or faint?', options: ['No', 'Nearly', 'Yes'] },
    { ask: 'Does it happen when you stand up?', options: ['Yes', 'No'] }] },
];

export function triageSymptomAnswers(flowId: string, answers: string[]): 'red' | 'amber' | 'green' {
  // TODO(clinical-review): mapping of history answers to tiers must be signed off by the clinical lead.
  const a = answers.join('|');
  if (flowId === 'pain' && /Chest|9–10/.test(a)) return 'red';
  if (flowId === 'fever' && /38 °C or higher/.test(a)) return 'red';
  if (flowId === 'breath' && /At rest|Yes/.test(a)) return 'red';
  if (flowId === 'stomach' && /6 or more|\|No$/.test(a)) return 'amber';
  if (flowId === 'dizzy' && /\|?Yes\|/.test(a + '|')) return 'amber';
  if (/Worse|7–8|Calf/.test(a)) return 'amber';
  return 'green';
}

const words = (s: string) => s.toLowerCase().split(/[^a-zऀ-෿]+/).filter(w => w.length > 2);

export function answer(text: string, ctx: { faq: Faq[]; treatments: Treatment[] }): Reply {
  const hit = detectEmergency(text);
  if (hit) return { kind: 'emergency', hit, text: hit.crisis ? 'You are not alone. I am alerting your care team and carer now. Please call Tele-MANAS on 14416 to talk to someone right away.' : 'This could be serious. I am alerting your care team and carer now. Call your hospital emergency number or 108.' };

  const q = words(text);
  let best: { f: Faq; score: number } | null = null;
  for (const f of ctx.faq.filter(x => x.status === 'approved')) {
    const hay = new Set(words(`${f.q} ${f.tags}`)); const score = q.filter(w => hay.has(w)).length;
    if (score >= 2 && (!best || score > best.score)) best = { f, score };
  }
  if (best) return { kind: 'faq', text: checkOutput(best.f.a).text, source: 'Your care team' };

  const sym = SYMPTOM_FLOWS.find(f => f.match.test(text));
  const drug = ctx.treatments.map(t => kb.get(t.ref)).find(p => p && text.toLowerCase().includes(p.name.toLowerCase().split(' ')[0].toLowerCase())) || kb.byBrand(text);
  if (drug && /side|effect|why|what|use|for/i.test(text)) {
    const se = drug.sideEffects.slice(0, 3).map(s => s.term.toLowerCase()).join(', ');
    const tell = drug.complications.filter(c => c.serious).slice(0, 2).map(c => c.term.toLowerCase()).join(' or ');
    const txt = `${drug.name} is used for ${(drug.indications || ['your condition']).join(', ').toLowerCase()}. ${se ? `Common side effects: ${se}.` : ''} ${tell ? `Tell your care team straight away about ${tell}.` : ''} ${drug.patientInfo || ''}`.replace(/\s+/g, ' ').trim();
    return { kind: 'drug', text: checkOutput(txt).text, source: `Medicine information (draft, pending pharmacist review)` };
  }
  if (sym) return { kind: 'symptom', flow: sym, text: `I'll ask a few quick questions about your ${sym.title.toLowerCase()} and send the answers to your care team.` };
  return { kind: 'forward', text: "I don't have an approved answer for that yet. I've sent your question to your care team, and they'll reply here." };
}
