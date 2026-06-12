// FORM KIT — pattern unique des formulaires Salorie :
//  champs groupés en CARTES · label AU-DESSUS · STEPPER (+/-) pour les nombres ·
//  CHIPS pour les choix · 1 seul CTA vert plein en bas · erreurs INLINE.
// Tous les composants sont theme-aware (dark) et RTL-ready.
import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';

const GREEN = '#2E8B57';

export function useFormTheme() {
  const { resolved } = useTheme();
  const { isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  return {
    isDark, isRTL,
    bg: isDark ? '#0B0F14' : '#ffffff',
    card: isDark ? '#161C23' : '#F8FAFC',
    border: isDark ? '#283241' : '#E2E8F0',
    inputBg: isDark ? '#0B0F14' : '#ffffff',
    text: isDark ? '#F1F5F9' : '#0F172A',
    sub: isDark ? '#94A3B8' : '#64748B',
    align: { textAlign: (isRTL ? 'right' : 'left') as any },
    rowDir: { flexDirection: (isRTL ? 'row-reverse' : 'row') as any },
  };
}

/** Carte qui groupe des champs liés. */
export function FormCard({ children, style }: any) {
  const th = useFormTheme();
  return <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }, style]}>{children}</View>;
}

/** Label au-dessus du champ. */
export function FormLabel({ children }: any) {
  const th = useFormTheme();
  return <Text style={[s.label, { color: th.sub }, th.align]}>{children}</Text>;
}

/** Champ texte : label au-dessus + input thémé + erreur inline. */
export function FormInput({ label, error, style, ...props }: any) {
  const th = useFormTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <FormLabel>{label}</FormLabel> : null}
      <View style={[s.inputWrap, { backgroundColor: th.inputBg, borderColor: error ? '#e11d48' : th.border }]}>
        <TextInput style={[s.input, { color: th.text }, th.align, style]} placeholderTextColor={th.sub} {...props} />
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

/** Stepper numérique (+/-) avec saisie directe. */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 100000, unit, error }: any) {
  const th = useFormTheme();
  const num = Number(value) || 0;
  const set = (v: number) => onChange(String(Math.max(min, Math.min(max, v))));
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <FormLabel>{label}</FormLabel> : null}
      <View style={[s.stepperWrap, { backgroundColor: th.inputBg, borderColor: error ? '#e11d48' : th.border }, th.rowDir]}>
        <TouchableOpacity style={s.stepBtn} onPress={() => set(num - step)} hitSlop={{ top: 8, bottom: 8 }}>
          <Minus size={18} color={GREEN} />
        </TouchableOpacity>
        <TextInput
          style={[s.stepInput, { color: th.text }]}
          value={String(value ?? '')}
          onChangeText={onChange}
          keyboardType="numeric"
          textAlign="center"
        />
        {unit ? <Text style={[s.unit, { color: th.sub }]}>{unit}</Text> : null}
        <TouchableOpacity style={s.stepBtn} onPress={() => set(num + step)} hitSlop={{ top: 8, bottom: 8 }}>
          <Plus size={18} color={GREEN} />
        </TouchableOpacity>
      </View>
      <InlineError error={error} />
    </View>
  );
}

/** Groupe de chips (choix unique). options: [{value,label}] */
export function ChipGroup({ label, options, value, onChange }: any) {
  const th = useFormTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <FormLabel>{label}</FormLabel> : null}
      <View style={[s.chipRow, th.rowDir]}>
        {options.map((o: any) => {
          const active = o.value === value;
          return (
            <TouchableOpacity key={o.value} style={[s.chip, { backgroundColor: active ? GREEN : th.inputBg, borderColor: active ? GREEN : th.border }]} onPress={() => onChange(o.value)}>
              <Text style={[s.chipTxt, { color: active ? '#fff' : th.sub }]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** CTA unique : vert, plein, en bas d'écran. */
export function SubmitBar({ label, onPress, disabled, loading }: any) {
  return (
    <View style={s.footer}>
      <TouchableOpacity style={[s.submit, (disabled || loading) && s.submitDisabled]} onPress={onPress} disabled={disabled || loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitTxt}>{label}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 22, padding: 18, borderWidth: 1.5, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3, opacity: 0.85 },
  inputWrap: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14 },
  input: { fontSize: 16, fontWeight: '700', paddingVertical: 13 },
  error: { color: '#e11d48', fontSize: 12, fontWeight: '700', marginTop: 5 },
  stepperWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 6 },
  stepBtn: { width: 44, height: 50, alignItems: 'center', justifyContent: 'center' },
  stepInput: { flex: 1, fontSize: 20, fontWeight: '900', paddingVertical: 10 },
  unit: { fontSize: 13, fontWeight: '800', marginHorizontal: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 9 },
  chipTxt: { fontSize: 13.5, fontWeight: '800' },
  footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
  submit: { backgroundColor: GREEN, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: GREEN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  submitDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0, elevation: 0 },
  submitTxt: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
