package com.idriss.kriouile.salorie

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
import org.json.JSONObject
import java.io.File
import java.util.Calendar

class StepCounterService : Service(), SensorEventListener {
  private var sensorManager: SensorManager? = null
  private var stepSensor: Sensor? = null
  private var lastNotif = 0L
  private val handler = Handler(Looper.getMainLooper())
  private val ticker = object : Runnable {
    override fun run() { repost(); handler.postDelayed(this, 30000) }
  }
  private fun repost() {
    try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(NOTIF_ID, buildNotification(currentTotal()))
    } catch (_: Exception) {}
  }

  companion object {
    const val CHANNEL = "steps"; const val NOTIF_ID = 4242; const val GOAL = 10000; const val PREFS = "salorie_steps"
  }

  /**
   * A partir d'Android 10, demarrer un service de premier plan de type "health"
   * exige ACTIVITY_RECOGNITION : sans elle, startForeground() leve SecurityException
   * DANS onCreate et tue le processus entier.
   *
   * MainActivity verifie deja avant de demarrer, mais elle n'est pas le seul chemin :
   * le redemarrage du telephone (StepBootReceiver), la relance automatique du service
   * apres un kill memoire (START_STICKY) et la revocation par Android d'une permission
   * inutilisee depuis plusieurs mois arrivent tous sans qu'aucune Activity ne tourne.
   * Constate sur appareil le 3 aout 2026 : chaque relance replantait, et le systeme
   * relancait a l'infini — boucle de crash visible dans les statistiques Play.
   */
  private fun canCountSteps(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return checkSelfPermission(android.Manifest.permission.ACTIVITY_RECOGNITION) ==
      android.content.pm.PackageManager.PERMISSION_GRANTED
  }

  private var running = false

  override fun onCreate() {
    super.onCreate()
    if (!canCountSteps()) { stopSelf(); return }
    createChannel()
    val notif = buildNotification(currentTotal())
    try {
      if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
      else startForeground(NOTIF_ID, notif)
    } catch (_: Exception) {
      // La liste exacte des permissions exigees pour le type "health" varie selon les
      // versions d'Android. Aucune evolution future ne doit pouvoir tuer l'application :
      // au pire on renonce au comptage des pas.
      stopSelf(); return
    }
    running = true
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    stepSensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    handler.postDelayed(ticker, 30000)
  }

  // START_NOT_STICKY quand le service n'a pas pu demarrer : sans cela le systeme le
  // relance en boucle alors que la permission manque toujours.
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!running) { stopSelf(); return START_NOT_STICKY }
    repost(); return START_STICKY
  }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onDestroy() { sensorManager?.unregisterListener(this); handler.removeCallbacks(ticker); super.onDestroy() }

  override fun onSensorChanged(event: SensorEvent?) {
    if (event == null || event.sensor.type != Sensor.TYPE_STEP_COUNTER) return
    val total = event.values[0].toLong()
    val p = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val today = todayKey()
    val savedDay = p.getString("day", null)
    var baseline = p.getLong("baseline", -1L)
    if (savedDay != today || baseline < 0 || total < baseline) {
      baseline = total; p.edit().putString("day", today).putLong("baseline", baseline).apply()
    }
    val steps = (total - baseline).coerceAtLeast(0).toInt()
    p.edit().putInt("steps", steps).apply()
    writeNativeSteps(today, steps)
    val now = System.currentTimeMillis()
    if (now - lastNotif > 1500) {
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
      if (!f.exists()) 0 else { val o = JSONObject(f.readText()); if (o.optString("date") == todayKey()) o.optInt("steps", 0) else 0 }
    } catch (_: Exception) { 0 }
  }
  private fun writeNativeSteps(day: String, steps: Int) {
    try { File(filesDir, "native_steps.json").writeText(JSONObject().put("date", day).put("steps", steps).toString()) } catch (_: Exception) {}
  }
  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel(CHANNEL, "Pas", NotificationManager.IMPORTANCE_LOW); ch.setShowBadge(false)
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
      .setOngoing(true).setOnlyAlertOnce(true).setColor(0xFF298F50.toInt())
      .setContentIntent(pi).setPriority(NotificationCompat.PRIORITY_LOW).build()
  }
}
