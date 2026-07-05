package com.idriss.kriouile.salorie

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import org.json.JSONObject
import java.io.File

/**
 * Widget écran d'accueil "Salorie" multi-infos : pas (SharedPreferences salorie_steps,
 * écrits par StepCounterService) + calories & eau (filesDir/widget_data.json, écrit par
 * le JS). Tap → ouvre l'app. 100% additif, aucun prebuild.
 */
class SalorieWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    companion object {
        fun updateWidget(context: Context, mgr: AppWidgetManager, id: Int) {
            val steps = try {
                context.getSharedPreferences("salorie_steps", Context.MODE_PRIVATE).getInt("steps", 0)
            } catch (e: Exception) { 0 }

            var cal = 0
            var water = 0
            try {
                val f = File(context.filesDir, "widget_data.json")
                if (f.exists()) {
                    val o = JSONObject(f.readText())
                    cal = o.optInt("calories", 0)
                    water = o.optInt("water", 0)
                }
            } catch (e: Exception) { /* no-op */ }

            val views = RemoteViews(context.packageName, R.layout.salorie_widget)
            views.setTextViewText(R.id.widget_steps, steps.toString())
            views.setTextViewText(R.id.widget_cal, cal.toString())
            views.setTextViewText(R.id.widget_water, water.toString())

            try {
                val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
                if (launch != null) {
                    val pi = PendingIntent.getActivity(
                        context, 0, launch,
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                    )
                    views.setOnClickPendingIntent(R.id.widget_root, pi)
                }
            } catch (e: Exception) { /* no-op */ }

            mgr.updateAppWidget(id, views)
        }

        /** Met à jour tous les widgets posés (appelé par StepCounterService). */
        fun updateAll(context: Context) {
            try {
                val mgr = AppWidgetManager.getInstance(context)
                val ids = mgr.getAppWidgetIds(ComponentName(context, SalorieWidget::class.java))
                for (id in ids) updateWidget(context, mgr, id)
            } catch (e: Exception) { /* no-op */ }
        }
    }
}
