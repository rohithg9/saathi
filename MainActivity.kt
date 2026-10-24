// Saathi for Wear OS (Wear OS 4+, Jetpack Compose for Wear). Module `wear` alongside android/app.
// Receives today's reminders from the phone over the Wearable Data Layer (path /saathi/today),
// shows them as a list, schedules alarms and sends "done" back to the phone.
package com.exoralabs.saathi.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.*
import com.google.android.gms.wearable.*
import org.json.JSONObject

data class Reminder(val time: String, val title: String, val kind: String)

class MainActivity : ComponentActivity(), DataClient.OnDataChangedListener {
  private val reminders = mutableStateListOf<Reminder>()
  private val done = mutableStateListOf<String>()
  private var name by mutableStateOf("")

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      MaterialTheme {
        ScalingLazyColumn {
          item { ListHeader { Text(if (name.isEmpty()) "Saathi" else "Saathi · $name") } }
          items(reminders) { r ->
            Chip(onClick = { markDone(r) }, label = { Text(r.title, maxLines = 2) }, secondaryLabel = { Text(if (done.contains(r.time + r.title)) "Done ✓" else r.time) })
          }
          if (reminders.isEmpty()) item { Text("Open Saathi on your phone to sync") }
        }
      }
    }
  }
  override fun onResume() { super.onResume(); Wearable.getDataClient(this).addListener(this) }
  override fun onPause() { super.onPause(); Wearable.getDataClient(this).removeListener(this) }

  override fun onDataChanged(events: DataEventBuffer) {
    for (e in events) if (e.type == DataEvent.TYPE_CHANGED && e.dataItem.uri.path == "/saathi/today") {
      val json = JSONObject(DataMapItem.fromDataItem(e.dataItem).dataMap.getString("payload") ?: continue)
      name = json.optString("name"); reminders.clear()
      val arr = json.getJSONArray("reminders")
      for (i in 0 until arr.length()) arr.getJSONObject(i).let { reminders.add(Reminder(it.getString("time"), it.getString("title"), it.getString("kind"))) }
      ReminderAlarms.schedule(this, reminders)
    }
  }
  private fun markDone(r: Reminder) {
    done.add(r.time + r.title)
    Wearable.getNodeClient(this).connectedNodes.addOnSuccessListener { nodes ->
      nodes.forEach { Wearable.getMessageClient(this).sendMessage(it.id, "/saathi/done", "${r.time}|${r.title}".toByteArray()) }
    }
  }
}
