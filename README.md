# Saathi: patient companion

One app for **patients, carers and care teams** across hospitals and clinics. Patients get voice
reminders in their language (English, Hindi, Kannada, Tamil), check-ins, exercises with a paced
counting coach, and Saathi, a talking companion. Care teams see whether each treatment is working,
which side effects and complications are happening, and what is due today by role and rota.

> **Status: prototype / pre-clinical.** All data is synthetic. All drug, condition and procedure
> profiles are drafts marked **NOT FOR CLINICAL USE** until a pharmacist or doctor approves them.

## Try it
```bash
npm install
npm run dev          # http://localhost:5173 — demo mode, data stays in the browser
```
Sign in: choose who you are → (care team: choose hospital) → username + password `saathi123`.

| Who | Username | What to look at |
|---|---|---|
| Patient (knee replacement, Hindi voice) | `ramesh` | Today rings, voice reminder pop-ups, Saathi chat, check-ins |
| Patient (bowel cancer on CAPOX + warfarin, Kannada) | `mohan` | Chemo-cycle checks, hand-foot syndrome |
| Patient (breast cancer on AC) | `anita` | Fever during chemo → red alert |
| Carer | `sunita` (Ramesh's daughter), `kavitha` (Mohan's wife) | Patient's day, act on their behalf |
| Oncologist, Sunrise Cancer Centre | `dr.iyer`, `dr.bose` | Outcomes, side effects with CTCAE grades, monitoring plan |
| Surgeon, Demo Ortho & General | `dr.rao` | Pathways, tasks, Word import |
| Nurse / physio / pharmacist / liaison | `nurse.priya`, `physio.arjun`, `pharm.anand`, `liaison.kavya` | Role tasks via rota |
| Org admin | `admin.general`, `admin.sunrise` | People, roles, weekly rota, leave, Saathi answers |
| Platform admin | `platform` | All organisations, create organisation |

## How the clinical logic is organised
1. **Knowledge base** (`src/knowledge`): 33 drugs (12 anticancer: cytotoxics, immunotherapy, targeted,
   hormonal, plus supportive care), 3 chemo regimens, 7 conditions, 4 procedures. Each profile has *desired effects*,
   *side effects*, *complications*, and the *checks* that detect them (questions, vitals, scores,
   wearables, labs), each with a schedule (first days after starting, every N days, specific chemo-cycle days, on symptom).
2. **Monitoring plan** (`engine/plan.ts`): merges every active treatment's checks and labs, adds
   interaction checks (e.g. capecitabine + warfarin → frequent INR; anticoagulant + SSRI → bleeding checks),
   puts red flags first and caps daily questions so older patients aren't overloaded.
3. **Rules** (`engine/rules.ts`): answer → tier from the signed profile; labs graded with CTCAE v5.0;
   combined rules (fever on chemo, calf pain + breathlessness).
4. **Outcomes** (`engine/outcomes.ts`): baseline vs latest against the clinician's target and the expected
   time window: *too early / improving / target met / not improving / worsening*.
5. **Attribution** (`engine/attribution.ts`): suggests which drug likely caused a side effect (known
   association + timing / cycle day). A clinician confirms.

Sources: US FDA prescribing information (DailyMed/openFDA, link on every profile), NCI CTCAE v5.0,
ERAS Society guidance, named guidelines per condition. Add more drugs: `npm run import:drug -- rivaroxaban`.

## Data back ends
- **Demo** (default): synthetic data in the browser, SHA-256 hashed demo passwords.
- **Supabase**: `SAATHI_DATA_MODE=supabase SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run build`.
  Apply `supabase/migrations/0001_schema.sql`, deploy the edge functions, then `npm run seed:supabase`.

## Mobile apps and watches
See [docs/LAUNCH.md](docs/LAUNCH.md) (Ionic Appflow builds from GitHub, no Mac needed) and [docs/WATCH.md](docs/WATCH.md).

## Tests
`npm test` runs the engine, safety, CTCAE and access-scoping tests. `npm run typecheck`.
