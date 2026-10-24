# Saathi: working rules for this repository

Saathi is a patient companion: one app (web + iOS + Android via Capacitor) for patients, carers and
hospital/clinic care teams, with watch companions. Owner: Exora Labs.

## Safety rules (non-negotiable)
- Never tell a patient to start, stop, change, double or skip a dose. Every patient-facing string and
  every AI reply passes `checkOutput` (src/engine/safety.ts). Tests enforce this over the knowledge base.
- LLM output never becomes a confirmed clinical fact without human review (uploaded labs stay `candidate`
  until a clinician confirms; AI-drafted profiles stay `NOT_FOR_CLINICAL_USE`).
- Escalation tiers (green/amber/red) come only from deterministic code: `src/engine/rules.ts` + signed
  profile `escalate` maps + CTCAE v5 grading (`src/knowledge/ctcae.ts`). Never from an LLM.
- Red-tier screens (emergency, call buttons) are never paywalled or hidden behind login steps.
- "No answer" (reminder not acknowledged) is a different status from "skipped". Keep them separate everywhere.
- Clinical data is versioned, never overwritten: treatment edits bump `version` and store the previous
  row in audit; Supabase triggers snapshot every update into `row_history`.
- Knowledge profiles are `NOT_FOR_CLINICAL_USE` until `approvedBy` is set by a pharmacist/doctor.
  Do not invent numeric thresholds or targets; leave `TODO(clinical-review)` and let clinicians set targets.
- Synthetic data only in this repo. No PHI in logs (`redact`), analytics or AI prompts.
- Staff questions are mapped to predefined report tools (`src/engine/analytics.ts`); no raw SQL from AI.
- Data use is purpose-locked to care delivery (DPDP Act 2023). Consent before any secondary use.
- Ask before adding a new dependency or external service.

## Layout
- `src/data`: types, DataStore interface, demo store (localStorage), Supabase REST store, synthetic seed
- `src/knowledge`: drug / regimen / condition / procedure profiles, CTCAE grading, interactions
- `src/engine`: monitoring plan, rules, outcomes, attribution, schedule/rota, safety, assistant, analytics, Word import
- `src/native/bridge.ts`: notifications, voice, haptics, health, watch (Capacitor plugins with web fallbacks)
- `src/ui`: auth, patient, carer, team (staff + platform)
- `supabase/`: schema + RLS, edge functions (`saathi-admin`, `saathi-ai`)
- `native/`: watchOS + Wear OS apps and the custom Capacitor plugins

## Commands
`npm run dev` · `npm run build` · `npm test` · `npm run typecheck` · `npm run import:drug -- <name>`
