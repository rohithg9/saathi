# Launching Saathi on iOS and Android (no Mac needed)

The same web app is wrapped by **Capacitor** into native iOS and Android apps. **Ionic Appflow**
builds them in the cloud straight from the GitHub repo, so you never need a Mac.

## 0. One-time setup on any computer (Windows is fine)
```bash
npm install
npm run build
npx cap add android
npx cap add ios          # works on Windows/Linux: it only generates the Xcode project files
npm run assets           # app icons + splash from resources/icon.png and resources/splash.png
npx cap sync
```
Commit the generated `android/` and `ios/` folders; Appflow builds from them.

Then copy the custom plugins from `native/plugins/` into the native projects (see docs/WATCH.md) and add:
- **iOS** (`ios/App/App/Info.plist`): `NSHealthShareUsageDescription`, `NSMicrophoneUsageDescription`,
  `NSSpeechRecognitionUsageDescription`; enable the HealthKit and Push Notifications capabilities.
- **Android**: the `saathi_chime.wav` sound in `android/app/src/main/res/raw/`, the small icon
  `ic_stat_saathi`, Health Connect permissions, and `SCHEDULE_EXACT_ALARM` for on-time reminders.

## 1. Accounts you need
| | Apple App Store | Google Play |
|---|---|---|
| Account | Apple Developer Program, **enrolled as an organisation** (Exora Labs) | Google Play Console, **organisation** account |
| Why organisation | Apple guideline 5.1.1(ix): apps in highly regulated fields such as healthcare should be submitted by a legal entity, not an individual | Organisation accounts avoid the new-personal-account rule of 12 testers for 14 days of closed testing before production |
| Needs | D-U-N-S number for the company (free from Dun & Bradstreet, allow about a week) | D-U-N-S number as well; company verification |

## 2. Appflow
1. Create an Appflow app and **connect the GitHub repo** `rohithg9/saathi`.
2. Environment variables (Appflow → Environments): `SAATHI_DATA_MODE=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
   The build runs `npm run build`, then `npx cap sync`.
3. **Signing certificates** (Appflow → Certificates):
   - Android: generate an upload keystore (`keytool -genkey -v -keystore saathi.jks -alias saathi -keyalg RSA -keysize 2048 -validity 10000`) and upload it. Keep a backup; you can't replace it easily.
   - iOS without a Mac: create a CSR with OpenSSL, upload it in the Apple Developer portal to get an
     Apple Distribution certificate, convert to `.p12` with OpenSSL, create an App ID `com.exoralabs.saathi`
     (with HealthKit + Push) and an App Store provisioning profile, then upload the `.p12` + profile to Appflow.
4. Build → **iOS App Store** and **Android release (AAB)** builds.
5. Appflow **Deploy → Destinations** can upload straight to App Store Connect (TestFlight) and Google Play.

## 3. Store review checklist (healthcare apps)
- **Privacy policy URL** and in-app account deletion (both stores require it).
- **Apple guideline 4.2 (minimum functionality)**: Saathi is more than a wrapped website. It has native
  notifications with custom sound, native text-to-speech, HealthKit / Health Connect and watch apps. Say so in the review notes.
- **Demo login for reviewers**: give a patient and a care-team account (synthetic data).
- **Medical claims**: describe Saathi as a care companion and reminder tool that supports, not replaces,
  the care team. Do not claim diagnosis. India: check whether any feature makes it Software as a
  Medical Device under the CDSCO Medical Device Rules before adding diagnostic features.
- **Data protection**: DPDP Act 2023 consent screens; host data in India (Supabase region `ap-south-1`, Mumbai).
- Google Play **Health apps declaration** and **Data safety** form; Health Connect permission declaration.

## 4. What still has to happen before real patients
- Pharmacist/doctor approval of every knowledge profile in use (Drug library → Approve).
- Clinical sign-off of escalation tiers marked `TODO(clinical-review)`.
- Replace demo passwords with Supabase Auth (phone OTP for patients is recommended).
- Security review of RLS policies, penetration test, and a DPIA.
