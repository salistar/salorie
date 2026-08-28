import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Bell } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { Colors } from '../constants/Colors';
import { useTranslation } from '../lib/i18n';
import ScreenTopBar from './ScreenTopBar';
import { useTheme } from '../lib/ThemeContext';
import { getNotificationsHistory } from '../lib/firebase';
import { useTokens, Tokens } from '../constants/tokens';

export default function HomeHeader() {
  const { user } = useUser();
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const k = useTokens();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) return;
    getNotificationsHistory(email).then((items: any[]) => {
      // Count only genuinely-unread items (read === false). Previously fell back
      // to items.length, which showed every notification as unread.
      const unread = items.filter((i) => i.read === false).length;
      setUnreadCount(unread);
    });
  }, [user?.primaryEmailAddress?.emailAddress]);

  const hasNotification = unreadCount > 0;
  const textColor = k.text;
  const subTextColor = k.textMuted;

  const avatarUrl = user?.imageUrl;
  const fullName = user?.fullName || user?.firstName || 'User';

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <View>
      <ScreenTopBar />
      <View style={styles.container}>
      {/* Left: Avatar + Text */}
      <View style={styles.leftSection}>
        {/* Avatar */}
        <View style={styles.avatarWrapper}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{getInitials(fullName)}</Text>
            </View>
          )}
          {/* Status dot */}
          <View style={styles.onlineDot} />
        </View>

        {/* Greeting + Name */}
        <View style={styles.textSection}>
          <Text style={[styles.welcomeText, { color: subTextColor }]}>{t('home.welcome_back')} 👋</Text>
          <Text style={[styles.userName, { color: textColor }]} numberOfLines={1}>
            {fullName}
          </Text>
        </View>
      </View>

      {/* 2nd bell removed — ScreenTopBar already provides one */}
      </View>
    </View>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
// ⚠ La fabrique recevait `isDark`, et chaque couleur s'ecrivait deux fois.
// La branche claire lisait `Colors.light`, l'objet STATIQUE, qui ignore le
// theme choisi : l'en-tete restait vert quand le reste passait au dore.
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: k.accent,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: k.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: k.accent,
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '700',
    color: k.accent,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: k.success,
    borderWidth: 2.5,
    borderColor: k.surface,
  },
  textSection: {
    marginLeft: 14,
    flex: 1,
  },
  welcomeText: {
    fontSize: 14,
    color: k.textMuted,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  userName: {
    fontSize: 19,
    fontWeight: '800',
    color: k.text,
    marginTop: 1,
    letterSpacing: -0.5,
  },
  bellButton: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: k.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    borderWidth: 1,
    borderColor: k.border,
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: k.danger,
    borderWidth: 2,
    borderColor: k.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDotText: {
    color: k.surface,
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 10,
  },
});
