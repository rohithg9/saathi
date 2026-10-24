# Watches and health data

| Platform | How Saathi connects | Code |
|---|---|---|
| Apple Watch | watchOS app gets today's reminders from the iPhone app (WatchConnectivity); reads steps from HealthKit | `native/watch/watchos`, `native/plugins/ios/SaathiWatchPlugin.swift` |
| Wear OS (Samsung Galaxy Watch, Pixel Watch, …) | Wear OS app gets reminders via the Wearable Data Layer; phone reads Health Connect | `native/watch/wearos`, `native/plugins/android/SaathiHealthPlugin.kt` |
| Huawei (incl. Watch D blood-pressure watches) | Not Wear OS. Use Huawei Health Kit on Android to read BP/steps, or the HarmonyOS watch SDK for a watch app | to do |
| Any watch that syncs to Apple Health / Health Connect | No watch app needed: steps, heart rate, BP and weight flow into Saathi through the phone | `readSteps()` in `src/native/bridge.ts` |

## Flow
1. The phone app computes today's reminders (`patientDay`) and schedules native local notifications.
2. `syncWatch()` sends the same list to the watch, which buzzes at each time and sends "done" back.
3. `readSteps()` pulls daily steps (and later BP, heart rate, weight) into Saathi's observations, which
   feed ERAS goals (e.g. steps after knee replacement) and outcome tracking.

## Installing the plugins
After `npx cap add ios|android`:
- iOS: add `SaathiWatchPlugin.swift` to the App target; add a **Watch App** target in Xcode with
  `SaathiWatchApp.swift` (Xcode is needed once for adding the target; Appflow builds afterwards; or
  ask a contractor with a Mac to add the target and commit it).
- Android: copy `SaathiHealthPlugin.kt` into `android/app/src/main/java/com/exoralabs/saathi/`, register
  both plugins in `MainActivity`, add `androidx.health.connect:connect-client` and
  `play-services-wearable` dependencies. Add `native/watch/wearos/app` as a `:wear` module with the same applicationId.

> These native files are starting skeletons. They have not been compiled in this environment
> (no Xcode / Android SDK here). Expect small fixes when first building.

## A Saathi-branded watch
A white-label watch sold with the subscription is possible later (an ODM watch on Wear OS or a
proprietary RTOS with a BLE companion protocol). Until then, any Apple, Wear OS or Huawei watch works through the phone.
