package com.idriss.kriouile.salorie

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/**
 * Widget écran d'accueil "Salorie" — affiche les pas du jour (lus dans les
 * SharedPreferences "salorie_steps" déjà écrites par StepCounterService) et
 * ouvre l'app au tap. 100% additif (aucune dépendance RN, aucun prebuild).
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

            val views = RemoteViews(context.packageName, R.layout.salorie_widget)
            views.setTextViewText(R.id.widget_steps, steps.toString())

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
    }
}
