// Pont JS → widget écran d'accueil. Écrit les données du jour (calories, eau) dans
// filesDir/widget_data.json, que SalorieWidget (natif) lit. Les pas, eux, viennent
// déjà des SharedPreferences écrites par StepCounterService. 100% additif.
import * as FileSystem from 'expo-file-system/legacy';

const WIDGET_FILE = (FileSystem.documentDirectory || '') + 'widget_data.json';

export async function updateWidgetData(d: {
  calories?: number; water?: number; steps?: number;
}): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(
      WIDGET_FILE,
      JSON.stringify({
        calories: Math.round(d.calories || 0),
        water: Math.round(d.water || 0),
        steps: Math.round(d.steps || 0),
        ts: Date.now(),
      }),
    );
  } catch { /* le widget gardera ses dernières valeurs */ }
}
