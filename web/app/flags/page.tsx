import { getFlagsRich, FLAG_KEYS } from '../../lib/firebaseAdmin';
import FlagToggles from './FlagToggles';

export const dynamic = 'force-dynamic';

export default async function FlagsPage() {
  let raw: Record<string, any> = {};
  let error: string | null = null;
  try { raw = await getFlagsRich(); } catch (e: any) { error = e?.message || String(e); }

  // Regroupe les flags par catégorie (champ `cat` de FLAG_KEYS), en préservant l'ordre.
  const groups: { cat: string; keys: typeof FLAG_KEYS }[] = [];
  const idx: Record<string, number> = {};
  for (const k of FLAG_KEYS) {
    const cat = k.cat || 'Autres';
    if (idx[cat] === undefined) { idx[cat] = groups.length; groups.push({ cat, keys: [] }); }
    groups[idx[cat]].keys.push(k);
  }

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Feature Flags</h2>
      <p className="foot">
        Active / désactive des features de l'app (effet au prochain lancement de l'app · défaut = activé).
        Par flag : kill-switch, exigence Premium, % de rollout et version minimale — sans redéployer l'app.
      </p>
      {error ? (
        <div className="card empty">⚠️ {error}</div>
      ) : (
        groups.map((g) => (
          <section key={g.cat} style={{ marginTop: 24 }}>
            <h3 style={{ margin: '0 0 10px', color: '#2E8B57', fontSize: 15 }}>{g.cat}</h3>
            <FlagToggles flags={raw} keys={g.keys} />
          </section>
        ))
      )}
    </main>
  );
}
