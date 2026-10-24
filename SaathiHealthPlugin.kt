// Capacitor plugins for the Android app (copy into android/app/src/main/java/com/exoralabs/saathi/ after
// `npx cap add android`; register in MainActivity: registerPlugin(SaathiHealthPlugin::class.java) etc.).
// Health Connect: androidx.health.connect:connect-client. Watch: play-services-wearable Data Layer.
package com.exoralabs.saathi

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.*
import java.time.*

@CapacitorPlugin(name = "SaathiHealth")
class SaathiHealthPlugin : Plugin() {
  private val scope = CoroutineScope(Dispatchers.IO)
  @PluginMethod fun requestAuthorization(call: PluginCall) {
    // Permission UI is launched via the Health Connect contract from MainActivity (see docs/WATCH.md).
    scope.launch { val granted = HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions(); call.resolve(JSObject().put("granted", granted.contains(HealthPermission.getReadPermission(StepsRecord::class)))) }
  }
  @PluginMethod fun querySteps(call: PluginCall) {
    val days = call.getInt("days") ?: 7
    scope.launch {
      try {
        val start = LocalDate.now().minusDays((days - 1).toLong()).atStartOfDay()
        val res = HealthConnectClient.getOrCreate(context).aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(start, LocalDateTime.now()), Period.ofDays(1)))
        val arr = JSArray(); res.forEach { arr.put(JSObject().put("date", it.startTime.toLocalDate().toString()).put("steps", it.result[StepsRecord.COUNT_TOTAL] ?: 0).put("source", "Health Connect")) }
        call.resolve(JSObject().put("days", arr))
      } catch (e: Exception) { call.reject(e.message) }
    }
  }
}

@CapacitorPlugin(name = "SaathiWatch")
class SaathiWatchPlugin : Plugin() {
  @PluginMethod fun send(call: PluginCall) {
    val req = PutDataMapRequest.create("/saathi/today").apply { dataMap.putString("payload", call.getString("payload") ?: "{}"); dataMap.putLong("t", System.currentTimeMillis()) }
    Wearable.getDataClient(context).putDataItem(req.asPutDataRequest().setUrgent()).addOnSuccessListener { call.resolve() }.addOnFailureListener { call.reject(it.message) }
  }
}
