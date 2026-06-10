import { getFlags, FLAG_KEYS } from '../../lib/firebaseAdmin';
import FlagToggles from './FlagToggles';

export const dynamic = 'force-dynamic';

export default async function FlagsPage() {
  let flags: Record<string, boolean> = {};
  let error: string | null = null;
  try { flags = await getFlags(); } catch (e: any) { error = e?.message || String(e); }

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Feature Flags</h2>
      <p className="foot">
        Active / désactive des features de l'app (effet au prochain lancement de l'app · défaut = activé).
        Kill-switch / rollout sans redéployer l'app.
      </p>
      {error ? (
        <div className="card empty">⚠️ {error}</div>
      ) : (
        <FlagToggles flags={flags} keys={FLAG_KEYS} />
      )}
    </main>
  );
}
