// Synthetic demo data. Every person, phone number and record here is invented.
// All demo accounts use the password DEMO_PASSWORD. Dates are relative to today so the demo stays current.

import { addDays, today } from '../lib/dates';
import { sha256, type Db } from './store';
import type { AppUser, Cap, CarerLink, CheckResult, Dose, LabResult, Observation, PathwayItem, PathwayWho, Protocol, Role, RotaDay, Treatment } from './types';

export const DEMO_PASSWORD = 'saathi123';

let n = 0; const id = (p: string) => `${p}_${(++n).toString(36).padStart(3, '0')}`;
let r = 7; const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
const T = today(); const d = (k: number) => addDays(T, k); const at = (k: number, hm = '09:00') => `${d(k)}T${hm}:00.000Z`;

const WEEKDAYS: RotaDay = { on: true, start: '09:00', end: '17:00', onCall: false };
const OFF: RotaDay = { on: false, start: '09:00', end: '17:00', onCall: false };
const rota = (pattern: string, start = '09:00', end = '17:00', onCallDay = -1): RotaDay[] =>
  pattern.split('').map((c, i) => (c === '1' ? { ...WEEKDAYS, start, end, onCall: i === onCallDay } : OFF));

const ROLE_DEFS: { key: string; label: string; caps: Cap[]; scope: 'dept' | 'all'; does: PathwayWho[] }[] = [
  { key: 'admin', label: 'Organisation admin', caps: ['org', 'users', 'analytics', 'monitor', 'message', 'register', 'protocol', 'drugs'], scope: 'all', does: [] },
  { key: 'doctor', label: 'Doctor / consultant', caps: ['sign', 'monitor', 'message', 'protocol', 'tasks', 'register', 'analytics'], scope: 'dept', does: ['doctor'] },
  { key: 'nurse', label: 'Nurse', caps: ['monitor', 'message', 'tasks', 'register'], scope: 'dept', does: ['nurse'] },
  { key: 'physio', label: 'Physiotherapist', caps: ['monitor', 'message', 'tasks'], scope: 'dept', does: ['physio'] },
  { key: 'dietitian', label: 'Dietitian', caps: ['monitor', 'message', 'tasks'], scope: 'all', does: ['dietitian'] },
  { key: 'coordinator', label: 'Patient liaison / coordinator', caps: ['monitor', 'message', 'tasks', 'register'], scope: 'all', does: ['liaison'] },
  { key: 'pharmacist', label: 'Clinical pharmacist', caps: ['monitor', 'message', 'tasks', 'drugs'], scope: 'all', does: ['pharmacist'] },
];

export async function buildSeed(): Promise<Db> {
  n = 0; r = 7;
  const hash = await sha256(DEMO_PASSWORD);
  const db: Db = { orgs: [], departments: [], roles: [], users: [], patients: [], carer_links: [], care_team: [], treatments: [], doses: [], check_results: [], observations: [], labs: [], adverse_events: [], alerts: [], messages: [], protocols: [], pathways: [], tasks_done: [], faq: [], audit: [], kb_reviews: [] };

  // ---------- organisations ----------
  const ORG1 = 'org_demo_general', ORG2 = 'org_sunrise_cancer', ORG3 = 'org_greenpark';
  db.orgs.push(
    { id: ORG1, name: 'Demo Ortho & General Hospital', type: 'Hospital', city: 'Bengaluru', address: '12 Example Road, Jayanagar (demo)', phone: '+91 80 0000 1000', emergency: '+91 80 0000 1999', ambulance: '108', opdDays: 'Mon–Sat', opdOpen: '08:30', opdClose: '18:00' },
    { id: ORG2, name: 'Sunrise Cancer Centre (demo)', type: 'Cancer centre', city: 'Chennai', address: '4 Sample Street, Adyar (demo)', phone: '+91 44 0000 2000', emergency: '+91 44 0000 2999', ambulance: '108', opdDays: 'Mon–Sat', opdOpen: '08:00', opdClose: '17:00' },
    { id: ORG3, name: 'Green Park Family Clinic (demo)', type: 'Clinic', city: 'New Delhi', address: '7 Demo Lane, Green Park (demo)', phone: '+91 11 0000 3000', emergency: '+91 11 0000 3999', ambulance: '102', opdDays: 'Mon–Sat', opdOpen: '10:00', opdClose: '20:00' },
  );
  const dept = (orgId: string, name: string) => { const x = { id: id('dep'), orgId, name }; db.departments.push(x); return x.id; };
  const D = {
    ortho: dept(ORG1, 'Orthopaedics'), med: dept(ORG1, 'General Medicine'), cardio: dept(ORG1, 'Cardiology'), surg: dept(ORG1, 'General Surgery'),
    medonc: dept(ORG2, 'Medical Oncology'), daycare: dept(ORG2, 'Chemotherapy Day Care'), onpharm: dept(ORG2, 'Oncology Pharmacy'),
    gp: dept(ORG3, 'Family Medicine'),
  };
  for (const org of [ORG1, ORG2, ORG3]) for (const rd of ROLE_DEFS) db.roles.push({ id: id('role'), orgId: org, ...rd } as Role);

  // ---------- users ----------
  const user = (u: Partial<AppUser> & Pick<AppUser, 'username' | 'displayName' | 'kind'>): AppUser => {
    const x: AppUser = { id: id('usr'), active: true, passwordHash: hash, createdAt: at(-120), ...u }; db.users.push(x); return x;
  };
  user({ username: 'platform', displayName: 'Platform Admin (Exora Labs)', kind: 'platform' });
  const S = {
    adminG: user({ username: 'admin.general', displayName: 'Ms Nandini Rao', kind: 'staff', orgId: ORG1, roleKey: 'admin', rota: rota('1111100') }),
    drRao: user({ username: 'dr.rao', displayName: 'Dr Vikram Rao', kind: 'staff', orgId: ORG1, deptId: D.ortho, roleKey: 'doctor', phone: '+91 90000 00101', rota: rota('1111010', '08:00', '16:00', 2), leave: [{ id: id('lv'), from: d(9), to: d(13), type: 'Annual leave' }] }),
    drMenon: user({ username: 'dr.menon', displayName: 'Dr Asha Menon', kind: 'staff', orgId: ORG1, deptId: D.ortho, roleKey: 'doctor', rota: rota('1101110') }),
    drSen: user({ username: 'dr.sen', displayName: 'Dr Rohan Sen', kind: 'staff', orgId: ORG1, deptId: D.cardio, roleKey: 'doctor', rota: rota('1111100') }),
    nursePriya: user({ username: 'nurse.priya', displayName: 'Sr Priya Nair', kind: 'staff', orgId: ORG1, deptId: D.ortho, roleKey: 'nurse', rota: rota('1111110', '07:00', '15:00') }),
    nurseJoy: user({ username: 'nurse.joy', displayName: 'Sr Joy Thomas', kind: 'staff', orgId: ORG1, deptId: D.cardio, roleKey: 'nurse', rota: rota('0111111', '14:00', '22:00') }),
    physio: user({ username: 'physio.arjun', displayName: 'Mr Arjun Pillai (Physio)', kind: 'staff', orgId: ORG1, deptId: D.ortho, roleKey: 'physio', rota: rota('1111100') }),
    diet: user({ username: 'diet.meena', displayName: 'Ms Meena Iyer (Dietitian)', kind: 'staff', orgId: ORG1, roleKey: 'dietitian', rota: rota('1010100') }),
    liaison: user({ username: 'liaison.kavya', displayName: 'Ms Kavya Reddy (Liaison)', kind: 'staff', orgId: ORG1, roleKey: 'coordinator', rota: rota('1111110') }),
    pharmG: user({ username: 'pharm.suresh', displayName: 'Mr Suresh Babu (Pharmacist)', kind: 'staff', orgId: ORG1, roleKey: 'pharmacist', rota: rota('1111100') }),
    adminS: user({ username: 'admin.sunrise', displayName: 'Mr Karthik Raman', kind: 'staff', orgId: ORG2, roleKey: 'admin', rota: rota('1111100') }),
    drIyer: user({ username: 'dr.iyer', displayName: 'Dr Lalitha Iyer (Oncologist)', kind: 'staff', orgId: ORG2, deptId: D.medonc, roleKey: 'doctor', rota: rota('1111100', '09:00', '17:00', 3) }),
    drBose: user({ username: 'dr.bose', displayName: 'Dr Anirban Bose (Oncologist)', kind: 'staff', orgId: ORG2, deptId: D.medonc, roleKey: 'doctor', rota: rota('0111110') }),
    nurseLak: user({ username: 'nurse.lakshmi', displayName: 'Sr Lakshmi Devi (Chemo nurse)', kind: 'staff', orgId: ORG2, deptId: D.daycare, roleKey: 'nurse', rota: rota('1111110', '07:30', '15:30') }),
    pharmS: user({ username: 'pharm.anand', displayName: 'Mr Anand K (Oncology pharmacist)', kind: 'staff', orgId: ORG2, deptId: D.onpharm, roleKey: 'pharmacist', rota: rota('1111100') }),
    liaisonS: user({ username: 'liaison.deepa', displayName: 'Ms Deepa S (Navigator)', kind: 'staff', orgId: ORG2, roleKey: 'coordinator', rota: rota('1111110') }),
    drKhan: user({ username: 'dr.khan', displayName: 'Dr Imran Khan (GP)', kind: 'staff', orgId: ORG3, deptId: D.gp, roleKey: 'doctor', rota: rota('1111110', '10:00', '20:00') }),
    adminC: user({ username: 'admin.greenpark', displayName: 'Ms Ritu Malhotra', kind: 'staff', orgId: ORG3, roleKey: 'admin', rota: rota('1111110') }),
  };

  // ---------- patients ----------
  const patient = (p: Omit<Db['patients'][0], 'id' | 'createdAt' | 'status'> & { username: string }) => {
    const { username, ...rest } = p; const pid = id('pat');
    db.patients.push({ id: pid, createdAt: at(-60), status: 'active', ...rest });
    user({ username, displayName: p.name, kind: 'patient', patientId: pid, phone: p.phone });
    return pid;
  };
  const P = {
    ramesh: patient({ username: 'ramesh', name: 'Ramesh Sharma', callName: 'Sharma ji', dob: '1957-03-14', sex: 'M', phone: '+91 90000 11111', lang: 'hi', orgIds: [ORG1, ORG3], primaryDeptId: D.ortho, allergies: [{ substance: 'Penicillin', reaction: 'Rash', source: 'patient' }], conditions: ['t2d', 'hypertension'], bloodGroup: 'B+', registeredBy: `staff:${S.liaison.id}`, emergencyContact: 'Sunita (daughter) +91 90000 22222' }),
    anita: patient({ username: 'anita', name: 'Anita Desai', dob: '1971-08-02', sex: 'F', phone: '+91 90000 33333', lang: 'en', orgIds: [ORG2], primaryDeptId: D.medonc, allergies: [], conditions: ['cancer_systemic'], registeredBy: 'self', emergencyContact: 'Rahul (husband) +91 90000 44444' }),
    mohan: patient({ username: 'mohan', name: 'Mohan Kumar', callName: 'Mohan avare', dob: '1963-11-20', sex: 'M', phone: '+91 90000 55555', lang: 'kn', orgIds: [ORG2], primaryDeptId: D.medonc, allergies: [], conditions: ['cancer_systemic', 'anticoagulation'], registeredBy: `carer:kavitha`, emergencyContact: 'Kavitha (wife) +91 90000 66666' }),
    selvi: patient({ username: 'selvi', name: 'Selvi Murugan', callName: 'Selvi amma', dob: '1958-05-09', sex: 'F', phone: '+91 90000 77777', lang: 'ta', orgIds: [ORG1], primaryDeptId: D.cardio, allergies: [{ substance: 'Sulfa drugs', reaction: 'Hives', source: 'record' }], conditions: ['heart_failure', 'ckd'], registeredBy: `staff:${S.nurseJoy.id}` }),
    arjun: patient({ username: 'arjun', name: 'Arjun Mehta', dob: '1980-01-25', sex: 'M', phone: '+91 90000 88888', lang: 'en', orgIds: [ORG3], primaryDeptId: D.gp, allergies: [], conditions: ['depression'], registeredBy: 'self' }),
  };

  // ---------- carers ----------
  const perms = { meds: true, activity: true, symptoms: true, readings: true, mood: false, records: true };
  const carer = (username: string, name: string, patientId: string, relation: string, priority: number, available = true, alerts: CarerLink['alerts'] = 'red_missed') => {
    const u = user({ username, displayName: name, kind: 'carer', phone: `+91 90000 ${String(10000 + priority * 1111).slice(0, 5)}` });
    db.carer_links.push({ id: id('cl'), patientId, userId: u.id, relation, priority, available, perms: { ...perms }, alerts, status: 'active' }); return u;
  };
  carer('sunita', 'Sunita Sharma', P.ramesh, 'Daughter', 1, true, 'red_amber_missed');
  carer('vikas', 'Vikas Sharma', P.ramesh, 'Son', 2, false);
  carer('rahul', 'Rahul Desai', P.anita, 'Husband', 1);
  carer('kavitha', 'Kavitha Kumar', P.mohan, 'Wife', 1, true, 'red_amber_missed');
  carer('karthi', 'Karthi Murugan', P.selvi, 'Son', 1);

  const team = (patientId: string, u: AppUser, responsibility: string) => db.care_team.push({ id: id('ct'), patientId, userId: u.id, responsibility });
  team(P.ramesh, S.drRao, 'Consultant surgeon'); team(P.ramesh, S.nursePriya, 'Ward/discharge nurse'); team(P.ramesh, S.physio, 'Physiotherapy'); team(P.ramesh, S.liaison, 'Liaison'); team(P.ramesh, S.drKhan, 'GP (diabetes, BP)');
  team(P.anita, S.drIyer, 'Medical oncologist'); team(P.anita, S.nurseLak, 'Chemo nurse'); team(P.anita, S.pharmS, 'Oncology pharmacist'); team(P.anita, S.liaisonS, 'Navigator');
  team(P.mohan, S.drBose, 'Medical oncologist'); team(P.mohan, S.nurseLak, 'Chemo nurse'); team(P.mohan, S.pharmS, 'Oncology pharmacist');
  team(P.selvi, S.drSen, 'Cardiologist'); team(P.selvi, S.nurseJoy, 'Heart-failure nurse'); team(P.selvi, S.diet, 'Dietitian');
  team(P.arjun, S.drKhan, 'GP');

  // ---------- treatments ----------
  const tx = (t: Omit<Treatment, 'id' | 'status' | 'version'> & { status?: Treatment['status'] }) => { const x: Treatment = { id: id('tx'), status: 'active', version: 1, signedAt: at(-5), ...t } as Treatment; db.treatments.push(x); return x; };
  const sx = (u: AppUser) => ({ prescriberId: u.id, signedBy: u.displayName });
  // Ramesh: knee replacement 5 days ago + diabetes + BP
  const rTkr = tx({ patientId: P.ramesh, kind: 'procedure', ref: 'tkr', label: 'Right total knee replacement', startDate: d(-5), orgId: ORG1, ...sx(S.drRao), targets: [{ measure: 'steps', label: 'Daily steps', direction: 'increase', target: 3000, unit: 'steps', windowWeeks: 6, source: 'clinician' }, { measure: 'pain', label: 'Pain score', direction: 'decrease', target: 3, windowWeeks: 6, source: 'clinician' }] });
  const rApix = tx({ patientId: P.ramesh, kind: 'drug', ref: 'apixaban', label: 'Apixaban 2.5 mg tablet', dose: '2.5 mg', route: 'oral', times: ['08:00', '20:00'], startDate: d(-4), endDate: d(31), orgId: ORG1, ...sx(S.drRao) });
  tx({ patientId: P.ramesh, kind: 'drug', ref: 'paracetamol', label: 'Paracetamol 650 mg (Dolo 650)', dose: '650 mg', route: 'oral', times: ['08:00', '14:00', '20:00'], startDate: d(-5), endDate: d(14), orgId: ORG1, ...sx(S.drRao) });
  tx({ patientId: P.ramesh, kind: 'drug', ref: 'tramadol', label: 'Tramadol 50 mg (as needed at night)', dose: '50 mg', route: 'oral', times: ['21:30'], startDate: d(-5), endDate: d(5), orgId: ORG1, ...sx(S.drRao) });
  const rMet = tx({ patientId: P.ramesh, kind: 'drug', ref: 'metformin', label: 'Metformin 500 mg (Glycomet)', dose: '500 mg', route: 'oral', times: ['08:30', '20:30'], food: 'with meals', startDate: d(-700), orgId: ORG3, ...sx(S.drKhan), targets: [{ measure: 'HbA1c', label: 'HbA1c', direction: 'decrease', target: 7, unit: '%', windowWeeks: 12, source: 'clinician' }] });
  tx({ patientId: P.ramesh, kind: 'drug', ref: 'amlodipine', label: 'Amlodipine 5 mg', dose: '5 mg', route: 'oral', times: ['08:00'], startDate: d(-1000), orgId: ORG3, ...sx(S.drKhan), targets: [{ measure: 'bp_sys', label: 'Home systolic BP', direction: 'decrease', target: 130, unit: 'mmHg', windowWeeks: 4, source: 'clinician' }] });
  // Anita: AC chemo, cycle 2 day 4
  const aAC = tx({ patientId: P.anita, kind: 'regimen', ref: 'AC', label: 'AC chemotherapy (doxorubicin + cyclophosphamide) q21d × 4', startDate: d(-24), cycle: { lengthDays: 21, count: 4, day1Dates: [d(-24), d(-3)] }, orgId: ORG2, ...sx(S.drIyer) });
  tx({ patientId: P.anita, kind: 'drug', ref: 'ondansetron', label: 'Ondansetron 8 mg (days 1–3 after chemo)', dose: '8 mg', route: 'oral', times: ['08:00', '20:00'], startDate: d(-3), endDate: d(-1), status: 'completed', orgId: ORG2, ...sx(S.drIyer) });
  // Mohan: CAPOX cycle 3 day 4, on warfarin for AF (interaction)
  const mCap = tx({ patientId: P.mohan, kind: 'regimen', ref: 'CAPOX', label: 'CAPOX (capecitabine + oxaliplatin) q21d × 8', startDate: d(-45), cycle: { lengthDays: 21, count: 8 }, orgId: ORG2, ...sx(S.drBose), targets: [{ measure: 'CEA', label: 'CEA', direction: 'decrease', unit: 'ng/mL', windowWeeks: 9, source: 'clinician' }] });
  tx({ patientId: P.mohan, kind: 'drug', ref: 'capecitabine', label: 'Capecitabine 1500 mg twice daily (days 1–14)', dose: '1500 mg', route: 'oral', times: ['08:30', '20:30'], food: 'within 30 min after food', startDate: d(-45), cycle: { lengthDays: 21, count: 8 }, notes: 'days 1-14 of each 21-day cycle', orgId: ORG2, ...sx(S.drBose) });
  tx({ patientId: P.mohan, kind: 'drug', ref: 'warfarin', label: 'Warfarin 3 mg', dose: '3 mg', route: 'oral', times: ['18:00'], startDate: d(-400), orgId: ORG2, ...sx(S.drBose), targets: [{ measure: 'INR', label: 'INR', direction: 'reach', target: 2.5, windowWeeks: 2, source: 'clinician' }] });
  // Selvi: heart failure + CKD
  tx({ patientId: P.selvi, kind: 'drug', ref: 'furosemide', label: 'Furosemide 40 mg', dose: '40 mg', route: 'oral', times: ['08:00'], startDate: d(-60), orgId: ORG1, ...sx(S.drSen), targets: [{ measure: 'weight', label: 'Dry weight', direction: 'reach', target: 58, unit: 'kg', windowWeeks: 4, source: 'clinician' }] });
  tx({ patientId: P.selvi, kind: 'drug', ref: 'bisoprolol', label: 'Bisoprolol 2.5 mg', dose: '2.5 mg', route: 'oral', times: ['08:00'], startDate: d(-365), orgId: ORG1, ...sx(S.drSen) });
  tx({ patientId: P.selvi, kind: 'drug', ref: 'telmisartan', label: 'Telmisartan 40 mg', dose: '40 mg', route: 'oral', times: ['20:00'], startDate: d(-365), orgId: ORG1, ...sx(S.drSen) });
  // Arjun: sertraline started 10 days ago
  const arSert = tx({ patientId: P.arjun, kind: 'drug', ref: 'sertraline', label: 'Sertraline 50 mg', dose: '50 mg', route: 'oral', times: ['09:00'], startDate: d(-10), orgId: ORG3, ...sx(S.drKhan), targets: [{ measure: 'PHQ9', label: 'PHQ-9', direction: 'decrease', target: 5, windowWeeks: 8, source: 'clinician' }] });

  // ---------- doses (last 6 days + today) ----------
  for (const t of db.treatments) {
    if (t.kind !== 'drug' || !t.times) continue;
    for (let k = -6; k <= 0; k++) {
      const date = d(k); if (date < t.startDate || (t.endDate && date > t.endDate)) continue;
      if (t.cycle && t.notes?.includes('days 1-14') && ((k + 45) % 21) > 13) continue;
      for (const time of t.times) {
        let status: Dose['status'];
        if (k === 0) status = time < '12:00' ? (rnd() < 0.8 ? 'taken' : 'no_answer') : 'due';
        else { const x = rnd(); status = x < 0.8 ? 'taken' : x < 0.88 ? 'taken_late' : x < 0.94 ? 'no_answer' : 'skipped'; }
        if (t.patientId === P.mohan && t.ref === 'capecitabine' && k === -1 && time === '20:30') status = 'held';
        db.doses.push({ id: id('dose'), patientId: t.patientId, treatmentId: t.id, date, time, status, reason: status === 'skipped' ? 'Felt sick' : status === 'held' ? 'Held on oncology team advice (hand-foot syndrome)' : undefined, events: status === 'due' ? [] : [{ status, by: status === 'no_answer' ? 'system' : 'patient', at: `${date}T${time}:00.000Z` }] });
      }
    }
  }

  // ---------- observations ----------
  const obs = (patientId: string, type: string, value: number, unit: string, k: number, source: Observation['source'] = 'patient', extra: Partial<Observation> = {}) =>
    db.observations.push({ id: id('ob'), patientId, type, value, unit, date: d(k), source, ...extra });
  [180, 420, 760, 1150, 1480].forEach((v, i) => obs(P.ramesh, 'steps', v, 'steps', -4 + i, 'device', { device: 'Phone (Health Connect)' }));
  obs(P.ramesh, 'steps', 620, 'steps', 0, 'device', { device: 'Phone (Health Connect)' });
  [7, 6, 6, 5, 5, 4].forEach((v, i) => obs(P.ramesh, 'pain', v, '/10', -5 + i));
  [148, 142, 139, 136, 134, 131, 133].forEach((v, i) => obs(P.ramesh, 'bp_sys', v, 'mmHg', -6 + i, 'device', { value2: 84 - (i % 3), device: 'Omron BP monitor' }));
  [162, 154, 149, 141, 152, 138].forEach((v, i) => obs(P.ramesh, 'fpg', v, 'mg/dL', -5 + i));
  obs(P.ramesh, 'knee_flexion', 75, '°', -2, 'clinic', { by: S.physio.displayName });
  obs(P.ramesh, 'oks', 18, 'score', -12, 'patient');
  [68.2, 68.9, 69.4, 69.9, 70.1].forEach((v, i) => obs(P.selvi, 'weight', v, 'kg', -4 + i, 'device', { device: 'Bluetooth scale' }));
  [64, 66, 62, 61, 63].forEach((v, i) => obs(P.selvi, 'hr', v, 'bpm', -4 + i, 'device', { device: 'Watch' }));
  [36.8, 37.2, 37.9, 38.3].forEach((v, i) => obs(P.anita, 'temp', v, '°C', -3 + i));
  [21, 18, 16].forEach((v, i) => obs(P.arjun, 'PHQ9', v, 'score', [-10, -3, 0][i]));
  [3, 3, 2, 3, 4, 3, 4].forEach((v, i) => obs(P.arjun, 'mood', v, '/5', -6 + i));
  [4200, 3900, 5100, 2600, 4800].forEach((v, i) => obs(P.mohan, 'steps', v, 'steps', -4 + i, 'device', { device: 'Galaxy Watch (Health Connect)' }));

  // ---------- labs ----------
  const L = (patientId: string, code: string, name: string, value: number, unit: string, k: number, refLow?: number, refHigh?: number, status: LabResult['status'] = 'confirmed', source = 'Hospital lab') =>
    db.labs.push({ id: id('lab'), patientId, code, name, value, unit, refLow, refHigh, date: d(k), source, status, confirmedBy: status === 'confirmed' ? 'Lab interface' : undefined });
  L(P.ramesh, 'Hb', 'Haemoglobin', 10.8, 'g/dL', -4, 13, 17); L(P.ramesh, 'HbA1c', 'HbA1c', 8.1, '%', -95, undefined, 5.6); L(P.ramesh, 'HbA1c', 'HbA1c', 7.6, '%', -6, undefined, 5.6);
  L(P.ramesh, 'creatinine', 'Creatinine', 1.0, 'mg/dL', -6, 0.7, 1.3); L(P.ramesh, 'eGFR', 'eGFR', 74, 'mL/min/1.73m²', -6, 60);
  L(P.anita, 'ANC', 'Neutrophils (absolute)', 3.8, '×10⁹/L', -25, 2.0, 7.5); L(P.anita, 'ANC', 'Neutrophils (absolute)', 2.1, '×10⁹/L', -4, 2.0, 7.5); L(P.anita, 'ANC', 'Neutrophils (absolute)', 0.8, '×10⁹/L', 0, 2.0, 7.5);
  L(P.anita, 'PLT', 'Platelets', 245, '×10⁹/L', -4, 150, 410); L(P.anita, 'PLT', 'Platelets', 132, '×10⁹/L', 0, 150, 410); L(P.anita, 'Hb', 'Haemoglobin', 10.6, 'g/dL', 0, 12, 15.5);
  L(P.anita, 'LVEF', 'Echo LVEF', 62, '%', -30, 55); L(P.anita, 'bilirubin', 'Bilirubin (total)', 0.7, 'mg/dL', -4, 0.2, 1.2);
  L(P.anita, 'ALT', 'ALT', 96, 'U/L', -1, 7, 40, 'candidate', 'Uploaded report (photo) — needs confirmation');
  [18.2, 9.4, 6.1].forEach((v, i) => L(P.mohan, 'CEA', 'CEA', v, 'ng/mL', [-46, -24, -3][i], undefined, 5));
  L(P.mohan, 'INR', 'INR', 2.4, '', -30, 2, 3); L(P.mohan, 'INR', 'INR', 3.9, '', -2, 2, 3);
  L(P.mohan, 'ANC', 'Neutrophils (absolute)', 2.6, '×10⁹/L', -4, 2.0, 7.5); L(P.mohan, 'PLT', 'Platelets', 98, '×10⁹/L', -4, 150, 410); L(P.mohan, 'creatinine', 'Creatinine', 1.1, 'mg/dL', -4, 0.7, 1.3); L(P.mohan, 'bilirubin', 'Bilirubin (total)', 1.0, 'mg/dL', -4, 0.2, 1.2);
  L(P.selvi, 'K', 'Potassium', 5.1, 'mmol/L', -30, 3.5, 5.0); L(P.selvi, 'K', 'Potassium', 5.7, 'mmol/L', -2, 3.5, 5.0); L(P.selvi, 'creatinine', 'Creatinine', 1.5, 'mg/dL', -2, 0.6, 1.1); L(P.selvi, 'Na', 'Sodium', 134, 'mmol/L', -2, 135, 145);
  L(P.arjun, 'Na', 'Sodium', 139, 'mmol/L', -10, 135, 145);

  // ---------- check-in answers ----------
  const cr = (patientId: string, checkId: string, ask: string, answer: string, k: number, tier: CheckResult['tier'] = 'green', grade?: number, by = 'patient') =>
    db.check_results.push({ id: id('chk'), patientId, checkId, ask, answer, date: d(k), tier, grade, links: [], by, at: at(k, '10:00') });
  cr(P.ramesh, 'wound', 'Is your wound red, swollen, hot, or leaking fluid?', 'mild', -1, 'green', 1); cr(P.ramesh, 'calf', 'Any pain, swelling or warmth in your calf?', 'no', -1, 'green', 0);
  cr(P.ramesh, 'constipation', 'Any constipation?', 'moderate', -1, 'green', 2); cr(P.ramesh, 'drowsy', 'Have you felt too sleepy or confused?', 'mild', -2, 'green', 1); cr(P.ramesh, 'bleed_minor', 'Any unusual bruising, nosebleeds or bleeding gums?', 'mild', -1, 'green', 1);
  cr(P.anita, 'nausea', 'How bad is any nausea (feeling sick)?', 'moderate', -1, 'green', 2); cr(P.anita, 'vomiting', 'Have you been vomiting? How bad?', 'mild', -1, 'green', 1); cr(P.anita, 'mucositis', 'Any sore mouth or mouth ulcers? How bad?', 'mild', -1, 'green', 1);
  cr(P.anita, 'fever_chemo', 'Do you have a fever (38°C or higher), chills or shivering?', 'yes', 0, 'red', 2);
  cr(P.mohan, 'hfs', 'Any redness, swelling, pain or peeling on your palms or soles?', 'moderate', -1, 'amber', 2); cr(P.mohan, 'diarrhoea', 'Any loose stools? How bad compared with normal?', 'mild', -1, 'green', 1); cr(P.mohan, 'neuropathy', 'Any numbness, tingling or pain in your hands or feet?', 'mild', -3, 'green', 1);
  cr(P.mohan, 'bleed_minor', 'Any unusual bruising, nosebleeds or bleeding gums?', 'moderate', -1, 'green', 2);
  cr(P.selvi, 'orthopnoea', 'Do you need more pillows to breathe at night?', 'yes', -1, 'amber', 2); cr(P.selvi, 'hf_swelling', 'Any increase in ankle or leg swelling?', 'moderate', -1, 'green', 2);
  cr(P.arjun, 'nausea_ssri', 'Any nausea?', 'mild', -7, 'green', 1); cr(P.arjun, 'sleep_restless', 'Any change in sleep, restlessness or anxiety?', 'moderate', -3, 'green', 2); cr(P.arjun, 'self_harm', 'Have you had new or worse thoughts of harming yourself?', 'no', -3, 'green', 0);

  // ---------- adverse events ----------
  const ae = (a: Omit<Db['adverse_events'][0], 'id' | 'createdAt'>) => db.adverse_events.push({ id: id('ae'), createdAt: at(-1), ...a });
  ae({ patientId: P.mohan, term: 'Palmar-plantar erythrodysesthesia (hand-foot syndrome)', grade: 2, onset: d(-2), status: 'open', suspected: [mCap.id], attribution: 'likely', attributionWhy: 'Listed side effect of capecitabine; onset cycle 3 day 2', source: 'check-in', serious: false, action: 'Capecitabine evening dose held; emollient advised', reviewedBy: S.drBose.displayName });
  ae({ patientId: P.anita, term: 'Neutrophil count decreased', grade: 3, onset: d(0), status: 'open', suspected: [aAC.id], attribution: 'likely', attributionWhy: 'Expected nadir of AC (cycle 2 day 4); CTCAE v5 grade 3', source: 'lab', serious: true });
  ae({ patientId: P.ramesh, term: 'Constipation', grade: 2, onset: d(-2), status: 'resolving', suspected: [db.treatments.find(t => t.ref === 'tramadol')!.id], attribution: 'possible', attributionWhy: 'Known with tramadol; also post-op immobility', source: 'check-in', serious: false, action: 'Laxative per discharge plan', reviewedBy: S.nursePriya.displayName });
  ae({ patientId: P.selvi, term: 'Hyperkalemia', grade: 2, onset: d(-2), status: 'open', suspected: [db.treatments.find(t => t.ref === 'telmisartan')!.id], attribution: 'possible', attributionWhy: 'RAAS blocker + CKD', source: 'lab', serious: false });

  // ---------- alerts ----------
  const alert = (patientId: string, tier: Db['alerts'][0]['tier'], kind: string, title: string, evidence: string, k = 0, status: Db['alerts'][0]['status'] = 'open', ownerId?: string) =>
    db.alerts.push({ id: id('al'), patientId, tier, kind, title, evidence, status, createdAt: at(k, '08:40'), ownerId });
  alert(P.anita, 'red', 'combined', 'Fever during chemotherapy (possible febrile neutropenia)', 'Fever 38.3 °C today; ANC 0.8 ×10⁹/L (CTCAE grade 3); AC cycle 2 day 4');
  alert(P.mohan, 'amber', 'lab', 'INR above range on warfarin + capecitabine', 'INR 3.9 (range 2–3) on day 43; known capecitabine–warfarin interaction');
  alert(P.mohan, 'amber', 'check-in', 'Hand-foot syndrome moderate', 'Patient reported moderate palm/sole pain (cycle 3 day 3)', -1, 'acknowledged', S.drBose.id);
  alert(P.selvi, 'amber', 'combined', 'Weight up 1.9 kg in 4 days + breathless lying flat', 'Weight 68.2 → 70.1 kg; orthopnoea yes; K 5.7 mmol/L');
  alert(P.ramesh, 'amber', 'adherence', 'Two apixaban doses not confirmed', 'No answer to two evening reminders this week', -1);
  alert(P.anita, 'amber', 'lab', 'Uploaded ALT result needs confirmation', 'ALT 96 U/L (2.4×ULN) read from a photo of an outside report', -1);

  // ---------- messages ----------
  const msg = (patientId: string, u: AppUser, role: string, text: string, k: number, hm: string, via?: string) => db.messages.push({ id: id('msg'), patientId, fromUserId: u.id, fromName: u.displayName, fromKind: u.kind, fromRole: role, text, at: at(k, hm), via });
  const U = (username: string) => db.users.find(u => u.username === username)!;
  msg(P.ramesh, U('ramesh'), 'Patient', 'Knee feels tight in the morning. Is that normal?', -1, '07:40', 'voice');
  msg(P.ramesh, S.physio, 'Physiotherapist', 'Yes, morning stiffness is common in week 1. Do your ankle pumps and heel slides before getting up. See you Thursday.', -1, '09:15');
  msg(P.ramesh, U('sunita'), 'Carer (daughter)', 'Papa walked to the gate and back today with the walker 🙂', 0, '08:05');
  msg(P.mohan, U('kavitha'), 'Carer (wife)', 'His palms are red and painful since yesterday. He skipped the evening tablet.', -1, '19:10');
  msg(P.mohan, S.drBose, 'Oncologist', 'Thank you. Please hold capecitabine until we review tomorrow at 10 am. Apply the cream twice daily.', -1, '20:02');
  msg(P.anita, S.nurseLak, 'Chemo nurse', 'Anita, your temperature reading is high. Please come to the day-care unit now, or the emergency department if after hours.', 0, '08:45');

  // ---------- protocols & pathways ----------
  const it = (who: PathwayWho, type: string, title: string, from: number, to: number, times: string[], repeat: PathwayItem['repeat'], notes?: string, flag?: boolean): PathwayItem => ({ id: id('pi'), who, type, title, from, to, times, repeat, notes, flag });
  const tkr: Protocol = { id: 'prot_tkr_eras', orgId: ORG1, name: 'TKR ERAS pathway (demo)', condition: 'Total knee replacement', deptId: D.ortho, duration: 42, status: 'approved', version: 3, approvedBy: S.drRao.displayName, source: 'TKR_ERAS_Care_Pathway_DEMO.docx',
    items: [
      it('patient', 'Exercise', 'Ankle pumps & quads sets (10 each)', 0, 42, ['08:00', '13:00', '18:00'], 'thrice'),
      it('patient', 'Exercise', 'Walk with walker', 1, 42, ['10:00', '16:00'], 'twice', 'Increase distance each day'),
      it('patient', 'Wound', 'Wound photo for review', 2, 14, ['11:00'], 'once', 'Day 2, 7 and 14'),
      it('patient', 'Wound', 'Wound photo for review', 7, 7, ['11:00'], 'once'),
      it('patient', 'Diet', 'Protein with every meal + 8 glasses of water', 0, 42, ['12:30'], 'daily'),
      it('carer', 'Support', 'Check walking aid & trip hazards at home', 1, 3, ['18:00'], 'once'),
      it('nurse', 'Call', 'Post-discharge phone call', 2, 2, ['15:00'], 'once', 'Pain, wound, bowels, DVT signs', true),
      it('physio', 'Review', 'Physio review (ROM, gait)', 7, 7, ['10:00'], 'once'),
      it('physio', 'Review', 'Physio review (ROM, gait)', 14, 14, ['10:00'], 'once'),
      it('nurse', 'Wound', 'Suture/clip removal', 14, 14, ['11:30'], 'once'),
      it('doctor', 'Review', 'Surgeon review + X-ray', 42, 42, ['10:30'], 'once', '', true),
      it('liaison', 'Call', 'Weekly check-in call', 7, 42, ['16:00'], 'weekly'),
      it('dietitian', 'Review', 'Diabetes diet review', 5, 5, ['12:00'], 'once'),
      it('pharmacist', 'Review', 'Anticoagulant counselling & reconciliation', 0, 0, ['15:30'], 'once'),
    ] };
  const chemo: Protocol = { id: 'prot_chemo_daycare', orgId: ORG2, name: 'Chemotherapy cycle follow-up (demo)', condition: 'Systemic anticancer therapy, 21-day cycle', deptId: D.daycare, duration: 21, status: 'approved', version: 2, approvedBy: S.drIyer.displayName,
    items: [
      it('patient', 'Check', 'Temperature (morning and evening)', 0, 20, ['08:00', '20:00'], 'twice', 'Call the 24-h line if 38 °C or above', true),
      it('patient', 'Check', 'Mouth care rinse', 0, 20, ['09:00', '21:00'], 'twice'),
      it('nurse', 'Call', 'Day-3 symptom call', 2, 2, ['14:00'], 'once', 'Nausea, bowels, fever, mouth', true),
      it('nurse', 'Lab', 'Pre-cycle bloods (CBC, LFT, creatinine)', 19, 19, ['09:00'], 'once'),
      it('pharmacist', 'Review', 'Pre-cycle prescription verification', 19, 19, ['15:00'], 'once'),
      it('doctor', 'Review', 'Pre-cycle review & sign-off', 20, 20, ['11:00'], 'once', '', true),
      it('liaison', 'Call', 'Book next cycle & transport', 15, 15, ['12:00'], 'once'),
    ] };
  const hfProt: Protocol = { id: 'prot_hf', orgId: ORG1, name: 'Heart-failure titration follow-up (demo)', condition: 'Heart failure', deptId: D.cardio, duration: 84, status: 'draft', version: 1,
    items: [it('patient', 'Check', 'Weigh yourself after waking, before breakfast', 0, 84, ['07:30'], 'daily'), it('nurse', 'Call', 'HF nurse call', 7, 84, ['11:00'], 'weekly'), it('nurse', 'Lab', 'U&E (potassium, creatinine)', 7, 7, ['09:00'], 'once'), it('dietitian', 'Review', 'Salt & fluid advice', 3, 3, ['12:00'], 'once')] };
  db.protocols.push(tkr, chemo, hfProt);
  db.pathways.push({ id: id('pw'), patientId: P.ramesh, protocolId: tkr.id, protocolName: tkr.name, version: tkr.version, start: rTkr.startDate, items: tkr.items, status: 'active', assignedBy: S.drRao.displayName });
  db.pathways.push({ id: id('pw'), patientId: P.anita, protocolId: chemo.id, protocolName: chemo.name, version: chemo.version, start: d(-3), items: chemo.items, status: 'active', assignedBy: S.drIyer.displayName });
  db.pathways.push({ id: id('pw'), patientId: P.mohan, protocolId: chemo.id, protocolName: chemo.name, version: chemo.version, start: d(-3), items: chemo.items, status: 'active', assignedBy: S.drBose.displayName });
  db.pathways.push({ id: id('pw'), patientId: P.selvi, protocolId: hfProt.id, protocolName: hfProt.name, version: 1, start: d(-10), items: hfProt.items, status: 'active', assignedBy: S.drSen.displayName });

  // ---------- FAQ (care-team approved answers come first in Saathi) ----------
  const faq = (orgId: string, q: string, a: string, tags: string) => db.faq.push({ id: id('faq'), orgId, q, a, tags, status: 'approved', approvedBy: 'Demo clinical lead' });
  faq(ORG1, 'When can I shower after knee replacement?', 'Keep the dressing dry until your nurse says the wound is sealed, usually around day 5–7. Use a waterproof cover until then.', 'knee shower wound bath');
  faq(ORG1, 'Is knee swelling normal after surgery?', 'Some swelling is normal for several weeks. Raise your leg and use an ice pack for 15–20 minutes. Tell us if your calf becomes painful or swollen.', 'knee swelling ice');
  faq(ORG1, 'When can I climb stairs?', 'Your physiotherapist will teach you before discharge: good leg up first, operated leg down first, always holding the rail.', 'stairs knee walk');
  faq(ORG1, 'What should I eat to heal faster?', 'Protein at every meal (dal, eggs, paneer, curd), fruits and vegetables, and plenty of water unless you have a fluid limit.', 'diet food protein');
  faq(ORG2, 'What should I do if I get a fever during chemotherapy?', 'A temperature of 38 °C or higher during chemotherapy is an emergency. Call the 24-hour oncology line straight away or go to the emergency department. Do not wait.', 'fever temperature chemo emergency');
  faq(ORG2, 'Why is my urine red after chemotherapy?', 'Doxorubicin is red and can colour your urine for 1–2 days. This is expected. Tell us if it lasts longer or you see blood clots.', 'urine red doxorubicin');
  faq(ORG2, 'How can I look after my mouth during chemotherapy?', 'Use a soft toothbrush and rinse with salt water or the mouthwash you were given 4 times a day. Avoid spicy food if your mouth is sore.', 'mouth ulcers mucositis');
  faq(ORG3, 'How long until my antidepressant works?', 'Most people notice a change after 2–4 weeks, and the full effect can take 6–8 weeks. Keep taking it and tell your doctor how you feel at your review.', 'antidepressant sertraline weeks');

  db.audit.push({ id: id('au'), at: at(-1, '18:00'), actor: 'system', action: 'seed', detail: 'Synthetic demo data generated' });
  void S.drMenon; void rApix; void rMet; void arSert;
  return db;
}
