// Météo live d'un lieu (waypoint d'une course) via Open-Meteo — GRATUIT, SANS CLÉ.
// Sert au badge météo + à l'indicateur Headwind/Tailwind sur l'écran challenge.
// Cache mémoire 30 min par coordonnées (arrondies à ~1 km) pour éviter le spam réseau.

export interface Weather {
  tempC: number;   // température à 2 m (°C)
  code: number;    // WMO weather code brut
  wind: number;    // vitesse du vent à 10 m (km/h)
  label: string;   // emoji + libellé court (ex. "☀️ Clear")
}

const TTL_MS = 30 * 60 * 1000; // 30 min
const cache = new Map<string, { at: number; data: Weather | null }>();

// WMO weather code -> emoji + libellé simple (anglais court, neutre).
function codeToLabel(code: number): string {
  if (code === 0) return '☀️ Clear';
  if (code === 1 || code === 2) return '🌤️ Partly cloudy';
  if (code === 3) return '☁️ Cloudy';
  if (code === 45 || code === 48) return '🌫️ Fog';
  if (code >= 51 && code <= 57) return '🌦️ Drizzle';
  if (code >= 61 && code <= 67) return '🌧️ Rain';
  if (code >= 71 && code <= 77) return '🌨️ Snow';
  if (code >= 80 && code <= 82) return '🌧️ Showers';
  if (code === 85 || code === 86) return '🌨️ Snow showers';
  if (code === 95) return '⛈️ Thunderstorm';
  if (code === 96 || code === 99) return '⛈️ Thunderstorm';
  return '🌡️';
}

export async function getWeather(lat: number, lng: number): Promise<Weather | null> {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;

  // Clé arrondie à 2 décimales (~1 km) — assez fin pour un waypoint, partage le cache.
  const key = `${la.toFixed(2)},${ln.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}` +
      `&current=temperature_2m,weather_code,wind_speed_10m`;
    const res = await fetch(url);
    const j = await res.json();
    const cur = j?.current;
    if (!cur || cur.temperature_2m == null) {
      cache.set(key, { at: Date.now(), data: null });
      return null;
    }
    const code = Number(cur.weather_code) || 0;
    const data: Weather = {
      tempC: Math.round(Number(cur.temperature_2m)),
      code,
      wind: Math.round(Number(cur.wind_speed_10m) || 0),
      label: codeToLabel(code),
    };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}
