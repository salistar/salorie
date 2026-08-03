// Expo config plugin: installs a native foreground service that counts steps
// from the device step-counter sensor (works even when the app is closed) and
// shows a persistent notification. Writes the Kotlin sources, declares the
// service + boot receiver in the manifest, and starts the service from
// MainActivity.onCreate. Keeps everything reproducible across `expo prebuild`.
const { withAndroidManifest, withMainActivity, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SERVICE_KT = (pkg) => `package ${pkg}

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
`;

const RECEIVER_KT = (pkg) => `package ${pkg}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class StepBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
    // Au redemarrage du telephone aucune Activity ne tourne : c'est ici, et nulle part
    // ailleurs, qu'il faut verifier. Un utilisateur ayant refuse le suivi d'activite
    // voyait sinon l'application planter a chaque demarrage de son telephone.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
        context.checkSelfPermission(android.Manifest.permission.ACTIVITY_RECOGNITION) !=
          android.content.pm.PackageManager.PERMISSION_GRANTED) return
    val svc = Intent(context, StepCounterService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(svc) else context.startService(svc)
  }
}
`;

// Demarrage du service, GARDE par ACTIVITY_RECOGNITION.
//
// Ce garde n'est pas cosmetique : sur Android 14+, un foreground service de type
// "health" demarre sans cette permission fait echouer `startForeground()` DANS le
// service — hors de portee du try/catch de l'activite — et le processus tombe.
//
// Le rappel dans onResume sert a un cas precis : l'utilisateur accorde la permission
// via le prompt JS, la boite de dialogue se ferme, onResume se declenche, le service
// demarre. Sans lui il faudrait relancer l'application.
//
// Ce code existait a la main dans android/app/.../MainActivity.kt sans que le plugin
// sache le reproduire. `prebuild --clean` (donc la CI, donc l'AAB publie) regenerait
// un demarrage inconditionnel : compilation impeccable, plantage a l'execution.
// Tout ce qui doit survivre a un prebuild doit vivre ICI, jamais dans android/.
//
// Les types sont pleinement qualifies pour n'avoir aucun import a injecter.
const HELPER = `
  private fun maybeStartStepService() {
    try {
      val needsPerm = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q
      val granted = !needsPerm || checkSelfPermission(android.Manifest.permission.ACTIVITY_RECOGNITION) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
      if (granted) {
        val svc = Intent(this, StepCounterService::class.java)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) startForegroundService(svc) else startService(svc)
      }
    } catch (_: Exception) {}
  }

  override fun onResume() {
    super.onResume()
    maybeStartStepService()
  }
`;

module.exports = function withStepCounterService(config) {
  // 1) Kotlin sources
  config = withDangerousMod(config, ['android', (cfg) => {
    const pkg = cfg.android && cfg.android.package ? cfg.android.package : 'com.idriss.kriouile.salorie';
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', ...pkg.split('.'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'StepCounterService.kt'), SERVICE_KT(pkg));
    fs.writeFileSync(path.join(dir, 'StepBootReceiver.kt'), RECEIVER_KT(pkg));
    return cfg;
  }]);

  // 2) Manifest: <service> + <receiver>
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.service = app.service || [];
    if (!app.service.some((s) => s['$'] && s['$']['android:name'] === '.StepCounterService')) {
      app.service.push({ '$': { 'android:name': '.StepCounterService', 'android:exported': 'false', 'android:foregroundServiceType': 'health' } });
    }
    app.receiver = app.receiver || [];
    if (!app.receiver.some((r) => r['$'] && r['$']['android:name'] === '.StepBootReceiver')) {
      app.receiver.push({
        '$': { 'android:name': '.StepBootReceiver', 'android:exported': 'true' },
        'intent-filter': [{ action: [{ '$': { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }] }],
      });
    }
    return cfg;
  });

  // 3) MainActivity: start the service in onCreate
  config = withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('import android.content.Intent')) {
      src = src.replace(/(^package .*$)/m, `$1\nimport android.content.Intent`);
    }
    if (!src.includes('maybeStartStepService')) {
      // Voir la note dans withHealthConnectPermissionDelegate.js : pas de `\s*` avant la
      // fin du groupe, sinon la capture avale le saut de ligne et cet appel se retrouve
      // colle a celui de l'autre plugin sur une seule ligne (Kotlin refuse).
      src = src.replace(/(super\.onCreate\([^)]*\);?)/, `$1\n    maybeStartStepService()`);
      // Le helper est insere avant getMainComponentName(), presente dans le gabarit
      // MainActivity de tout projet Expo.
      src = src.replace(/(\n\s*override fun getMainComponentName)/, `\n${HELPER}$1`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });

  return config;
};
