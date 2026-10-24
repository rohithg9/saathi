// Draft a new drug profile from its US FDA label (openFDA drug label API), for pharmacist review.
//   npm run import:drug -- rivaroxaban
// Writes knowledge-drafts/<name>.json with label sections (indications, boxed warning, warnings,
// adverse reactions, monitoring) and a skeleton profile. Nothing here is clinically approved:
// a pharmacist turns the draft into a Profile in src/knowledge/drugs.ts and signs it off in the app.
// openFDA: https://open.fda.gov/apis/drug/label/  (no key needed for light use)

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const name = process.argv.slice(2).join(' ').trim();
if (!name) { console.error('Usage: npm run import:drug -- <generic name>'); process.exit(1); }
const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(name)}"&limit=1`;
const res = await fetch(url);
if (!res.ok) { console.error(`openFDA returned ${res.status} for "${name}"`); process.exit(1); }
const label = (await res.json()).results?.[0];
if (!label) { console.error('No label found'); process.exit(1); }

const txt = k => (label[k] || []).join('\n').replace(/\s+/g, ' ').trim();
const sections = {
  indications: txt('indications_and_usage'), boxed_warning: txt('boxed_warning'), warnings: txt('warnings_and_cautions') || txt('warnings'),
  adverse_reactions: txt('adverse_reactions'), monitoring: txt('laboratory_tests') || txt('information_for_patients'), interactions: txt('drug_interactions'),
};
// Very rough candidate list of adverse-reaction terms (the pharmacist edits this).
const candidates = [...new Set((sections.adverse_reactions.match(/\b[a-z][a-z -]{3,30}(?= \(\d|\s\d+%|,)/gi) || []).map(s => s.trim().toLowerCase()))].slice(0, 40);
const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const draft = {
  key, kind: 'drug', name: name[0].toUpperCase() + name.slice(1), class: label.openfda?.pharm_class_epc?.[0] || '', tags: [], brandsIN: [],
  indications: [], desired: [], sideEffects: candidates.map(t => ({ term: t, frequency: 'common', detectedBy: [] })), complications: [], checks: [], labs: [],
  sources: [{ type: 'US FDA label via openFDA', ref: `set_id ${label.set_id}, effective ${label.effective_time}` }, { type: 'DailyMed', ref: `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${label.set_id}` }],
  status: 'NOT_FOR_CLINICAL_USE', approvedBy: null, version: '0.1-draft',
  _review: { todo: 'TODO(clinical-review): pick real side effects, write plain-language questions, set schedules and labs, add Indian brands; verify against the Indian package insert (CDSCO).', sections },
};
const dir = path.resolve('knowledge-drafts'); mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${key}.json`); writeFileSync(out, JSON.stringify(draft, null, 2));
console.log(`Draft written: ${out}\n${candidates.length} candidate adverse-reaction terms; boxed warning: ${sections.boxed_warning ? 'yes' : 'no'}`);
