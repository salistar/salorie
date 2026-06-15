// FORM KIT — pattern unique des formulaires Salorie :
//  champs groupés en CARTES · label AU-DESSUS · STEPPER (+/-) pour les nombres ·
//  CHIPS pour les choix · 1 seul CTA vert plein en bas · erreurs INLINE.
// Tous les composants sont theme-aware (dark) et RTL-ready.
// v2 : design enrichi (focus vert, boutons +/- ronds teintés, chips à coche,
// CTA dégradé, FormHeader icône+titre) — API 100% rétro-compatible.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Minus, Plus, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';

const GREEN = '#2E8B57';
const GREEN_DARK = '#246B43';

export function useFormTheme() {
  const { resolved } = useTheme();
  const { isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  return {
    isDark, isRTL,
    bg: isDark ? '#0B0F14' : '#ffffff',
    card: isDark ? '#161C23' : '#FFFFFF',
    border: isDark ? '#283241' : '#E8EDF2',
    inputBg: isDark ? '#0B0F14' : '#F8FAFC',
    text: isDark ? '#F1F5F9' : '#0F172A',
    sub: isDark ? '#94A3B8' : '#64748B',
    tint: isDark ? 'rgba(46,139,87,0.18)' : '#EAF4EE',
    align: { textAlign: (isRTL ? 'right' : 'left') as any },
    rowDir: { flexDirection: (isRTL ? 'row-reverse' : 'row') as any },
  };
}

/** En-tête d'écran de formulaire : pastille icône + titre + sous-titre. */
export function FormHeader({ icon: Icon, title, subtitle }: any) {
  const th = useFormTheme();
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, th.isRTL && { flexDirection: 'row-reverse' }]}>
        {Icon ? (
          <View style={[s.headIcon, { backgroundColor: th.tint }]}>
            <Icon size={22} color={GREEN} />
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
  const th = useFormTheme();
  return <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }, th.isDark ? null : s.cardShadow, style]}>{children}</View>;
}

/** Label au-dessus du champ. */
export function FormLabel({ children }: any) {
  const th = useFormTheme();
  return <Text style={[s.label, { color: th.sub }, th.align]}>{children}</Text>;
}

/** Champ texte : label au-dessus + input thémé + focus vert + icône optionnelle + erreur inline. */
export function FormInput({ label, error, style, icon: Icon, ...props }: any) {
  const th = useFormTheme();
  const [focus, setFocus] = useState(false);
  const bColor = error ? '#e11d48' : focus ? GREEN : th.border;
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <FormLabel>{label}</FormLabel> : null}
      <View style={[s.inputWrap, { backgroundColor: th.inputBg, borderColor: bColor }, focus && s.focusGlow, th.rowDir]}>
        {Icon ? <Icon size={18} color={focus ? GREEN : th.sub} style={{ marginHorizontal: 4 }} /> : null}
        <TextInput
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
  if (!error) return null;
  return <Text style={s.error}>{error}</Text>;
}

/** Stepper numérique (+/-) avec saisie directe — boutons ronds teintés. */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 100000, unit, error }: any) {
  const th = useFormTheme();
  const num = Number(value) || 0;
  const set = (v: number) => onChange(String(Math.max(min, Math.min(max, v))));
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <FormLabel>{label}</FormLabel> : null}
      <View style={[s.stepperWrap, { backgroundColor: th.inputBg, borderColor: error ? '#e11d48' : th.border }, th.rowDir]}>
        <TouchableOpacity style={[s.stepBtn, { backgroundColor: th.tint }]} onPress={() => set(num - step)} hitSlop={{ top: 8, bottom: 8 }} activeOpacity={0.7}>
          <Minus size={18} color={GREEN} strokeWidth={3} />
        </TouchableOpacity>
        <View style={s.stepValueWrap}>
          <TextInput
            style={[s.stepInput, { color: th.text }]}
            value={String(value ?? '')}
            onChangeText={onChange}
            keyboardType="numeric"
            textAlign="center"
          />
          {unit ? <Text style={[s.unit, { color: th.sub }]}>{unit}</Text> : null}
        </View>
        <TouchableOpacity style={[s.stepBtn, { backgroundColor: th.tint }]} onPress={() => set(num + step)} hitSlop={{ top: 8, bottom: 8 }} activeOpacity={0.7}>
          <Plus size={18} color={GREEN} strokeWidth={3} />
        </TouchableOpacity>
      </View>
      <InlineError error={error} />
    </View>
  );
}

/** Groupe de chips (choix unique). options: [{value,label}] — coche sur l'actif. */
export function ChipGroup({ label, options, value, onChange }: any) {
  const th = useFormTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <FormLabel>{label}</FormLabel> : null}
      <View style={[s.chipRow, th.rowDir]}>
        {options.map((o: any) => {
          const active = o.value === value;
          return (
            <TouchableOpacity
              key={o.value}
              activeOpacity={0.8}
              style={[s.chip, { backgroundColor: active ? GREEN : th.inputBg, borderColor: active ? GREEN : th.border }, active && s.chipActiveShadow, th.rowDir]}
              onPress={() => onChange(o.value)}
            >
              {active ? <Check size={14} color="#fff" strokeWidth={3} style={{ marginRight: 5 }} /> : null}
              <Text style={[s.chipTxt, { color: active ? '#fff' : th.sub }]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** CTA unique : vert dégradé, plein, en bas d'écran. */
export function SubmitBar({ label, onPress, disabled, loading }: any) {
  const off = disabled || loading;
  return (
    <View style={s.footer}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={off} style={s.submitTouch}>
        <LinearGradient
          colors={off ? ['#CBD5E1', '#CBD5E1'] : [GREEN, GREEN_DARK]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[s.submit, !off && s.submitShadow]}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitTxt}>{label}</Text>}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  headIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, flex: 1 },
  headSub: { fontSize: 13.5, marginTop: 8, lineHeight: 19 },
  card: { borderRadius: 24, padding: 18, borderWidth: 1.5, marginBottom: 16 },
  cardShadow: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 },
  label: { fontSize: 12.5, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.85 },
  inputWrap: { borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 14, alignItems: 'center' },
  focusGlow: { shadowColor: GREEN, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 2 },
  input: { fontSize: 16, fontWeight: '700', paddingVertical: 14, flex: 1 },
  error: { color: '#e11d48', fontSize: 12, fontWeight: '700', marginTop: 5 },
  stepperWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1.5, padding: 6 },
  stepBtn: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepValueWrap: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  stepInput: { fontSize: 22, fontWeight: '900', paddingVertical: 8, minWidth: 60 },
  unit: { fontSize: 13, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 10 },
  chipActiveShadow: { shadowColor: GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  chipTxt: { fontSize: 13.5, fontWeight: '800' },
  footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
  submitTouch: { borderRadius: 18 },
  submit: { height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  submitShadow: { shadowColor: GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 12, elevation: 7 },
  submitTxt: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
});
