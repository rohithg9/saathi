package com.exoralabs.saathi.wear

import android.app.*
import android.content.*
import androidx.core.app.NotificationCompat
import java.util.Calendar

/** Exact alarms for today's reminders: a vibrating notification at each time. */
object ReminderAlarms {
  fun schedule(ctx: Context, list: List<Reminder>) {
    val am = ctx.getSystemService(AlarmManager::class.java)
    list.forEachIndexed { i, r ->
      val (h, m) = r.time.split(":").map { it.toInt() }
      val at = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m); set(Calendar.SECOND, 0) }
      if (at.timeInMillis < System.currentTimeMillis()) return@forEachIndexed
      val pi = PendingIntent.getBroadcast(ctx, i, Intent(ctx, Receiver::class.java).putExtra("title", r.title), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.timeInMillis, pi)
    }
  }
  class Receiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
      val nm = ctx.getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel("saathi", "Saathi reminders", NotificationManager.IMPORTANCE_HIGH))
      nm.notify(intent.getStringExtra("title").hashCode(), NotificationCompat.Builder(ctx, "saathi").setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle("Saathi").setContentText(intent.getStringExtra("title")).setVibrate(longArrayOf(0, 300, 200, 300)).build())
    }
  }
}
