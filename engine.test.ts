import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeLab, kb } from '../src/knowledge';
import { buildPlan, cycleDay, dueChecks, isDueOn, labsDue } from '../src/engine/plan';
import { evaluateAnswer, evaluateLab, combinedRules, adherence } from '../src/engine/rules';
import { evaluateOutcome } from '../src/engine/outcomes';
import { attribute } from '../src/engine/attribution';
import { checkOutput, detectEmergency, redact } from '../src/engine/safety';
import { answer } from '../src/engine/assistant';
import { parseQuery } from '../src/engine/analytics';
import { buildSeed, DEMO_PASSWORD } from '../src/data/seed';
import { visible } from '../src/data/demoStore';
import { sha256 } from '../src/data/store';
import { addDays, today } from '../src/lib/dates';
import type { Treatment } from '../src/data/types';

const T = today();
const tx = (ref: string, start: number, extra: Partial<Treatment> = {}): Treatment => ({ id: `t_${ref}`, patientId: 'p', kind: 'drug', ref, label: ref, startDate: addDays(T, start), status: 'active', version: 1, ...extra });

test('knowledge base: every profile is draft until approved, and check references resolve', () => {
  assert.ok(kb.drugs.length >= 30, 'at least 30 drugs');
  assert.ok(kb.drugs.filter(d => d.tags?.includes('chemo') || d.tags?.includes('immunotherapy') || d.tags?.includes('targeted') || d.tags?.includes('hormonal')).length >= 10, 'oncology coverage');
  for (const p of kb.all) {
    assert.equal(p.status, 'NOT_FOR_CLINICAL_USE', p.key);
    assert.equal(p.approvedBy, null);
    assert.ok(p.missedDoseRule == null, 'software never sets missed-dose rules');
    for (const c of p.checks) assert.ok(c.schedule && Object.keys(c.schedule).length, `${p.key}.${c.id} has a schedule`);
    for (const r of p.components || []) assert.ok(kb.get(r), `${p.key} component ${r} exists`);
  }
  assert.equal(kb.byBrand('Glycomet 500')?.key, 'metformin');
});

test('CTCAE v5 lab grading', () => {
  assert.equal(gradeLab({ code: 'ANC', value: 0.8, refLow: 2 })?.grade, 3);
  assert.equal(gradeLab({ code: 'ANC', value: 0.4 })?.grade, 4);
  assert.equal(gradeLab({ code: 'PLT', value: 98, refLow: 150 })?.grade, 1);
  assert.equal(gradeLab({ code: 'PLT', value: 60 })?.grade, 2);
  assert.equal(gradeLab({ code: 'ALT', value: 96, refHigh: 40 })?.grade, 1);
  assert.equal(gradeLab({ code: 'ALT', value: 250, refHigh: 40 })?.grade, 3);
  assert.equal(gradeLab({ code: 'ALT', value: 96 }), null, 'no ULN → no grade');
  assert.equal(gradeLab({ code: 'K', value: 5.7, refHigh: 5 })?.grade, 2);
  assert.equal(gradeLab({ code: 'Na', value: 127 })?.grade, 2);
  assert.equal(gradeLab({ code: 'LVEF', value: 48, baseline: 62 })?.grade, 2);
  assert.equal(gradeLab({ code: 'Hb', value: 7.5 })?.grade, 3);
});

test('schedules and chemo cycles', () => {
  assert.ok(isDueOn({ days: [3, 7] }, 3, null));
  assert.ok(!isDueOn({ days: [3, 7] }, 4, null));
  assert.ok(isDueOn({ every: 14, from: 14 }, 28, null));
  assert.ok(isDueOn({ newDaily: 14 }, 13, null) && !isDueOn({ newDaily: 14 }, 14, null));
  assert.deepEqual(cycleDay(addDays(T, -45), T, { lengthDays: 21, count: 8 }), { cycle: 3, day: 4 });
  assert.deepEqual(cycleDay(addDays(T, -24), T, { lengthDays: 21, count: 4, day1Dates: [addDays(T, -24), addDays(T, -3)] }), { cycle: 2, day: 4 });
  assert.equal(cycleDay(addDays(T, -200), T, { lengthDays: 21, count: 4 }), null);
});

test('monitoring plan merges drugs, regimens and interactions', () => {
  const plan = buildPlan({ conditions: [] }, [tx('capecitabine', -45, { cycle: { lengthDays: 21, count: 8 } }), tx('warfarin', -400), tx('apixaban', -3), tx('sertraline', -3)]);
  assert.ok(plan.checks.some(c => c.check.id === 'hfs'));
  assert.ok(plan.interactions.some(i => i.id.startsWith('capecitabine+warfarin')), 'capecitabine–warfarin INR interaction');
  assert.ok(plan.interactions.some(i => i.id === 'bleed_combo'), 'anticoagulant + SSRI bleeding');
  const bleed = plan.checks.find(c => c.check.id === 'bleed_major')!;
  assert.ok(bleed.sources.length >= 2, 'shared check is merged, not duplicated');
  const { due } = dueChecks(plan, T, 4);
  const red = due.findIndex(d => Object.values(d.check.escalate || {}).includes('red'));
  assert.ok(red === -1 || red === 0, 'red flags come first');
  assert.ok(due.filter(d => d.check.type === 'question' && !Object.values(d.check.escalate || {}).includes('red')).length <= 4, 'daily cap respected');
  const regimen = buildPlan({ conditions: [] }, [tx('AC', -24, { kind: 'regimen', cycle: { lengthDays: 21, count: 4 } })]);
  assert.ok(regimen.checks.some(c => c.check.id === 'fever_chemo') && regimen.labs.some(l => l.lab.code === 'LVEF'), 'regimen expands to components');
  const labs = labsDue(regimen, addDays(T, -24), addDays(T, 30));
  assert.ok(labs.some(l => l.code === 'CBC' && /Before cycle/.test(l.why)));
  assert.ok(plan.drafts.length > 0, 'plan reports draft profiles');
});

test('rules are deterministic and tiers come from profiles', () => {
  const fever = kb.get('capecitabine')!.checks.find(c => c.id === 'fever_chemo')!;
  assert.equal(evaluateAnswer(fever, 'yes').tier, 'red');
  assert.equal(evaluateAnswer(fever, 'no').tier, 'green');
  assert.equal(evaluateLab({ code: 'ANC', value: 0.8, unit: '', refLow: 2 }).tier, 'red');
  assert.equal(evaluateLab({ code: 'INR', value: 3.9, unit: '', refLow: 2, refHigh: 3 }).tier, 'amber');
  const f = combinedRules({ recent: [{ checkId: 'fever_chemo', answer: 'yes' } as any], labs: [], onChemo: true, onAnticoag: false });
  assert.equal(f[0]?.tier, 'red');
  const a = adherence([{ status: 'taken' }, { status: 'no_answer' }, { status: 'skipped' }, { status: 'taken' }]);
  assert.equal(a.noAnswer, 1); assert.equal(a.skipped, 1); assert.equal(a.pct, 50);
});

test('outcomes', () => {
  const start = addDays(T, -42);
  const pts = (vals: number[]) => vals.map((v, i) => ({ date: addDays(start, i * 14), value: v }));
  assert.equal(evaluateOutcome({ measure: 'HbA1c', label: '', direction: 'decrease', target: 7, windowWeeks: 12, source: 'clinician' }, pts([8.4, 7.9, 7.5]), start, T).status, 'improving');
  assert.equal(evaluateOutcome({ measure: 'HbA1c', label: '', direction: 'decrease', target: 7, windowWeeks: 12, source: 'clinician' }, pts([8.4, 6.9]), start, T).status, 'achieved');
  assert.equal(evaluateOutcome({ measure: 'bp_sys', label: '', direction: 'decrease', windowWeeks: 4, source: 'knowledge' }, pts([140, 141, 145]), start, T).status, 'worsening');
  assert.equal(evaluateOutcome({ measure: 'PHQ9', label: '', direction: 'decrease', windowWeeks: 8, source: 'knowledge' }, [], start, T).status, 'no_data');
});

test('attribution suggests the likely drug', () => {
  const s = attribute({ checkId: 'hfs' }, T, [tx('capecitabine', -45, { cycle: { lengthDays: 21, count: 8 } }), tx('metformin', -700)]);
  assert.equal(s[0].name, 'Capecitabine'); assert.equal(s[0].attribution, 'likely');
  const none = attribute({ checkId: 'hfs' }, T, [tx('capecitabine', 5)]);
  assert.equal(none.length, 0, 'treatment started after the event cannot be the cause');
});

test('safety: emergencies, dose-change blocking, redaction', () => {
  assert.equal(detectEmergency('I have chest pain since morning')?.kind, 'chest_pain');
  assert.equal(detectEmergency('सीने में दर्द हो रहा है')?.kind, 'chest_pain');
  assert.ok(detectEmergency('I want to end my life')?.crisis);
  assert.equal(detectEmergency('my knee is a bit stiff'), null);
  assert.equal(checkOutput('You should stop taking metformin for now').ok, false);
  assert.equal(checkOutput('Double the dose tonight').ok, false);
  assert.equal(checkOutput('Take your evening tablets with food.').ok, true);
  assert.equal(redact('call 9876543210 or a@b.com'), 'call [phone] or [email]');
});

test('assistant: FAQ first, then drug facts, then symptom flow, then forward', () => {
  const faq = [{ id: 'f', orgId: 'o', q: 'When can I shower after knee replacement?', a: 'Keep it dry until day 5–7.', tags: 'knee shower', status: 'approved' as const }];
  assert.equal(answer('can I shower after my knee surgery', { faq, treatments: [] }).kind, 'faq');
  assert.equal(answer('what are the side effects of metformin', { faq, treatments: [tx('metformin', -10)] }).kind, 'drug');
  assert.equal(answer('my stomach has been upset and I vomited', { faq, treatments: [] }).kind, 'symptom');
  assert.equal(answer('can I travel to Goa next month', { faq, treatments: [] }).kind, 'forward');
  assert.equal(answer('I cannot breathe', { faq, treatments: [] }).kind, 'emergency');
});

test('analytics maps questions to predefined tools', () => {
  assert.equal(parseQuery('show me all patients on capecitabine in the last 6 months')?.tool.name, 'patients_by_treatment');
  assert.equal(parseQuery('show red alerts')?.params.tier, 'red');
  assert.equal(parseQuery('who missed doses this week')?.tool.name, 'adherence');
});

test('seed: synthetic orgs, users with the demo password, and access scoping', async () => {
  const db = await buildSeed();
  assert.ok(db.orgs.length >= 3 && db.departments.length >= 8);
  const h = await sha256(DEMO_PASSWORD);
  assert.ok(db.users.every(u => u.passwordHash === h));
  const ramesh = db.users.find(u => u.username === 'ramesh')!;
  const v = visible(db, { userId: ramesh.id, username: 'ramesh', name: '', kind: 'patient', patientId: ramesh.patientId });
  assert.equal(v.patients.length, 1);
  assert.ok(v.users.every(u => !u.passwordHash), 'hashes never leave the store');
  const iyer = db.users.find(u => u.username === 'dr.iyer')!;
  const vs = visible(db, { userId: iyer.id, username: 'dr.iyer', name: '', kind: 'staff', orgId: iyer.orgId });
  assert.ok(vs.patients.every(p => p.orgIds.includes(iyer.orgId!)));
  assert.ok(!vs.patients.some(p => p.name === 'Ramesh Sharma'), 'other org patients hidden');
  const sunita = db.users.find(u => u.username === 'sunita')!;
  const vc = visible(db, { userId: sunita.id, username: 'sunita', name: '', kind: 'carer' });
  assert.deepEqual(vc.patients.map(p => p.name), ['Ramesh Sharma']);
  for (const t of db.treatments) for (const p of [kb.get(t.ref)]) assert.ok(p, `seed treatment ref ${t.ref} exists in KB`);
});

test('patient-facing knowledge text never tells a patient to change a dose', () => {
  for (const p of kb.all) {
    if (p.patientInfo) assert.ok(checkOutput(p.patientInfo).ok, `${p.key} patientInfo`);
    for (const c of p.checks) if (c.ask) assert.ok(checkOutput(c.ask).ok, `${p.key}.${c.id} question`);
  }
});
