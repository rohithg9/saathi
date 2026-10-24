// Domain types shared by the app, the data stores and the engines.
// Every clinical row carries provenance (source, author, recorded time) and is versioned, never overwritten.

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISOTime = string; // ISO timestamp
export type Tier = 'green' | 'amber' | 'red';

export type UserKind = 'patient' | 'carer' | 'staff' | 'platform';

export interface Org {
  id: ID; name: string; type: 'Clinic' | 'Hospital' | 'Hospital network' | 'Cancer centre' | 'Diagnostic centre';
  city: string; address: string; phone: string; emergency: string; ambulance: string;
  opdDays: 'Mon–Sat' | 'Mon–Fri' | 'Every day'; opdOpen: string; opdClose: string;
}
export interface Department { id: ID; orgId: ID; name: string }
export interface Role {
  id: ID; orgId: ID; key: string; label: string;
  caps: Cap[]; scope: 'dept' | 'all';
  /** pathway "Who" values that become this role's tasks */
  does: PathwayWho[];
}
export type Cap = 'sign' | 'monitor' | 'message' | 'protocol' | 'tasks' | 'register' | 'org' | 'users' | 'analytics' | 'drugs';
export interface RotaDay { on: boolean; start: string; end: string; onCall: boolean }
export interface Leave { id: ID; from: ISODate; to: ISODate; type: string }

export interface AppUser {
  id: ID; username: string; displayName: string; kind: UserKind;
  orgId?: ID; deptId?: ID; roleKey?: string; phone?: string;
  /** patient record this login belongs to (kind = patient) */
  patientId?: ID;
  active: boolean;
  /** demo store only: SHA-256 of the password. Supabase uses its own auth. */
  passwordHash?: string;
  rota?: RotaDay[]; leave?: Leave[];
  createdAt: ISOTime;
}

export interface Patient {
  id: ID; orgIds: ID[]; name: string; dob: ISODate; sex: 'F' | 'M' | 'Other';
  phone: string; abha?: string; address?: string; bloodGroup?: string;
  lang: 'en' | 'hi' | 'kn' | 'ta'; callName?: string;
  primaryDeptId?: ID; allergies: { substance: string; reaction: string; source: string }[];
  conditions: string[]; // condition keys
  emergencyContact?: string;
  registeredBy: string; // "self", "carer:<id>", "staff:<id>"
  status: 'invited' | 'consented' | 'active' | 'discharged';
  createdAt: ISOTime;
}

export interface CarerLink {
  id: ID; patientId: ID; userId: ID; relation: string; priority: number; available: boolean;
  perms: { meds: boolean; activity: boolean; symptoms: boolean; readings: boolean; mood: boolean; records: boolean };
  alerts: 'red' | 'red_missed' | 'red_amber_missed';
  status: 'invited' | 'active' | 'revoked';
}

export interface CareTeamLink { id: ID; patientId: ID; userId: ID; responsibility: string }

/** A treatment the patient is on: a medicine, a regimen (e.g. chemo cycles), a procedure, or a managed condition. */
export interface Treatment {
  id: ID; patientId: ID; kind: 'drug' | 'regimen' | 'procedure' | 'condition';
  ref: string;            // drug key / regimen key / procedure key / condition key in the knowledge base
  label: string;          // e.g. "Metformin 500 mg tablet"
  dose?: string; route?: string; times?: string[]; food?: string;
  startDate: ISODate; endDate?: ISODate;
  cycle?: { lengthDays: number; count: number; day1Dates?: ISODate[] };
  status: 'active' | 'held' | 'stopped' | 'completed';
  prescriberId?: ID; signedBy?: string; signedAt?: ISOTime; version: number;
  /** clinician-set outcome targets override the knowledge-base defaults */
  targets?: OutcomeTarget[];
  orgId?: ID; notes?: string;
}

export interface OutcomeTarget {
  measure: string;           // observation/lab code, e.g. 'HbA1c', 'bp_sys', 'steps', 'pain', 'PHQ9', 'CA15_3', 'knee_flexion'
  label: string;
  direction: 'decrease' | 'increase' | 'reach';
  target?: number;           // set by clinician; never invented by the app (null = clinician to set)
  unit?: string;
  windowWeeks?: number;      // expected time to see the effect
  source: 'knowledge' | 'clinician';
}

export interface Dose {
  id: ID; patientId: ID; treatmentId: ID; date: ISODate; time: string;
  status: 'due' | 'taken' | 'taken_late' | 'skipped' | 'held' | 'no_answer' | 'superseded';
  reason?: string; events: { status: string; by: string; at: ISOTime }[];
}

export interface CheckResult {
  id: ID; patientId: ID; checkId: string; date: ISODate; answer: string; value?: number;
  grade?: number; tier: Tier; links: string[]; by: string; at: ISOTime; ask: string;
}

export interface Observation {
  id: ID; patientId: ID; type: string; value: number; value2?: number; unit: string;
  date: ISODate; time?: string; source: 'patient' | 'carer' | 'device' | 'clinic' | 'lab';
  device?: string; by?: string;
}

export interface LabResult {
  id: ID; patientId: ID; code: string; name: string; value: number; unit: string;
  refLow?: number; refHigh?: number; date: ISODate; source: string;
  status: 'confirmed' | 'candidate'; confirmedBy?: string; docId?: ID;
}

export interface AdverseEvent {
  id: ID; patientId: ID; term: string; grade: 1 | 2 | 3 | 4 | 5; onset: ISODate; resolved?: ISODate;
  status: 'open' | 'resolving' | 'resolved'; suspected: string[]; // treatment refs
  attribution?: 'likely' | 'possible' | 'unlikely' | 'unknown'; attributionWhy?: string;
  source: 'check-in' | 'symptom report' | 'lab' | 'clinician' | 'carer';
  serious: boolean; action?: string; notes?: string; reviewedBy?: string; createdAt: ISOTime;
}

export interface Alert {
  id: ID; patientId: ID; tier: Tier; kind: string; title: string; evidence: string;
  status: 'open' | 'acknowledged' | 'resolved'; ownerId?: ID; createdAt: ISOTime; ackAt?: ISOTime; note?: string;
}

export interface Message { id: ID; patientId: ID; fromUserId: ID; fromName: string; fromKind: UserKind; fromRole: string; text: string; at: ISOTime; via?: string }

export type PathwayWho = 'patient' | 'carer' | 'doctor' | 'nurse' | 'physio' | 'dietitian' | 'liaison' | 'pharmacist';
export interface PathwayItem {
  id: string; who: PathwayWho; type: string; title: string; from: number; to: number;
  times: string[]; repeat: 'once' | 'daily' | 'twice' | 'thrice' | 'weekly' | 'monthly'; notes?: string; flag?: boolean;
}
export interface Protocol { id: ID; orgId: ID; name: string; condition: string; deptId?: ID; duration: number; items: PathwayItem[]; status: 'draft' | 'approved' | 'retired'; version: number; approvedBy?: string; source?: string }
export interface Pathway { id: ID; patientId: ID; protocolId: ID; protocolName: string; version: number; start: ISODate; items: PathwayItem[]; status: 'active' | 'ended'; assignedBy: string }

export interface TaskDone { id: ID; key: string; by: string; at: ISOTime }
export interface Faq { id: ID; orgId: ID; q: string; a: string; tags: string; status: 'draft' | 'approved' | 'retired'; approvedBy?: string }
/** Pharmacist/doctor review of a knowledge-base profile (approval makes it usable clinically). */
export interface KbReview { id: ID; key: string; orgId: ID; status: 'approved' | 'changes_requested'; reviewedBy: string; reviewerId: ID; at: ISOTime; notes?: string; version: string }
export interface AuditEvent { id: ID; at: ISOTime; actor: string; action: string; detail: string; orgId?: ID; patientId?: ID }

export interface DbShape {
  orgs: Org; departments: Department; roles: Role; users: AppUser; patients: Patient;
  carer_links: CarerLink; care_team: CareTeamLink; treatments: Treatment; doses: Dose;
  check_results: CheckResult; observations: Observation; labs: LabResult; adverse_events: AdverseEvent;
  alerts: Alert; messages: Message; protocols: Protocol; pathways: Pathway; tasks_done: TaskDone;
  faq: Faq; audit: AuditEvent; kb_reviews: KbReview;
}
export type Table = keyof DbShape;

export interface Session {
  userId: ID; username: string; name: string; kind: UserKind;
  orgId?: ID; deptId?: ID; roleKey?: string; patientId?: ID;
}
