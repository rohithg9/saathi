// Capacitor plugins for the iOS app (copy into ios/App/App after `npx cap add ios`, register in
// AppDelegate or via CAPBridgeViewController subclass). JS side: src/native/bridge.ts.
import Capacitor
import WatchConnectivity
import HealthKit

@objc(SaathiWatchPlugin)
public class SaathiWatchPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
  public let identifier = "SaathiWatchPlugin"; public let jsName = "SaathiWatch"
  public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise)]
  public override func load() { if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() } }
  @objc func send(_ call: CAPPluginCall) {
    guard WCSession.default.isPaired, WCSession.default.isWatchAppInstalled else { call.reject("No watch app"); return }
    do { try WCSession.default.updateApplicationContext(["payload": call.getString("payload") ?? "{}"]); call.resolve() } catch { call.reject(error.localizedDescription) }
  }
  public func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {}
  public func sessionDidBecomeInactive(_ s: WCSession) {}
  public func sessionDidDeactivate(_ s: WCSession) { WCSession.default.activate() }
  public func session(_ s: WCSession, didReceiveMessage m: [String: Any]) { notifyListeners("watchDone", data: m) }
}

@objc(SaathiHealthPlugin)
public class SaathiHealthPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SaathiHealthPlugin"; public let jsName = "SaathiHealth"
  public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "querySteps", returnType: CAPPluginReturnPromise)]
  private let store = HKHealthStore()
  @objc func requestAuthorization(_ call: CAPPluginCall) {
    let read: Set<HKObjectType> = [HKQuantityType(.stepCount), HKQuantityType(.distanceWalkingRunning), HKQuantityType(.heartRate), HKQuantityType(.bloodPressureSystolic), HKQuantityType(.bloodPressureDiastolic), HKQuantityType(.bodyMass)]
    store.requestAuthorization(toShare: nil, read: read) { ok, _ in call.resolve(["granted": ok]) }
  }
  @objc func querySteps(_ call: CAPPluginCall) {
    let days = call.getInt("days") ?? 7; let cal = Calendar.current
    let start = cal.date(byAdding: .day, value: -(days - 1), to: cal.startOfDay(for: Date()))!
    let q = HKStatisticsCollectionQuery(quantityType: HKQuantityType(.stepCount), quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: Date()), options: .cumulativeSum, anchorDate: start, intervalComponents: DateComponents(day: 1))
    q.initialResultsHandler = { _, res, err in
      if let err = err { call.reject(err.localizedDescription); return }
      var out: [[String: Any]] = []; let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
      res?.enumerateStatistics(from: start, to: Date()) { s, _ in out.append(["date": f.string(from: s.startDate), "steps": Int(s.sumQuantity()?.doubleValue(for: .count()) ?? 0), "source": "Apple Health"]) }
      call.resolve(["days": out])
    }
    store.execute(q)
  }
}
