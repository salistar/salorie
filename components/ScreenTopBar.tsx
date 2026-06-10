import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Sun, Moon, Smartphone, Globe, ArrowLeft } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useTheme, ThemeMode } from '../lib/ThemeContext';
import { useTranslation, Language } from '../lib/i18n';
import AppBrand from './AppBrand';

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
  const { mode, setMode, resolved, colors } = useTheme();
  const { language, setLanguage, isRTL } = useTranslation();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  const iconColor = resolved === 'dark' ? colors.gray[600] : Colors.light.gray[700];
  const btnBg = resolved === 'dark' ? 'rgba(40,50,60,0.6)' : 'rgba(255,255,255,0.8)';
  const btnBorder = resolved === 'dark' ? colors.gray[200] : Colors.light.gray[200];

  const themeIcons: Record<ThemeMode, any> = {
    light: Sun,
    dark: Moon,
    system: Smartphone,
  };
  const ThemeIcon = themeIcons[mode];

  return (
    <View style={[styles.row, isRTL && { flexDirection: 'row-reverse' }]}>
      <View style={[styles.leading, isRTL && { flexDirection: 'row-reverse' }]}>
        {showBack && (
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: btnBg, borderColor: btnBorder }]}
            onPress={() => (onBack ? onBack() : router.back())}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color={iconColor} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
          </TouchableOpacity>
        )}
        {/* Flame logo — affiché quand il n'y a PAS de titre d'écran (sinon le logo
            mange la largeur et tronque le titre type « Sa… »). Sur les sous-écrans,
            back + titre suffisent comme en-tête. */}
        {!title && (
          <View style={[styles.brandLogoWrap, { backgroundColor: resolved === 'dark' ? colors.card : '#fff', borderColor: resolved === 'dark' ? colors.gray[200] : Colors.light.gray[200] }]}>
            <Image source={require('../assets/images/fire.png')} style={styles.brandLogo} resizeMode="contain" />
          </View>
        )}
        {title ? (
          <Text
            style={[styles.screenTitle, { color: resolved === 'dark' ? '#fff' : Colors.light.gray[900], textAlign: isRTL ? 'right' : 'left' }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        ) : (
          showBrand && <Text style={[styles.brandWord, { color: colors.primary }]}>Salorie</Text>
        )}
      </View>
      <View style={styles.actions}>
        {/* Language pill */}
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: btnBg, borderColor: btnBorder }]}
          onPress={() => setLangMenuOpen(true)}
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
        >
          <ThemeIcon size={18} color={iconColor} />
        </TouchableOpacity>

        {/* Notification bell */}
        {showNotif && (
          <TouchableOpacity
            style={[styles.iconBtnSquare, { backgroundColor: btnBg, borderColor: btnBorder }]}
            onPress={() => router.push('/notifications' as any)}
          >
            <Bell size={18} color={iconColor} />
          </TouchableOpacity>
        )}
      </View>

      {/* Language menu */}
      <Modal visible={langMenuOpen} transparent animationType="fade" onRequestClose={() => setLangMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setLangMenuOpen(false)}>
          <View style={styles.menu}>
            {(['en', 'fr', 'ar'] as Language[]).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[styles.menuItem, language === lang && styles.menuItemActive]}
                onPress={() => {
                  setLanguage(lang);
                  setLangMenuOpen(false);
                }}
              >
                <Text style={styles.menuItemFlag}>
                  {lang === 'en' ? '🇬🇧' : lang === 'fr' ? '🇫🇷' : '🇸🇦'}
                </Text>
                <Text style={[styles.menuItemText, language === lang && styles.menuItemTextActive]}>
                  {lang === 'en' ? 'English' : lang === 'fr' ? 'Français' : 'العربية'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Theme menu */}
      <Modal visible={themeMenuOpen} transparent animationType="fade" onRequestClose={() => setThemeMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setThemeMenuOpen(false)}>
          <View style={styles.menu}>
            {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => {
              const Icon = themeIcons[m];
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.menuItem, mode === m && styles.menuItemActive]}
                  onPress={() => {
                    setMode(m);
                    setThemeMenuOpen(false);
                  }}
                >
                  <Icon size={18} color={mode === m ? Colors.light.primary : Colors.light.gray[700]} />
                  <Text style={[styles.menuItemText, mode === m && styles.menuItemTextActive]}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
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
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  screenTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: Colors.light.gray[200],
  },
  iconBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.light.gray[700],
  },
  iconBtnSquare: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: Colors.light.gray[200],
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 72,
    paddingHorizontal: 20,
  },
  menu: {
    backgroundColor: Colors.light.white,
    borderRadius: 16,
    padding: 8,
    gap: 4,
    minWidth: 180,
    shadowColor: '#000',
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
    backgroundColor: Colors.light.primaryLight,
  },
  menuItemFlag: {
    fontSize: 18,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.gray[800],
  },
  menuItemTextActive: {
    color: Colors.light.primary,
  },
});
