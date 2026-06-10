// Indicateur hors-ligne + synchro auto. Bannière additive (null quand en ligne &
// rien en attente). Au retour réseau, rejoue les logs mis en file (offline-first).
// 100% additif : ne touche à aucune donnée existante.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WifiOff, RefreshCw } from 'lucide-react-native';
import * as Network from 'expo-network';
import { auth } from '../lib/firebaseAuth';
import { flushPendingLogs, pendingLogsCount } from '../lib/firebase';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const wasOffline = useRef(false);

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
          // Retour en ligne après une coupure → on synchronise la file.
          if (wasOffline.current && !off) {
            setSyncing(true);
            try { await flushPendingLogs(email); } catch {}
            setSyncing(false);
          }
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
      {syncing ? <RefreshCw size={15} color="#fff" /> : <WifiOff size={15} color="#fff" />}
      <Text style={styles.txt}>
        {syncing
          ? 'Retour en ligne — synchronisation…'
          : `Hors-ligne — cache local${pending ? ` · ${pending} en attente de sync` : ''}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#B45309', paddingVertical: 8, paddingHorizontal: 12 },
  sync: { backgroundColor: '#2E8B57' },
  txt: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
});
