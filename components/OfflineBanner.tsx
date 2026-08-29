// Indicateur hors-ligne + synchro auto. Bannière additive (null quand en ligne &
// rien en attente). Au retour réseau, rejoue les logs mis en file (offline-first).
// 100% additif : ne touche à aucune donnée existante.
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WifiOff, RefreshCw } from 'lucide-react-native';
import * as Network from 'expo-network';
import { auth } from '../lib/firebaseAuth';
import { flushPendingLogs, pendingLogsCount } from '../lib/firebase';
import { flushPendingRaceProgress } from '../lib/racesApi';

import { useTokens, type Tokens } from '../constants/tokens';
export default function OfflineBanner() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const wasOffline = useRef(false);
  const didStartupFlush = useRef(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const s = await Network.getNetworkStateAsync();
        const off = s?.isConnected === false;
        if (!alive) return;
        setOffline(off);
        const email = auth.currentUser?.email || (auth.currentUser as any)?.uid || '';
        if (email) {
          // Retour en ligne après une coupure OU démarrage avec file non vide
          // (app tuée hors-ligne puis relancée en ligne) → on synchronise.
          const startupFlush = !didStartupFlush.current && !off && (await pendingLogsCount(email)) > 0;
          if ((wasOffline.current && !off) || startupFlush) {
            setSyncing(true);
            try { await flushPendingLogs(email); } catch {}
            try { await flushPendingRaceProgress(); } catch {}
            setSyncing(false);
          }
          didStartupFlush.current = true;
          if (alive) setPending(await pendingLogsCount(email));
        }
        wasOffline.current = off;
      } catch { /* en cas d'erreur : on n'affiche rien */ }
    };
    check();
    const id = setInterval(check, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!offline && (pending === 0 || !syncing)) return null;

  return (
    <View style={[styles.bar, syncing && styles.sync]}>
      {syncing ? <RefreshCw size={15} color={k.onAccent} /> : <WifiOff size={15} color={k.onAccent} />}
      <Text style={styles.txt}>
        {syncing
          ? 'Retour en ligne — synchronisation…'
          : `Hors-ligne — cache local${pending ? ` · ${pending} en attente de sync` : ''}`}
      </Text>
    </View>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: k.warning, paddingVertical: 8, paddingHorizontal: 12 },
  sync: { backgroundColor: k.accent },
  txt: { color: k.onAccent, fontSize: 12.5, fontWeight: '600' },
});
