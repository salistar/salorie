// Panier du souk — combien je peux manger avec l'argent que j'ai.
// ---------------------------------------------------------------------------
// Écran délibérément séparé de la liste de courses : celle-ci part de ce qu'on veut
// cuisiner, celui-ci part de ce qu'on peut dépenser. Ce ne sont pas deux vues d'une
// même chose, ce sont deux façons opposées d'aborder la semaine — et la seconde est
// celle que vit la majorité des foyers marocains.
import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wallet, Users } from 'lucide-react-native';
import { useTokens } from '../../constants/tokens';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import ScreenTopBar from '../../components/ScreenTopBar';
import { composerPanier, parEtal, type Produit } from '../../lib/panierSouk';
import TABLE from '../../assets/data/prix-souk.json';

const PRODUITS = (TABLE as any).produits as Produit[];
const ETALS = (TABLE as any).etals as Record<string, { n: string; ar: string }>;

const T: Record<string, Record<string, string>> = {
  fr: {
    titre: 'Panier du souk', budget: 'Budget de la semaine', personnes: 'Personnes',
    composer: 'Composer mon panier', total: 'Total', reste: 'Reste',
    couverture: 'Couverture des besoins', note: 'Prix moyens indicatifs — ils varient selon la ville, l’étal et la saison.',
    vide: 'Indique ton budget pour composer un panier.', dh: 'DH',
    serre: 'Budget serré : le panier couvre une partie de la semaine.',
    correct: 'Ce budget couvre la semaine.',
  },
  en: {
    titre: 'Souk basket', budget: 'Weekly budget', personnes: 'People',
    composer: 'Build my basket', total: 'Total', reste: 'Left',
    couverture: 'Needs covered', note: 'Indicative average prices — they vary by city, stall and season.',
    vide: 'Enter your budget to build a basket.', dh: 'MAD',
    serre: 'Tight budget: the basket covers part of the week.',
    correct: 'This budget covers the week.',
  },
  ar: {
    titre: 'سلة السوق', budget: 'ميزانية الأسبوع', personnes: 'الأشخاص',
    composer: 'كوّن سلتي', total: 'المجموع', reste: 'المتبقي',
    couverture: 'تغطية الاحتياجات', note: 'أسعار متوسطة إرشادية — تتغيّر حسب المدينة والبائع والموسم.',
    vide: 'أدخل ميزانيتك لتكوين سلة.', dh: 'درهم',
    serre: 'ميزانية ضيّقة: السلة تغطي جزءًا من الأسبوع.',
    correct: 'هذه الميزانية تغطي الأسبوع.',
  },
};

export default function PanierSouk() {
  const tok = useTokens();
  const { language, isRTL } = useTranslation();
  const t = T[String(language)] || T.fr;

  const [budget, setBudget] = useState('400');
  const [personnes, setPersonnes] = useState('2');

  const panier = useMemo(
    () => composerPanier(PRODUITS, Number(budget) || 0, Number(personnes) || 2, 7),
    [budget, personnes],
  );
  const groupes = useMemo(() => parEtal(panier), [panier]);
  const nomEtal = (id: string) =>
    language === 'ar' ? ETALS[id]?.ar || id : ETALS[id]?.n || id;

  const s = styles(tok);
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: tok.bg }]}>
      <ScreenTopBar showBack title={t.titre} showNotif={false} />
      <ScrollView contentContainerStyle={s.corps} keyboardShouldPersistTaps="handled">
        <View style={[s.saisies, { flexDirection: rowDir(isRTL) }]}>
          <View style={s.champ}>
            <View style={[s.etiquetteLigne, { flexDirection: rowDir(isRTL) }]}>
              <Wallet size={15} color={tok.textMuted} />
              <Text style={s.etiquette}>{t.budget}</Text>
            </View>
            <TextInput
              style={[s.saisie, { textAlign: txtAlign(isRTL) }]}
              value={budget}
              onChangeText={setBudget}
              keyboardType="numeric"
              accessibilityLabel={t.budget}
            />
          </View>
          <View style={s.champ}>
            <View style={[s.etiquetteLigne, { flexDirection: rowDir(isRTL) }]}>
              <Users size={15} color={tok.textMuted} />
              <Text style={s.etiquette}>{t.personnes}</Text>
            </View>
            <TextInput
              style={[s.saisie, { textAlign: txtAlign(isRTL) }]}
              value={personnes}
              onChangeText={setPersonnes}
              keyboardType="numeric"
              accessibilityLabel={t.personnes}
            />
          </View>
        </View>

        {panier.lignes.length === 0 ? (
          <Text style={s.vide}>{t.vide}</Text>
        ) : (
          <>
            <View style={s.resume}>
              <View style={[s.resumeLigne, { flexDirection: rowDir(isRTL) }]}>
                <Text style={s.resumeCle}>{t.total}</Text>
                <Text style={s.resumeVal}>
                  {panier.cout} / {panier.budget} {t.dh}
                </Text>
              </View>
              <View style={[s.resumeLigne, { flexDirection: rowDir(isRTL) }]}>
                <Text style={s.resumeCle}>{t.couverture}</Text>
                <Text style={s.resumeVal}>{Math.round(panier.couverture * 100)} %</Text>
              </View>
              <Text style={[s.verdict, { color: panier.couverture >= 1 ? tok.successInk : tok.warningInk }]}>
                {panier.couverture >= 1 ? t.correct : t.serre}
              </Text>
            </View>

            {groupes.map((g) => (
              <View key={g.etal} style={s.etal}>
                <View style={[s.etalTete, { flexDirection: rowDir(isRTL) }]}>
                  <Text style={s.etalNom}>{nomEtal(g.etal)}</Text>
                  <Text style={s.etalCout}>{g.cout} {t.dh}</Text>
                </View>
                {g.lignes.map((l) => (
                  <View key={l.produit.id} style={[s.ligne, { flexDirection: rowDir(isRTL) }]}>
                    <Text style={[s.ligneNom, { textAlign: txtAlign(isRTL) }]} numberOfLines={1}>
                      {language === 'ar' && l.produit.ar ? l.produit.ar : l.produit.n}
                    </Text>
                    <Text style={s.ligneQte}>
                      {l.quantite} {l.produit.unite} · {l.cout} {t.dh}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        <Text style={s.note}>{t.note}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (tok: any) =>
  StyleSheet.create({
    safe: { flex: 1 },
    corps: { padding: 18, gap: 14, paddingBottom: 40 },
    saisies: { gap: 12 },
    champ: { flex: 1, gap: 6 },
    etiquetteLigne: { alignItems: 'center', gap: 6 },
    etiquette: { fontSize: 12.5, fontWeight: '700', color: tok.textMuted },
    saisie: {
      backgroundColor: tok.surface, borderWidth: 1, borderColor: tok.border,
      borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 17, fontWeight: '800', color: tok.text,
    },
    vide: { color: tok.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
    resume: {
      backgroundColor: tok.surface, borderWidth: 1, borderColor: tok.border,
      borderRadius: 18, padding: 16, gap: 8,
    },
    resumeLigne: { justifyContent: 'space-between', alignItems: 'center' },
    resumeCle: { fontSize: 13.5, color: tok.textMuted, fontWeight: '600' },
    resumeVal: { fontSize: 16, fontWeight: '900', color: tok.text },
    verdict: { fontSize: 13, fontWeight: '700', marginTop: 2 },
    etal: {
      backgroundColor: tok.surface, borderWidth: 1, borderColor: tok.border,
      borderRadius: 18, padding: 14, gap: 8,
    },
    etalTete: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    etalNom: { fontSize: 14.5, fontWeight: '900', color: tok.accent },
    etalCout: { fontSize: 13, fontWeight: '800', color: tok.textMuted },
    ligne: { justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    ligneNom: { flex: 1, fontSize: 14, color: tok.text },
    ligneQte: { fontSize: 12.5, color: tok.textMuted },
    note: { fontSize: 11.5, color: tok.textFaint, lineHeight: 16, marginTop: 4 },
  });
