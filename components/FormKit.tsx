// FORM KIT — pattern unique des formulaires Salorie :
//  champs groupés en CARTES · label AU-DESSUS · STEPPER (+/-) pour les nombres ·
//  CHIPS pour les choix · 1 seul CTA vert plein en bas · erreurs INLINE.
// Tous les composants sont theme-aware (dark) et RTL-ready.
// v2 : design enrichi (focus vert, boutons +/- ronds teintés, chips à coche,
// CTA dégradé, FormHeader icône+titre) — API 100% rétro-compatible.
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Minus, Plus, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import {
  CHAMP_HAUTEUR, CHAMP_HAUTEUR_COMPACTE, RAYON_CHAMP, RAYON_CARTE, RAYON_PUCE,
  BORDURE, LIBELLE, SAISIE, SAISIE_NOMBRE, ERREUR, ESPACE_ENTRE_CHAMPS, haloFocus,
} from '../constants/formTokens';

import { useTokens, type Tokens } from '../constants/tokens';

export function useFormTheme() {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const { resolved } = useTheme();
  const { isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  // Accent thémé : k.accent est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  // L accent vient du theme : le couple clair/sombre fige n en connaissait que deux.
  const accent = k.accent;
  return {
    isDark, isRTL, accent,
    bg: k.surface,
    card: k.surface,
    border: k.border,
    inputBg: k.surface,
    text: k.text,
    sub: k.textMuted,
    tint: k.accentSoft,
    align: { textAlign: (isRTL ? 'right' : 'left') as any },
    rowDir: { flexDirection: (isRTL ? 'row-reverse' : 'row') as any },
  };
}

/** En-tête d'écran de formulaire : pastille icône + titre + sous-titre. */
export function FormHeader({ icon: Icon, title, subtitle }: any) {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const th = useFormTheme();
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, th.isRTL && { flexDirection: 'row-reverse' }]}>
        {Icon ? (
          <View style={[s.headIcon, { backgroundColor: th.tint }]}>
            <Icon size={22} color={th.accent} />
          </View>
        ) : null}
        <Text style={[s.headTitle, { color: th.text }, th.align]}>{title}</Text>
      </View>
      {subtitle ? <Text style={[s.headSub, { color: th.sub }, th.align]}>{subtitle}</Text> : null}
    </View>
  );
}

/** Carte qui groupe des champs liés. */
export function FormCard({ children, style }: any) {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const th = useFormTheme();
  return <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }, th.isDark ? null : s.cardShadow, style]}>{children}</View>;
}

/** Label au-dessus du champ. */
export function FormLabel({ children }: any) {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const th = useFormTheme();
  return <Text style={[s.label, { color: th.sub }, th.align]}>{children}</Text>;
}

/** Champ texte : label au-dessus + input thémé + focus vert + icône optionnelle + erreur inline. */
export function FormInput({ label, error, style, icon: Icon, ...props }: any) {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const th = useFormTheme();
  const [focus, setFocus] = useState(false);
  const bColor = error ? k.danger : focus ? th.accent : th.border;
  return (
    <View style={{ marginBottom: ESPACE_ENTRE_CHAMPS }}>
      {label ? <FormLabel>{label}</FormLabel> : null}
      <View style={[s.inputWrap, { backgroundColor: th.inputBg, borderColor: bColor }, focus && s.focusGlow, th.rowDir]}>
        {Icon ? <Icon size={18} color={focus ? th.accent : th.sub} style={{ marginHorizontal: 4 }} /> : null}
        {/* Audit formulaires : le label est un <Text> FRÈRE du champ — RN ne fait aucune
            association automatique, donc TalkBack annonçait « champ de saisie » sans nom.
            On dérive accessibilityLabel du label (surchargeable par props). */}
        <TextInput
          accessibilityLabel={typeof label === 'string' ? label : undefined}
          style={[s.input, { color: th.text }, th.align, style]}
          placeholderTextColor={th.sub}
          onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
          {...props}
        />
      </View>
      <InlineError error={error} />
    </View>
  );
}

/** Erreur inline (sous le champ). */
export function InlineError({ error }: { error?: string }) {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  if (!error) return null;
  // L'erreur n'était que rouge : invisible pour les lecteurs d'écran ET pour les
  // daltoniens si la couleur est le seul signal. Live region = annonce à l'apparition.
  return <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={s.error}>{error}</Text>;
}

/** Stepper numérique (+/-) avec saisie directe — boutons ronds teintés. */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 100000, unit, error }: any) {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const th = useFormTheme();
  const num = Number(value) || 0;
  const set = (v: number) => onChange(String(Math.max(min, Math.min(max, v))));
  return (
    <View style={{ marginBottom: ESPACE_ENTRE_CHAMPS }}>
      {label ? <FormLabel>{label}</FormLabel> : null}
      <View style={[s.stepperWrap, { backgroundColor: th.inputBg, borderColor: error ? k.danger : th.border }, th.rowDir]}>
        {/* Les boutons −/+ n'étaient que des icônes : TalkBack annonçait « bouton » sans dire
            lequel ni sur quoi il agit. hitSlop horizontal ajouté aussi (cible < 48dp). */}
        <TouchableOpacity
          style={[s.stepBtn, { backgroundColor: th.tint }]}
          onPress={() => set(num - step)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label ? `Diminuer ${label}` : 'Diminuer'}
        >
          <Minus size={18} color={th.accent} strokeWidth={3} />
        </TouchableOpacity>
        <View style={s.stepValueWrap}>
          <TextInput
            accessibilityLabel={typeof label === 'string' ? label : undefined}
            style={[s.stepInput, { color: th.text }]}
            value={String(value ?? '')}
            onChangeText={onChange}
            keyboardType="numeric"
            // Le clavier numérique n'a pas de touche « OK » sur Android : sans returnKeyType
            // l'utilisateur restait bloqué clavier ouvert au-dessus du bouton d'envoi.
            returnKeyType="done"
            maxLength={7}
            textAlign="center"
          />
          {unit ? <Text style={[s.unit, { color: th.sub }]}>{unit}</Text> : null}
        </View>
        <TouchableOpacity
          style={[s.stepBtn, { backgroundColor: th.tint }]}
          onPress={() => set(num + step)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label ? `Augmenter ${label}` : 'Augmenter'}
        >
          <Plus size={18} color={th.accent} strokeWidth={3} />
        </TouchableOpacity>
      </View>
      <InlineError error={error} />
    </View>
  );
}

/** Groupe de chips (choix unique). options: [{value,label}] — coche sur l'actif. */
export function ChipGroup({ label, options, value, onChange }: any) {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const th = useFormTheme();
  return (
    <View style={{ marginBottom: ESPACE_ENTRE_CHAMPS }}>
      {label ? <FormLabel>{label}</FormLabel> : null}
      {/* Choix unique = sémantique radio. Sans accessibilityState, la coche verte est le
          SEUL indice de sélection → invisible pour TalkBack et pour un daltonien. */}
      <View style={[s.chipRow, th.rowDir]} accessibilityRole="radiogroup" accessibilityLabel={typeof label === 'string' ? label : undefined}>
        {options.map((o: any) => {
          const active = o.value === value;
          return (
            <TouchableOpacity
              key={o.value}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, checked: active }}
              accessibilityLabel={typeof o.label === 'string' ? o.label : undefined}
              style={[s.chip, { backgroundColor: active ? th.accent : th.inputBg, borderColor: active ? th.accent : th.border }, active && s.chipActiveShadow, th.rowDir]}
              onPress={() => onChange(o.value)}
            >
              {active ? <Check size={14} color={k.onAccent} strokeWidth={3} style={{ marginRight: 5 }} /> : null}
              <Text style={[s.chipTxt, { color: active ? k.onAccent : th.sub }]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** CTA unique : vert dégradé, plein, en bas d'écran. */
export function SubmitBar({ label, onPress, disabled, loading }: any) {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const th = useFormTheme();
  const off = disabled || loading;
  return (
    <View style={s.footer}>
      {/* En chargement le libellé disparaît au profit du spinner : sans accessibilityLabel
          le bouton devient anonyme, et sans busy/disabled l'état n'est pas annoncé. */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        disabled={off}
        style={s.submitTouch}
        accessibilityRole="button"
        accessibilityLabel={typeof label === 'string' ? label : undefined}
        accessibilityState={{ disabled: !!off, busy: !!loading }}
      >
        <LinearGradient
          colors={off ? ['#CBD5E1', '#CBD5E1'] : [th.accent, k.accentStrong]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[s.submit, !off && s.submitShadow]}
        >
          {loading ? <ActivityIndicator color={k.onAccent} /> : <Text style={s.submitTxt}>{label}</Text>}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// Fabrique themee : cette feuille lisait des jetons alors qu elle etait
// evaluee UNE FOIS a l importation, avant que le theme n existe.
const makeS = (k: Tokens) => StyleSheet.create({
  headIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, flex: 1 },
  headSub: { fontSize: 13.5, marginTop: 8, lineHeight: 19 },
  card: { borderRadius: RAYON_CARTE, padding: 18, borderWidth: BORDURE, marginBottom: 16 },
  cardShadow: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 },
  label: { ...LIBELLE },
  // `minHeight` MANQUAIT : padding 14 x2 + ligne ~19 donnait ~47 dp, sous le
  // plancher d'accessibilite Android de 48. Les champs etaient plus petits que
  // ceux de <Input> (54) dans les ecrans qui melangent les deux.
  inputWrap: { borderRadius: RAYON_CHAMP, borderWidth: BORDURE, paddingHorizontal: 14, alignItems: 'center', minHeight: CHAMP_HAUTEUR },
  focusGlow: { ...haloFocus(k.accent) },
  input: { ...SAISIE, flex: 1 },
  error: { color: k.danger, ...ERREUR },
  stepperWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: RAYON_CHAMP, borderWidth: BORDURE, padding: 6, minHeight: CHAMP_HAUTEUR },
  stepBtn: { width: CHAMP_HAUTEUR_COMPACTE, height: CHAMP_HAUTEUR_COMPACTE, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepValueWrap: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  stepInput: { ...SAISIE_NOMBRE, paddingVertical: 8, minWidth: 60 },
  unit: { fontSize: 13, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: RAYON_PUCE, borderWidth: BORDURE, paddingHorizontal: 16, paddingVertical: 10, minHeight: CHAMP_HAUTEUR_COMPACTE },
  chipActiveShadow: { shadowColor: k.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  chipTxt: { fontSize: 13.5, fontWeight: '800' },
  footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
  submitTouch: { borderRadius: 18 },
  submit: { height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  submitShadow: { shadowColor: k.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 12, elevation: 7 },
  submitTxt: { fontSize: 17, fontWeight: '800', color: k.onAccent, letterSpacing: 0.2 },
});
