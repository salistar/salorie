import React, { useState, useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, Sun, Moon, Smartphone, Globe, ArrowLeft } from 'lucide-react-native';
import { useTheme, ThemeMode } from '../lib/ThemeContext';
import { useTranslation, Language } from '../lib/i18n';
import { rowDir, txtAlign, directionAuto } from '../lib/rtl';
import AppBrand from './AppBrand';
import { useTokens, Tokens } from '../constants/tokens';

// Libellés du menu de thème, traduits (sinon "Light/Dark/System" en anglais partout).
const THEME_LABELS: Record<string, Record<string, string>> = {
  en: { light: 'Light', dark: 'Dark', system: 'System' },
  fr: { light: 'Clair', dark: 'Sombre', system: 'Système' },
  ar: { light: 'فاتح', dark: 'داكن', system: 'النظام' },
};

// A11Y #88 — libellés d'accessibilité pour les boutons icône-seule de la barre du
// haut (retour, langue, thème, notifications). Inline FR/EN/AR car aucune clé i18n
// dédiée n'existe ; même pattern que THEME_LABELS ci-dessus. Purement additif.
const A11Y_LABELS: Record<string, Record<string, string>> = {
  en: { back: 'Go back', language: 'Change language', theme: 'Change theme', notifications: 'Notifications' },
  fr: { back: 'Retour', language: 'Changer de langue', theme: 'Changer de thème', notifications: 'Notifications' },
  ar: { back: 'رجوع', language: 'تغيير اللغة', theme: 'تغيير السمة', notifications: 'الإشعارات' },
};

interface ScreenTopBarProps {
  showBrand?: boolean;
  showNotif?: boolean;
  /** D5 — unified header: show a back button on the leading edge. */
  showBack?: boolean;
  /** D5 — unified header: screen title shown next to the back button. */
  title?: string;
  /** Custom back handler (defaults to router.back()). */
  onBack?: () => void;
}

export default function ScreenTopBar({ showBrand = true, showNotif = true, showBack = false, title, onBack }: ScreenTopBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode, setMode, resolved, colors } = useTheme();
  const k = useTokens();
  const { language, setLanguage, isRTL } = useTranslation();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  const iconColor = resolved === 'dark' ? colors.gray[600] : k.textMuted;
  const btnBg = resolved === 'dark' ? 'rgba(40,50,60,0.6)' : 'rgba(255,255,255,0.8)';
  const btnBorder = resolved === 'dark' ? colors.gray[200] : k.border;
  // Dark-aware dropdown menus (theme / language).
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const menuBg = k.surface;
  const menuItemText = k.text;
  const menuActiveBg = isDark ? 'rgba(46,139,87,0.18)' : k.accentSoft;

  const themeIcons: Record<ThemeMode, any> = {
    light: Sun,
    dark: Moon,
    system: Smartphone,
  };
  const ThemeIcon = themeIcons[mode];

  // A11Y #88 — libellés d'accessibilité résolus selon la langue courante.
  const a11y = A11Y_LABELS[language] || A11Y_LABELS.en;

  return (
    // L'app dessine BORD A BORD sur Android : sans ce decalage, la barre se
    // glisse sous l'heure et la batterie — le logo recouvrait l'icone systeme,
    // les boutons Langue et Theme passaient sous le wifi. `SafeAreaView` de
    // react-native n'y change rien : il n'agit QUE sur iOS. Seul
    // react-native-safe-area-context mesure l'encoche sur Android.
    // 12 px restent le respirant habituel quand il n'y a pas d'encoche.
    <View style={[styles.row, { paddingTop: insets.top + 12 }, isRTL && { flexDirection: 'row-reverse' }]}>
      <View style={[styles.leading, isRTL && { flexDirection: 'row-reverse' }]}>
        {showBack && (
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: btnBg, borderColor: btnBorder }]}
            onPress={() => (onBack ? onBack() : router.back())}
            accessibilityRole="button"
            accessibilityLabel={a11y.back}
          >
            <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ArrowLeft size={20} color={iconColor} /></View>
          </TouchableOpacity>
        )}
        {/* Flame logo — affiché quand il n'y a PAS de titre d'écran (sinon le logo
            mange la largeur et tronque le titre type « Sa… »). Sur les sous-écrans,
            back + titre suffisent comme en-tête. */}
        {!title && (
          <View style={[styles.brandLogoWrap, { backgroundColor: resolved === 'dark' ? colors.card : k.surface, borderColor: resolved === 'dark' ? colors.gray[200] : k.border }]}>
            <Image source={require('../assets/images/fire.png')} style={styles.brandLogo} resizeMode="contain" />
          </View>
        )}
        {title ? (
          <Text
            style={[styles.screenTitle, { color: k.text, textAlign: isRTL ? 'right' : 'left' }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        ) : (
          showBrand && <Text numberOfLines={1} style={[styles.brandWord, { color: colors.primary }]}>Salorie</Text>
        )}
      </View>
      <View style={styles.actions}>
        {/* Language pill */}
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: btnBg, borderColor: btnBorder }]}
          onPress={() => setLangMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={a11y.language}
        >
          <Globe size={18} color={iconColor} />
          <Text style={[styles.iconBtnText, { color: iconColor }]}>
            {language === 'en' ? 'EN' : language === 'fr' ? 'FR' : 'AR'}
          </Text>
        </TouchableOpacity>

        {/* Theme toggle */}
        <TouchableOpacity
          style={[styles.iconBtnSquare, { backgroundColor: btnBg, borderColor: btnBorder }]}
          onPress={() => setThemeMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={a11y.theme}
        >
          <ThemeIcon size={18} color={iconColor} />
        </TouchableOpacity>

        {/* Notification bell */}
        {showNotif && (
          <TouchableOpacity
            style={[styles.iconBtnSquare, { backgroundColor: btnBg, borderColor: btnBorder }]}
            onPress={() => router.push('/notifications' as any)}
            accessibilityRole="button"
            accessibilityLabel={a11y.notifications}
          >
            <Bell size={18} color={iconColor} />
          </TouchableOpacity>
        )}
      </View>

      {/* Language menu */}
      <Modal visible={langMenuOpen} transparent animationType="fade" onRequestClose={() => setLangMenuOpen(false)}>
        <Pressable style={[styles.modalBackdrop, { alignItems: isRTL ? 'flex-start' : 'flex-end', paddingTop: insets.top + 60 }, directionAuto()]} onPress={() => setLangMenuOpen(false)}>
          <View style={[styles.menu, { backgroundColor: menuBg }]}>
            {(['en', 'fr', 'ar'] as Language[]).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[
                  styles.menuItem,
                  { flexDirection: rowDir(isRTL) },
                  language === lang && { backgroundColor: menuActiveBg },
                ]}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: language === lang }}
                onPress={() => {
                  setLanguage(lang);
                  setLangMenuOpen(false);
                }}
              >
                <Text style={styles.menuItemFlag}>
                  {lang === 'en' ? '🇬🇧' : lang === 'fr' ? '🇫🇷' : '🇸🇦'}
                </Text>
                <Text style={[styles.menuItemText, { color: menuItemText, textAlign: txtAlign(isRTL) }, language === lang && styles.menuItemTextActive]}>
                  {lang === 'en' ? 'English' : lang === 'fr' ? 'Français' : 'العربية'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Theme menu */}
      <Modal visible={themeMenuOpen} transparent animationType="fade" onRequestClose={() => setThemeMenuOpen(false)}>
        <Pressable style={[styles.modalBackdrop, { alignItems: isRTL ? 'flex-start' : 'flex-end', paddingTop: insets.top + 60 }, directionAuto()]} onPress={() => setThemeMenuOpen(false)}>
          <View style={[styles.menu, { backgroundColor: menuBg }]}>
            {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => {
              const Icon = themeIcons[m];
              return (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.menuItem,
                    { flexDirection: rowDir(isRTL) },
                    mode === m && { backgroundColor: menuActiveBg },
                  ]}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: mode === m }}
                  onPress={() => {
                    setMode(m);
                    setThemeMenuOpen(false);
                  }}
                >
                  <Icon size={18} color={mode === m ? k.accent : (isDark ? colors.gray[600] : k.textMuted)} />
                  <Text style={[styles.menuItemText, { color: menuItemText, textAlign: txtAlign(isRTL) }, mode === m && styles.menuItemTextActive]}>
                    {(THEME_LABELS[language] || THEME_LABELS.en)[m]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Sans largeur explicite, à l'intérieur d'un ScrollView le row se réduit à la
    // largeur de son contenu → space-between n'écarte plus les boutons et ils
    // recouvrent le mot « Salorie ». width:100% + alignSelf:stretch garantit la
    // pleine largeur dans TOUS les conteneurs (SafeAreaView direct OU ScrollView).
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  brandLogoWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    width: 26,
    height: 26,
  },
  brandWord: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  screenTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  actions: {
    flexDirection: 'row',
    gap: 5,
    flexShrink: 0,
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 7,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: k.border,
  },
  iconBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: k.textMuted,
  },
  iconBtnSquare: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: k.border,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'flex-start',
    // `alignItems` et `paddingTop` sont poses au point d'usage : le menu doit
    // tomber SOUS SON PROPRE BOUTON. Figes ici a 'flex-end' et 72 px, ils
    // collaient le menu a droite alors qu'en arabe le bouton passe a gauche —
    // on tapait a gauche, le menu surgissait a droite.
    paddingHorizontal: 20,
  },
  menu: {
    backgroundColor: k.surface,
    borderRadius: 16,
    padding: 8,
    gap: 4,
    minWidth: 180,
    shadowColor: k.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  menuItemActive: {
    backgroundColor: k.accentSoft,
  },
  menuItemFlag: {
    fontSize: 18,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '700',
    color: k.text,
  },
  menuItemTextActive: {
    color: k.accent,
  },
});
