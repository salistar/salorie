package com.idriss.kriouile.salorie

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
