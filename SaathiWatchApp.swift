// Saathi for Apple Watch (watchOS 10+, SwiftUI). Add as a Watch App target to ios/App in Xcode
// (or via Appflow with the target committed). Receives today's reminders from the phone app over
// WatchConnectivity, taps the wrist at each time, and lets the patient tick items off.
import SwiftUI
import WatchConnectivity
import UserNotifications
import HealthKit

struct Reminder: Codable, Identifiable, Hashable { var id: String { time + title }; let time: String; let title: String; let kind: String }
struct Payload: Codable { let reminders: [Reminder]; let stepGoal: Int?; let name: String; let lang: String }

final class Session: NSObject, ObservableObject, WCSessionDelegate {
  @Published var payload: Payload?
  @Published var done: Set<String> = []
  @Published var steps: Int = 0
  private let health = HKHealthStore()
  override init() {
    super.init()
    if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    let stepType = HKQuantityType(.stepCount)
    health.requestAuthorization(toShare: nil, read: [stepType]) { ok, _ in if ok { self.loadSteps() } }
  }
  func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {}
  /// The phone sends {"payload": "<json>"} via updateApplicationContext (see native/plugins/ios/SaathiWatchPlugin.swift).
  func session(_ s: WCSession, didReceiveApplicationContext ctx: [String: Any]) {
    guard let json = ctx["payload"] as? String, let data = json.data(using: .utf8), let p = try? JSONDecoder().decode(Payload.self, from: data) else { return }
    DispatchQueue.main.async { self.payload = p; self.schedule(p) }
  }
  func markDone(_ r: Reminder) {
    done.insert(r.id)
    if WCSession.default.isReachable { WCSession.default.sendMessage(["done": r.title, "time": r.time], replyHandler: nil) }
    else { WCSession.default.transferUserInfo(["done": r.title, "time": r.time]) }
  }
  private func schedule(_ p: Payload) {
    let c = UNUserNotificationCenter.current(); c.removeAllPendingNotificationRequests()
    for r in p.reminders {
      let parts = r.time.split(separator: ":").compactMap { Int($0) }; guard parts.count == 2 else { continue }
      var dc = DateComponents(); dc.hour = parts[0]; dc.minute = parts[1]
      let content = UNMutableNotificationContent(); content.title = "Saathi"; content.body = "\(p.name), \(r.title)"; content.sound = .default
      c.add(UNNotificationRequest(identifier: r.id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: dc, repeats: false)))
    }
  }
  private func loadSteps() {
    let start = Calendar.current.startOfDay(for: Date())
    let q = HKStatisticsQuery(quantityType: HKQuantityType(.stepCount), quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: Date()), options: .cumulativeSum) { _, s, _ in
      DispatchQueue.main.async { self.steps = Int(s?.sumQuantity()?.doubleValue(for: .count()) ?? 0) } }
    health.execute(q)
  }
}

@main struct SaathiWatchApp: App {
  @StateObject var s = Session()
  var body: some Scene { WindowGroup { ContentView().environmentObject(s) } }
}

struct ContentView: View {
  @EnvironmentObject var s: Session
  var body: some View {
    NavigationStack {
      List {
        Section { HStack { Image(systemName: "figure.walk").foregroundStyle(.orange); Text("\(s.steps) / \(s.payload?.stepGoal ?? 3000)").font(.headline) } }
        Section("Today") {
          ForEach(s.payload?.reminders ?? []) { r in
            Button { s.markDone(r) } label: {
              HStack { Text(r.time).monospacedDigit().foregroundStyle(.secondary); Text(r.title).lineLimit(2); Spacer(); if s.done.contains(r.id) { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) } }
            }
          }
          if s.payload == nil { Text("Open Saathi on your phone to sync").foregroundStyle(.secondary) }
        }
      }.navigationTitle("Saathi")
    }
  }
}
