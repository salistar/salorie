import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTokens } from '../constants/tokens';
import { useTranslation } from '../lib/i18n';

/**
 * Où chacun se trouve pendant une marche à deux.
 *
 * ## Pourquoi une carte pendant l'appel
 *
 * Deux personnes qui marchent ensemble à distance n'ont que deux compteurs de
 * kilomètres pour se sentir ensemble. Un compteur ne dit pas grand-chose ; voir
 * l'autre point avancer, si. C'est ce qui transforme deux marches solitaires en
 * une marche partagée.
 *
 * ## Google Maps dans une WebView, et pas react-native-maps
 *
 * Même approche que `race-live.tsx` et `run.tsx` : la clé Maps JS fonctionne dans
 * une WebView avec une `baseUrl`, alors que `react-native-maps` exigerait une clé
 * Maps SDK for Android distincte — et un module natif de plus.
 *
 * ## Ce qu'on n'affiche PAS
 *
 * Aucune adresse, aucun nom de rue, aucune coordonnée en clair. Deux pastilles et
 * la distance qui les sépare. Voir que l'autre avance suffit ; savoir où il habite
 * n'est pas le sujet, et une marche part très souvent du domicile.
 */

const TXT: Record<string, Record<string, string>> = {
  fr: { moi: 'Toi', autre: 'Ton binôme', attente: 'Position de ton binôme en attente…', ecart: 'Vous êtes à' },
  en: { moi: 'You', autre: 'Partner', attente: 'Waiting for your partner’s position…', ecart: 'You are' },
  ar: { moi: 'أنت', autre: 'شريكك', attente: 'في انتظار موقع شريكك…', ecart: 'تفصل بينكما' },
};

export type Point = { lat: number; lng: number };

/** Distance en mètres entre deux points (Haversine). */
function metres(a: Point, b: Point): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** « 340 m » ou « 12,4 km » — jamais « 12400 m », que personne ne lit. */
function ecart(m: number, langue: string): string {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = (m / 1000).toFixed(1).replace('.', langue === 'fr' ? ',' : '.');
  return `${km} km`;
}

export default function CarteDuo({ moi, autre }: { moi: Point | null; autre: Point | null }) {
  const tok = useTokens();
  const { language } = useTranslation() as any;
  const t = TXT[language] || TXT.fr;

  const html = useMemo(() => {
    if (!moi) return '';
    // Même source que `race-live.tsx` et `run.tsx` : la variable d'environnement,
    // jamais une clé en dur. Elle est publique par nature (une clé Maps JS
    // s'expose forcément au navigateur) mais reste restreinte côté console Google.
    const cle = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '';
    const b = autre ? `{lat:${autre.lat},lng:${autre.lng}}` : 'null';
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,#c{height:100%;margin:0}</style></head><body><div id="c"></div>
<script>
function init(){
  var moi={lat:${moi.lat},lng:${moi.lng}}, autre=${b};
  var m=new google.maps.Map(document.getElementById('c'),{
    center:moi, zoom:14, disableDefaultUI:true, gestureHandling:'greedy'});
  // Deux pastilles, pas des epingles d'adresse : on montre une presence, pas un lieu.
  new google.maps.Marker({position:moi,map:m,icon:{path:google.maps.SymbolPath.CIRCLE,
    scale:8,fillColor:'#2e8b57',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});
  if(autre){
    new google.maps.Marker({position:autre,map:m,icon:{path:google.maps.SymbolPath.CIRCLE,
      scale:8,fillColor:'#0ea5e9',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});
    // Cadrer sur les DEUX : centrer sur soi laisserait l'autre hors de l'ecran
    // des qu'il s'eloigne un peu, et la carte perdrait tout son interet.
    var b2=new google.maps.LatLngBounds(); b2.extend(moi); b2.extend(autre);
    m.fitBounds(b2,60);
  }
}
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${cle}&callback=init"></script>
</body></html>`;
  }, [moi?.lat, moi?.lng, autre?.lat, autre?.lng]);

  if (!moi) return null;

  const d = autre ? metres(moi, autre) : null;

  return (
    <View style={styles.cadre}>
      <WebView
        source={{ html, baseUrl: 'https://salorie.com' }}
        style={styles.carte}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        // Rien d'autre que Google Maps ne doit s'ouvrir ici.
        onShouldStartLoadWithRequest={(r) =>
          r.url === 'about:blank' || /(^|\.)google(apis)?\.com/.test(String(r.url).replace(/^https?:\/\//, '').split('/')[0])
        }
      />
      <View style={[styles.bandeau, { backgroundColor: tok.scrim }]}>
        <Text style={styles.bandeauTxt} numberOfLines={1}>
          {d != null ? `${t.ecart} ${ecart(d, language)}` : t.attente}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { marginTop: 12, borderRadius: 16, overflow: 'hidden', height: 220 },
  carte: { flex: 1, backgroundColor: '#e8eef0' },
  bandeau: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 7, paddingHorizontal: 12 },
  bandeauTxt: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
