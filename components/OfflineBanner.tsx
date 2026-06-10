// Indicateur hors-ligne — bannière additive (rend null quand en ligne).
// Poll léger de l'état réseau (expo-network). 100% additif : ne touche à aucune
// donnée, ne peut rien casser. L'app continue de lire depuis son cache local.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import * as Network from 'expo-network';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const s = await Network.getNetworkStateAsync();
        if (alive) setOffline(s?.isConnected === false || s?.isInternetReachable === false);
      } catch { /* en cas d'erreur on n'affiche rien */ }
    };
    check();
    const id = setInterval(check, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!offline) return null;
  return (
    <View style={styles.bar}>
      <WifiOff size={15} color="#fff" />
      <Text style={styles.txt}>Hors-ligne — affichage depuis le cache local</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#B45309', paddingVertical: 8, paddingHorizontal: 12 },
  txt: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
});
