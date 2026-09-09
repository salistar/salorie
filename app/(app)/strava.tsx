// Connexion Strava — le chemin utilisateur qui manquait.
//
// Le backend était prêt depuis le 31/08/2026 : état, URL d'autorisation signée,
// retour OAuth vérifié en HMAC, import, déliaison, plus des tests. Rien de tout
// cela n'était atteignable : aucun écran ne l'appelait.
//
// ⚠ LE PARCOURS, ET POURQUOI IL N'A PAS DE LIEN PROFOND.
//   1. l'app demande l'URL d'autorisation au backend (l'état y est signé)
//   2. elle l'ouvre dans le navigateur du système
//   3. Strava renvoie vers /strava/retour, qui affiche une page de confirmation
//   4. l'utilisateur ferme le navigateur ; on redemande l'état
// `openAuthSessionAsync` rend la main dès la fermeture, ce qui suffit à savoir
// QUAND redemander. Un lien profond ajouterait un schéma d'URL à déclarer, à
// tester sur deux systèmes, et une panne de plus quand il ne se déclenche pas.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Link2, Link2Off, RefreshCw, Activity, TriangleAlert } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTokens } from '../../constants/tokens';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { etatStrava, lienStrava, importerStrava, delierStrava, type EtatStrava, type SeanceImportee } from '../../lib/stravaApi';
import { useScreenGate } from '../../components/FeatureGate';

const TXT: any = {
  fr: {
    titre: 'Strava',
    sous: 'Reliez votre compte pour importer automatiquement vos séances de course, vélo et marche.',
    connecter: 'Relier mon compte Strava',
    connecte: 'Compte relié',
    delier: 'Délier le compte',
    importer: 'Importer mes séances',
    importEnCours: 'Import en cours…',
    jamais: 'Aucun import pour l’instant',
    dernier: (d: string) => `Dernier import : ${d}`,
    rien: 'Aucune nouvelle séance depuis le dernier import.',
    importees: (n: number) => `${n} séance${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}`,
    nonConfigure: 'Strava n’est pas encore configuré côté serveur. Revenez plus tard.',
    erreur: 'Impossible de joindre le serveur.',
    confirmerTitre: 'Délier Strava ?',
    confirmerTexte: 'Vos séances déjà importées restent dans Salorie. Seule la liaison est supprimée.',
    annuler: 'Annuler',
    confirmer: 'Délier',
    revenir: 'Autorisez Salorie dans la page qui s’ouvre, puis revenez ici.',
  },
  en: {
    titre: 'Strava',
    sous: 'Link your account to import your runs, rides and walks automatically.',
    connecter: 'Link my Strava account',
    connecte: 'Account linked',
    delier: 'Unlink account',
    importer: 'Import my activities',
    importEnCours: 'Importing…',
    jamais: 'No import yet',
    dernier: (d: string) => `Last import: ${d}`,
    rien: 'No new activity since the last import.',
    importees: (n: number) => `${n} activit${n > 1 ? 'ies' : 'y'} imported`,
    nonConfigure: 'Strava is not configured on the server yet. Please come back later.',
    erreur: 'Could not reach the server.',
    confirmerTitre: 'Unlink Strava?',
    confirmerTexte: 'Activities already imported stay in Salorie. Only the link is removed.',
    annuler: 'Cancel',
    confirmer: 'Unlink',
    revenir: 'Authorise Salorie in the page that opens, then come back here.',
  },
  ar: {
    titre: 'سترافا',
    sous: 'اربط حسابك لاستيراد جلسات الجري والدراجة والمشي تلقائيا.',
    connecter: 'ربط حساب سترافا',
    connecte: 'الحساب مرتبط',
    delier: 'إلغاء الربط',
    importer: 'استيراد جلساتي',
    importEnCours: 'جارٍ الاستيراد…',
    jamais: 'لا يوجد استيراد بعد',
    dernier: (d: string) => `آخر استيراد: ${d}`,
    rien: 'لا توجد جلسات جديدة منذ آخر استيراد.',
    importees: (n: number) => `تم استيراد ${n} جلسة`,
    nonConfigure: 'سترافا غير مهيأ على الخادم بعد. عد لاحقا.',
    erreur: 'تعذر الوصول إلى الخادم.',
    confirmerTitre: 'إلغاء ربط سترافا؟',
    confirmerTexte: 'الجلسات المستوردة تبقى في سالوري. يُحذف الربط فقط.',
    annuler: 'إلغاء',
    confirmer: 'إلغاء الربط',
    revenir: 'وافق على سالوري في الصفحة التي ستفتح، ثم عد إلى هنا.',
  },
};

export default function StravaScreen() {
  const __gate = useScreenGate('strava');
  const k = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[String(language)] || TXT.fr;

  const [etat, setEtat] = useState<EtatStrava | null>(null);
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState<'lien' | 'import' | 'delier' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const relire = useCallback(async () => {
    try {
      setErreur(null);
      setEtat(await etatStrava());
    } catch (e: any) {
      setErreur(e?.message || t.erreur);
    } finally {
      setChargement(false);
    }
  }, [t.erreur]);

  useEffect(() => { relire(); }, [relire]);

  const relier = useCallback(async () => {
    setOccupe('lien');
    setMessage(null);
    try {
      const { url } = await lienStrava();
      // `openAuthSessionAsync` rend la main a la fermeture du navigateur : c'est
      // ce moment-la, et pas un lien profond, qui nous dit de redemander l'etat.
      await WebBrowser.openAuthSessionAsync(url);
      await relire();
    } catch (e: any) {
      setErreur(e?.message || t.erreur);
    } finally {
      setOccupe(null);
    }
  }, [relire, t.erreur]);

  const importer = useCallback(async () => {
    setOccupe('import');
    setMessage(null);
    try {
      // On repart du dernier import : redemander tout l'historique a chaque fois
      // ferait payer a l'utilisateur — et au quota Strava — des seances deja la.
      const { seances } = await importerStrava(etat?.dernierImport);
      const n = (seances || []).length;
      setMessage(n ? t.importees(n) : t.rien);
      await relire();
    } catch (e: any) {
      setErreur(e?.message || t.erreur);
    } finally {
      setOccupe(null);
    }
  }, [etat?.dernierImport, relire, t]);

  const delier = useCallback(() => {
    Alert.alert(t.confirmerTitre, t.confirmerTexte, [
      { text: t.annuler, style: 'cancel' },
      {
        text: t.confirmer,
        style: 'destructive',
        onPress: async () => {
          setOccupe('delier');
          setMessage(null);
          try {
            await delierStrava();
            await relire();
          } catch (e: any) {
            setErreur(e?.message || t.erreur);
          } finally {
            setOccupe(null);
          }
        },
      },
    ]);
  }, [relire, t]);

  const dateLisible = (ms?: number) =>
    ms ? new Date(ms).toLocaleDateString(String(language) === 'ar' ? 'ar-MA' : String(language), {
      day: 'numeric', month: 'long', year: 'numeric',
    }) : '';

  const s = styles(k);
  const align = { textAlign: txtAlign(isRTL) };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={s.page}>
      <ScreenTopBar showBack title={t.titre} />
      <ScrollView contentContainerStyle={s.contenu}>
        <Text style={[s.sous, align]}>{t.sous}</Text>

        {chargement ? (
          <ActivityIndicator color={k.accent} style={{ marginTop: 28 }} />
        ) : erreur ? (
          <View style={[s.bandeau, { flexDirection: rowDir(isRTL), backgroundColor: k.dangerSoft, borderColor: k.danger }]}>
            <TriangleAlert size={18} color={k.danger} />
            <Text style={[s.bandeauTxt, align, { color: k.dangerInk }]}>{erreur}</Text>
          </View>
        ) : !etat?.configure ? (
          // Le serveur n'a pas ses identifiants Strava. Ce n'est pas une panne de
          // l'utilisateur, et lui proposer un bouton qui echouera serait cruel.
          <View style={[s.bandeau, { flexDirection: rowDir(isRTL), backgroundColor: k.warningSoft, borderColor: k.warning }]}>
            <TriangleAlert size={18} color={k.warning} />
            <Text style={[s.bandeauTxt, align, { color: k.warningInk }]}>{t.nonConfigure}</Text>
          </View>
        ) : (
          <>
            <View style={s.carte}>
              <View style={[s.ligne, { flexDirection: rowDir(isRTL) }]}>
                <Activity size={20} color={etat.connecte ? k.success : k.textMuted} />
                <Text style={[s.etatTxt, align, { color: etat.connecte ? k.text : k.textMuted }]}>
                  {etat.connecte ? `${t.connecte}${etat.athlete ? ` · ${etat.athlete}` : ''}` : t.sous}
                </Text>
              </View>
              {etat.connecte ? (
                <Text style={[s.detail, align]}>
                  {etat.dernierImport ? t.dernier(dateLisible(etat.dernierImport)) : t.jamais}
                </Text>
              ) : null}
            </View>

            {message ? <Text style={[s.message, align]}>{message}</Text> : null}

            {!etat.connecte ? (
              <>
                <TouchableOpacity
                  style={[s.bouton, { flexDirection: rowDir(isRTL), backgroundColor: k.accent }]}
                  onPress={relier}
                  disabled={occupe !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t.connecter}
                >
                  {occupe === 'lien'
                    ? <ActivityIndicator color={k.onAccent} />
                    : <Link2 size={18} color={k.onAccent} />}
                  <Text style={[s.boutonTxt, { color: k.onAccent }]}>{t.connecter}</Text>
                </TouchableOpacity>
                <Text style={[s.aide, align]}>{t.revenir}</Text>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[s.bouton, { flexDirection: rowDir(isRTL), backgroundColor: k.accent }]}
                  onPress={importer}
                  disabled={occupe !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t.importer}
                >
                  {occupe === 'import'
                    ? <ActivityIndicator color={k.onAccent} />
                    : <RefreshCw size={18} color={k.onAccent} />}
                  <Text style={[s.boutonTxt, { color: k.onAccent }]}>
                    {occupe === 'import' ? t.importEnCours : t.importer}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.boutonPlat, { flexDirection: rowDir(isRTL) }]}
                  onPress={delier}
                  disabled={occupe !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t.delier}
                >
                  <Link2Off size={17} color={k.danger} />
                  <Text style={[s.boutonPlatTxt, { color: k.danger }]}>{t.delier}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (k: any) => StyleSheet.create({
  page: { flex: 1, backgroundColor: k.bg },
  contenu: { padding: 20, paddingBottom: 48, gap: 14 },
  sous: { fontSize: 15, lineHeight: 21, color: k.textMuted },
  carte: {
    backgroundColor: k.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: k.border, gap: 8,
  },
  ligne: { alignItems: 'center', gap: 10 },
  etatTxt: { flex: 1, fontSize: 15, fontWeight: '600' },
  detail: { fontSize: 13, color: k.textMuted },
  bandeau: {
    alignItems: 'center', gap: 10, padding: 14,
    borderRadius: 14, borderWidth: 1,
  },
  bandeauTxt: { flex: 1, fontSize: 14, lineHeight: 20 },
  message: { fontSize: 14, color: k.successInk },
  bouton: {
    alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 15, borderRadius: 14,
  },
  boutonTxt: { fontSize: 15, fontWeight: '700' },
  boutonPlat: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  boutonPlatTxt: { fontSize: 14, fontWeight: '600' },
  aide: { fontSize: 13, color: k.textFaint, lineHeight: 19 },
});
