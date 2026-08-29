// Liste de courses — locale d'abord, synchronisée avec l'espace web ensuite.
//
// La liste reste écrite en local A CHAQUE geste : on s'en sert dans un
// supermarché, c'est-à-dire là où le réseau ne passe pas. La synchronisation
// vient par-dessus, jamais à la place — le détail du raisonnement est dans
// `lib/listeCourses.ts`.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { a11y } from '../../lib/a11y';
import { useTokens } from '../../constants/tokens';
import {
  Image,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { ShoppingCart, Plus, Check, Trash2, RefreshCw } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { EmptyState } from '../../components/ui';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useScreenGate } from '../../components/FeatureGate';
import {
  type ArticleCourses,
  ecrireDistant,
  ecrireLocal,
  fusionner,
  purger,
  suivreDistant,
  synchroniser,
  visibles,
} from '../../lib/listeCourses';

const GREEN = '#2E8B57';
type Item = ArticleCourses;

const TXT: any = {
  en: { title: 'Shopping list', to_buy: 'item(s) to buy', add_what: 'Add what you need.', placeholder: 'Add an item…', empty: 'Empty list.', clear: 'Remove checked items', synced: 'Synced with your web space', local: 'Saved on this phone' },
  fr: { title: 'Liste de courses', to_buy: 'article(s) à acheter', add_what: "Ajoute ce qu'il te faut.", placeholder: 'Ajouter un article…', empty: 'Liste vide.', clear: 'Retirer les articles cochés', synced: 'Synchronisée avec ton espace web', local: 'Enregistrée sur ce téléphone' },
  ar: { title: 'قائمة المشتريات', to_buy: 'عنصر/عناصر للشراء', add_what: 'أضف ما تحتاجه.', placeholder: 'أضف عنصراً…', empty: 'القائمة فارغة.', clear: 'إزالة العناصر المحددة', synced: 'متزامنة مع مساحتك على الويب', local: 'محفوظة على هذا الهاتف' },
};

export default function ShoppingListScreen() {
  const k = useTokens();
  const __gate = useScreenGate('shopping-list');
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const textCol = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';

  // `items` contient AUSSI les pierres tombales : elles doivent partir vers le
  // web pour que la suppression y arrive. L'affichage passe par `visibles`.
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('');
  const [enSync, setEnSync] = useState(false);

  /** Écrit en local TOUT DE SUITE, pousse vers le web ensuite et sans attendre.
   *  L'ordre compte : si on attendait le réseau, cocher un article dans un
   *  magasin sans signal bloquerait l'interface pour rien. */
  const persist = useCallback((next: Item[]) => {
    setItems(next);
    ecrireLocal(next);
    if (email) ecrireDistant(email, next);
  }, [email]);

  const majItem = (id: string, patch: Partial<Item>) =>
    persist(items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i)));

  const lancerSync = useCallback(async () => {
    setEnSync(true);
    try {
      setItems(await synchroniser(email));
    } finally {
      setEnSync(false);
    }
  }, [email]);

  useEffect(() => { lancerSync(); }, [lancerSync]);

  // On garde la dernière liste connue dans une référence : l'écoute distante
  // est posée une seule fois, et sans ça sa fermeture capturerait un `items`
  // figé au premier rendu — les modifications faites depuis se perdraient.
  const dernier = useRef<Item[]>([]);
  useEffect(() => { dernier.current = items; }, [items]);

  useEffect(() => {
    if (!email) return;
    const stop = suivreDistant(email, (distant) => {
      const fusion = purger(fusionner(dernier.current, distant), Date.now());
      setItems(fusion);
      ecrireLocal(fusion);
    });
    return () => { stop?.(); };
  }, [email]);

  const add = () => {
    const t2 = text.trim();
    if (!t2) return;
    // Identifiant aléatoire en plus de l'horodatage : deux articles ajoutés
    // dans la même milliseconde depuis deux appareils partageraient sinon le
    // même identifiant, et l'un écraserait l'autre.
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    persist([{ id, name: t2, done: false, updatedAt: Date.now() }, ...items]);
    setText('');
  };
  const toggle = (id: string) => {
    const i = items.find((x) => x.id === id);
    if (i) majItem(id, { done: !i.done });
  };
  // Suppression = pierre tombale, pas retrait. Un retrait pur reviendrait du
  // web à la synchronisation suivante.
  const remove = (id: string) => majItem(id, { supprime: true });
  const clearDone = () =>
    persist(items.map((i) => (!i.supprime && i.done ? { ...i, supprime: true, updatedAt: Date.now() } : i)));

  const affiches = visibles(items);
  const left = affiches.filter((i) => !i.done).length;

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/images/photos/veggies_0.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><ShoppingCart size={24} color={accent} /><Text style={[styles.title, { color: textCol }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{affiches.length ? `${left} ${t.to_buy}` : t.add_what}</Text>

        {/* On DIT où la liste vit. Sans compte elle reste sur ce telephone, et
            quelqu'un qui l'ignore croira l'avoir perdue en changeant d'appareil. */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={a11y('rafraichir')}
          style={[styles.etatRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
          onPress={email ? lancerSync : undefined}
          disabled={!email || enSync}
        >
          <RefreshCw size={13} color={sub} />
          <Text style={[styles.etatTxt, { color: sub }]}>{email ? t.synced : t.local}</Text>
        </TouchableOpacity>

        <View style={styles.addRow}>
          <TextInput style={[styles.input, { backgroundColor: card, color: textCol, borderColor: isDark ? '#283241' : '#E2E8F0' }, align]} placeholder={t.placeholder} placeholderTextColor={isDark ? '#64748b' : '#94A3B8'} value={text} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('ajouter')} style={styles.addBtn} onPress={add}><Plus size={22} color="#fff" /></TouchableOpacity>
        </View>

        {affiches.length === 0 ? (
          <EmptyState icon={<ShoppingCart size={26} color={accent} />} title={t.title} subtitle={t.empty} ctaLabel={t.add_what} />
        ) : affiches.map((i) => (
          <View key={i.id} style={[styles.item, { backgroundColor: card }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('valider')} style={[styles.check, i.done && styles.checkDone]} onPress={() => toggle(i.id)}>
              {i.done && <Check size={16} color="#fff" />}
            </TouchableOpacity>
            <Text style={[styles.itemName, { color: textCol }, i.done && styles.itemDone]}>{i.name}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('supprimer')} onPress={() => remove(i.id)} hitSlop={8}><Trash2 size={18} color={isDark ? '#475569' : '#CBD5E1'} /></TouchableOpacity>
          </View>
        ))}

        {affiches.some((i) => i.done) && <TouchableOpacity style={styles.clearBtn} onPress={clearDone}><Text style={styles.clearTxt}>{t.clear}</Text></TouchableOpacity>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 6 },
  etatRow: { alignItems: 'center', gap: 6, marginBottom: 16 },
  etatTxt: { fontSize: 12.5 },
  addRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#0F172A', borderWidth: 1.5, borderColor: '#E2E8F0' },
  addBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10 },
  check: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: GREEN, borderColor: GREEN },
  itemName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  itemDone: { textDecorationLine: 'line-through', color: '#94A3B8' },
  clearBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  clearTxt: { color: '#E11D48', fontWeight: '700', fontSize: 14 },
});
