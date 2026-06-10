package com.idriss.kriouile.salorie

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Calendar

/**
 * Foreground service that counts steps from the device hardware step-counter
 * sensor (TYPE_STEP_COUNTER). The sensor accumulates in hardware even while the
 * app is closed, so this service keeps an accurate daily total and a persistent
 * notification that increments live — app open OR closed.
 *
 * It writes today's count to filesDir/native_steps.json so the JS/Home layer can
 * read it, and reads filesDir/activity_steps.json (written by JS) to add steps
 * earned from runs / challenges into the notification total.
 */
class StepCounterService : Service(), SensorEventListener {
  private var sensorManager: SensorManager? = null
  private var stepSensor: Sensor? = null
  private var lastNotif = 0L
  private val handler = Handler(Looper.getMainLooper())
  private val ticker = object : Runnable {
    override fun run() {
      repost()
      handler.postDelayed(this, 30000) // refresh notification ~every 30s (incl. activity steps & day rollover)
    }
  }

  private fun repost() {
    try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(NOTIF_ID, buildNotification(currentTotal()))
    } catch (_: Exception) {}
  }

  companion object {
    const val CHANNEL = "steps"
    const val NOTIF_ID = 4242
    const val GOAL = 10000
    const val PREFS = "salorie_steps"
  }

  override fun onCreate() {
    super.onCreate()
    createChannel()
    val notif = buildNotification(currentTotal())
    // Android 14+ : un foreground service de type "health" exige que la permission
    // runtime ACTIVITY_RECOGNITION soit ACCORDEE, sinon startForeground lance
    // ForegroundServiceStartNotAllowedException / SecurityException et CRASHE l'app
    // (cas typique : install fraiche, permission pas encore demandee). On stoppe
    // proprement au lieu de crasher — le service sera relance une fois la permission
    // accordee (au prochain lancement / depuis le JS).
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
      } else {
        startForeground(NOTIF_ID, notif)
      }
    } catch (e: Exception) {
      stopSelf()
      return
    }
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    stepSensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST) }
    handler.postDelayed(ticker, 30000)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    repost() // refresh immediately (e.g. after JS updated activity_steps.json)
    return START_STICKY
  }

  /**
   * Quand l'utilisateur SWIPE l'app depuis les récents, certains OEM (Samsung) tuent
   * le service + sa notification. On programme une relance ~1s plus tard via AlarmManager
   * pour que le compteur de pas + la notification PERSISTENT app fermée.
   */
  override fun onTaskRemoved(rootIntent: Intent?) {
    try {
      val restart = Intent(applicationContext, StepCounterService::class.java)
      val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      val pi = PendingIntent.getService(this, 1, restart, flags)
      val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
      am.set(AlarmManager.RTC, System.currentTimeMillis() + 1000, pi)
    } catch (_: Exception) {}
    super.onTaskRemoved(rootIntent)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    sensorManager?.unregisterListener(this)
    handler.removeCallbacks(ticker)
    super.onDestroy()
  }

  override fun onSensorChanged(event: SensorEvent?) {
    if (event == null || event.sensor.type != Sensor.TYPE_STEP_COUNTER) return
    val total = event.values[0].toLong() // cumulative steps since last boot
    val p = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val today = todayKey()
    val savedDay = p.getString("day", null)
    var baseline = p.getLong("baseline", -1L)
    // New day, first run, or device rebooted (counter reset) → re-baseline.
    if (savedDay != today || baseline < 0 || total < baseline) {
      // Changement de jour réel → on archive le total de la veille pour que le JS
      // le logge (historique Home + base de données).
      if (savedDay != null && savedDay != today) {
        appendDayHistory(savedDay, p.getInt("steps", 0))
      }
      baseline = total
      p.edit().putString("day", today).putLong("baseline", baseline).apply()
    }
    val steps = (total - baseline).coerceAtLeast(0).toInt()
    p.edit().putInt("steps", steps).apply()
    writeNativeSteps(today, steps)
    val now = System.currentTimeMillis()
    if (now - lastNotif > 300) {
      lastNotif = now
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(NOTIF_ID, buildNotification(steps + activitySteps()))
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  private fun todayKey(): String {
    val c = Calendar.getInstance()
    return String.format("%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
  }

  private fun currentDeviceSteps(): Int {
    val p = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return if (p.getString("day", null) == todayKey()) p.getInt("steps", 0) else 0
  }

  private fun currentTotal(): Int = currentDeviceSteps() + activitySteps()

  private fun activitySteps(): Int {
    return try {
      val f = File(filesDir, "activity_steps.json")
      if (!f.exists()) 0 else {
        val o = JSONObject(f.readText())
        if (o.optString("date") == todayKey()) o.optInt("steps", 0) else 0
      }
    } catch (_: Exception) { 0 }
  }

  private fun writeNativeSteps(day: String, steps: Int) {
    try {
      File(filesDir, "native_steps.json").writeText(
        JSONObject().put("date", day).put("steps", steps).toString()
      )
    } catch (_: Exception) {}
  }

  /** Archive le total d'un jour terminé dans step_history.json (le JS le logge en DB). */
  private fun appendDayHistory(day: String, steps: Int) {
    if (steps <= 0) return
    try {
      val f = File(filesDir, "step_history.json")
      val arr = if (f.exists()) JSONArray(f.readText()) else JSONArray()
      for (i in 0 until arr.length()) {
        if (arr.getJSONObject(i).optString("date") == day) return // déjà archivé
      }
      arr.put(JSONObject().put("date", day).put("steps", steps).put("ts", System.currentTimeMillis()))
      f.writeText(arr.toString())
    } catch (_: Exception) {}
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel(CHANNEL, "Pas", NotificationManager.IMPORTANCE_LOW)
      ch.setShowBadge(false)
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
    }
  }

  private fun smallIcon(): Int {
    val byName = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (byName != 0) byName else applicationInfo.icon
  }

  private fun buildNotification(steps: Int): Notification {
    val pct = (steps * 100 / GOAL).coerceAtMost(100)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    val pi = PendingIntent.getActivity(this, 0, launch, flags)
    return NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(smallIcon())
      .setContentTitle("👟 $steps pas aujourd'hui")
      .setContentText("$pct% de ton objectif · $GOAL pas")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setColor(0xFF298F50.toInt())
      .setContentIntent(pi)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }
}
