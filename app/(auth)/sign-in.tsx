import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import * as Sentry from '@sentry/react-native';
import { useGoogleSSO, OAUTH_REDIRECT } from '../../lib/googleSSO';
import { useRouter, Link } from 'expo-router';
import { Mail, Lock, ArrowRight, Globe, ArrowLeft } from 'lucide-react-native';
import { useTranslation, Language } from '../../lib/i18n';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { rowDir, txtAlign } from '../../lib/rtl';
import ScreenTopBar from '../../components/ScreenTopBar';
import { Input } from '../../components/ui';

const { width } = Dimensions.get('window');

// PII: ne jamais logguer email/mot de passe/session en clair. Hash court non
// reversible pour correler les logs sans exposer la valeur.
const shortHash = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

export const useWarmUpBrowser = () => {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
};

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  useWarmUpBrowser();
  const { t, language, setLanguage, isRTL } = useTranslation();
  const { colors, resolved } = useTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startGoogleSSO } = useGoogleSSO();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Chaînage de focus e-mail → mot de passe (audit formulaires).
  const passwordRef = useRef<import('react-native').TextInput>(null);

  useEffect(() => {
    console.log('\x1b[33m[sign-in.tsx] MOUNT\x1b[0m', {
      initialURL: 'checking...',
      time: new Date().toISOString(),
    });
    Linking.getInitialURL().then((url) => {
      console.log('\x1b[33m[sign-in.tsx] Linking.getInitialURL\x1b[0m', { url });
    }).catch(() => {});

    const sub = Linking.addEventListener('url', (event) => {
      console.log('\x1b[36m[sign-in.tsx] Linking event (URL recue)\x1b[0m', { url: event.url });
    });
    return () => sub.remove();
  }, []);

  const onSignInPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      console.log('\x1b[32m[API→Clerk] signIn.create REQUEST\x1b[0m', {
        identifierHash: shortHash(emailAddress),
        strategy: 'password',
      });
      const t0 = Date.now();
      const completeSignIn = await signIn.create({
        identifier: emailAddress,
        password,
      });
      console.log('\x1b[34m[API←Clerk] signIn.create RESPONSE\x1b[0m', {
        ms: Date.now() - t0,
        status: completeSignIn.status,
        hasSession: !!completeSignIn.createdSessionId,
      });
      await setActive({ session: completeSignIn.createdSessionId });
      console.log('\x1b[34m[API←Clerk] setActive OK\x1b[0m');
    } catch (err: any) {
      console.error('\x1b[34m[API←Clerk] signIn.create FAILED:\x1b[0m', {
        code: err?.errors?.[0]?.code || err?.code,
        message: err?.errors?.[0]?.message || err?.message,
      });
      alert(err.errors?.[0]?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const onGoogleSignInPress = async () => {
    try {
      // FIX DÉFINITIF : redirect = App Link HTTPS VÉRIFIÉ (pas le schéma custom que Samsung
      // perd). L'OAuth s'ouvre dans le navigateur externe (googleSSO) → au redirect, l'OS
      // ouvre l'app via l'App Link → oauth-callback.tsx finalise. Browser-agnostique.
      const redirectUrl = OAUTH_REDIRECT;
      const linkingUrl = Linking.createURL('');
      const linkingUrlOAuth = Linking.createURL('oauth-callback');
      console.log('\x1b[35m[sign-in.tsx] Diagnostic URLs\x1b[0m', {
        'AuthSession.makeRedirectUri (oauth-callback)': redirectUrl,
        'Linking.createURL("")': linkingUrl,
        'Linking.createURL("oauth-callback")': linkingUrlOAuth,
      });
      console.log('\x1b[32m[API→Clerk] startSSOFlow REQUEST\x1b[0m', {
        strategy: 'oauth_google',
        redirectUrl,
      });
      console.log('\x1b[33m[Google SSO] await startSSOFlow… (si rien apres ce log, le browser ne revient pas)\x1b[0m');
      const t0 = Date.now();

      // Timeout de securite : 2 minutes max
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('startSSOFlow timeout 120s — browser n\'est pas revenu')), 120_000)
      );

      const result: any = await Promise.race([
        startGoogleSSO({
          redirectUrl,
        }),
        timeoutPromise,
      ]);
      const { createdSessionId, setActive: ssoSetActive, signIn: ssoSignIn, signUp: ssoSignUp } = result || {};

      console.log('\x1b[34m[API←Clerk] startSSOFlow RESPONSE\x1b[0m', {
        ms: Date.now() - t0,
        createdSessionId,
        hasSignIn: !!ssoSignIn,
        hasSignUp: !!ssoSignUp,
        signUpStatus: ssoSignUp?.status,
        signInStatus: ssoSignIn?.status,
      });

      if (createdSessionId) {
        await (ssoSetActive ?? setActive)({ session: createdSessionId });
        console.log('\x1b[34m[API←Clerk] setActive OK (Google sign-in)\x1b[0m');
        return;
      }

      // Pas de session — souvent: compte Google inconnu cote Clerk → il faut completer le sign-up
      if (ssoSignUp && ssoSignUp.status === 'missing_requirements') {
        console.log('\x1b[33m[Google SSO] signUp.status=missing_requirements → on tente createdSessionId via signUp.create\x1b[0m');
        try {
          await ssoSignUp.create({ transfer: true });
          if (ssoSignUp.createdSessionId) {
            await (ssoSetActive ?? setActive)({ session: ssoSignUp.createdSessionId });
            console.log('\x1b[34m[API←Clerk] setActive OK (Google sign-up transfer)\x1b[0m');
            return;
          }
        } catch (e: any) {
          console.warn('[Google SSO] signUp.create(transfer) failed', e?.message);
        }
      }

      console.warn('[Google SSO] No session created — annule par utilisateur, redirect mismatch, ou compte Google inconnu');
    } catch (err: any) {
      const code = err?.errors?.[0]?.code || err?.code;
      const msg = err?.errors?.[0]?.message || err?.message || '';
      // "Session already exists" / "Signed out" transitoire = l'utilisateur EST déjà connecté
      // (le flux App Link/oauth-callback a conclu la session en parallèle). NE JAMAIS alerter.
      if (code === 'session_exists' || /signed[\s_-]?out|session|already/i.test(msg)) {
        console.log('[Google SSO] état bénin (déjà connecté), pas d\'alerte:', code || msg);
        return;
      }
      // Une connexion Google cassee ne se voyait NULLE PART : `console.error` est
      // retire du bundle en release, et l'`alert` ne s'affiche que chez celui qui
      // n'arrive pas a entrer — donc precisement quelqu'un qui ne peut rien
      // signaler. C'est le pire endroit possible pour une panne muette.
      // Constate en production le 16/08/2026 :
      // « Missing external verification redirect URL for SSO flow ».
      console.error('[Google SSO] Error:', JSON.stringify(err, null, 2));
      Sentry.captureException(err, {
        tags: { ecran: 'sign-in', flux: 'google-sso' },
        extra: { codeClerk: code },
      });
      alert(msg || 'Google sign in failed');
    }
  };

  // Couleurs dérivées du thème (l'écran était tout blanc en dur)
  const cardBg = isDark ? colors.card : '#fff';
  const inputBg = isDark ? Colors.dark.gray[100] : Colors.light.gray[100];
  const textPrimary = isDark ? '#fff' : Colors.light.gray[800];
  const textMuted = isDark ? Colors.dark.gray[400] : Colors.light.gray[500];
  const placeholderColor = isDark ? Colors.dark.gray[400] : '#666';
  const iconColor = isDark ? Colors.dark.gray[400] : '#666';
  const dividerColor = isDark ? Colors.dark.gray[200] : Colors.light.gray[200];
  const orLabel = language === 'fr' ? 'OU' : language === 'ar' ? 'أو' : 'OR';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={[styles.topRow, { flexDirection: rowDir(isRTL) }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/welcome' as any)}>
          <ArrowLeft size={20} color={isDark ? Colors.dark.gray[700] : Colors.light.gray[700]} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ScreenTopBar showBrand={false} showNotif={false} />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.logoWrapper}>
            <Image
              source={require('../../assets/images/illustrations/signin_hero.jpg')}
              style={styles.heroPhoto}
              resizeMode="cover"
            />
          </View>
          <Text style={[styles.title, { color: colors.primary }]}>Salorie</Text>
          <Text style={[styles.subtitle, { color: textMuted }]}>{t('welcome.feature_calories')}</Text>
        </View>

        <View style={[
          styles.form,
          { backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent' },
          isDark && { shadowColor: 'transparent' },
        ]}>
          <Text style={[styles.label, { color: textPrimary, textAlign: txtAlign(isRTL) }]}>{t('auth.welcome_back')}</Text>
          <Text style={[styles.description, { color: textMuted, textAlign: txtAlign(isRTL) }]}>{t('auth.sign_in_continue')}</Text>

          {/* Audit formulaires : autoComplete/textContentType manquaient → aucun gestionnaire
              de mots de passe (Google, 1Password…) ne proposait de remplir l'écran. Le
              chaînage returnKeyType/onSubmitEditing évite de sortir du clavier entre champs. */}
          <Input
            icon={<Mail size={20} color={iconColor} />}
            placeholder={t('auth.email')}
            accessibilityLabel={t('auth.email')}
            value={emailAddress}
            onChangeText={setEmailAddress}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
          />

          <Input
            ref={passwordRef}
            icon={<Lock size={20} color={iconColor} />}
            placeholder={t('auth.password')}
            accessibilityLabel={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => { if (!loading) onSignInPress(); }}
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary, shadowColor: isDark ? 'transparent' : colors.primary }, loading && styles.buttonDisabled]}
            onPress={onSignInPress}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? t('auth.signing_in') : t('auth.sign_in')}</Text>
            {!loading && <ArrowRight size={20} color="#fff" />}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />
            <Text style={[styles.dividerText, { color: textMuted }]}>{orLabel}</Text>
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />
          </View>

          <TouchableOpacity
            style={[styles.googleButton, { backgroundColor: cardBg, borderColor: dividerColor, flexDirection: rowDir(isRTL) }]}
            onPress={onGoogleSignInPress}
          >
            <Globe size={20} color={isDark ? '#fff' : '#222'} style={styles.googleIcon} />
            <Text style={[styles.googleButtonText, { color: textPrimary }]}>{t('auth.continue_google')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.footer, { flexDirection: rowDir(isRTL) }]}>
          <Text style={[styles.footerText, { color: textMuted }]}>{t('auth.no_account')} </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <Text style={[styles.linkText, { color: colors.primary }]}>{t('auth.sign_up')}</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
    borderWidth: 1,
    borderColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200],
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  langPickerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 16,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200],
  },
  langPillActive: {
    backgroundColor: Colors.light.primary,
    borderColor: isDark ? Colors.dark.primary : Colors.light.primary,
  },
  langPillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  langPillTextActive: {
    color: '#fff',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: isDark ? Colors.dark.white : Colors.light.white,
  },
  heroPhoto: {
    width: '100%',
    height: '100%',
  },
  logoEmoji: {
    fontSize: 56,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: isDark ? Colors.dark.primary : Colors.light.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500],
    marginTop: 4,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  label: {
    fontSize: 24,
    fontWeight: '700',
    color: isDark ? Colors.dark.gray[800] : Colors.light.gray[800],
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500],
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100],
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: isDark ? Colors.dark.gray[800] : Colors.light.gray[800],
  },
  button: {
    backgroundColor: Colors.light.primary,
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 8,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200],
  },
  dividerText: {
    marginHorizontal: 12,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    fontSize: 12,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200],
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    marginRight: 12,
  },
  googleButtonText: {
    color: isDark ? Colors.dark.gray[800] : Colors.light.gray[800],
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500],
    fontSize: 15,
  },
  linkText: {
    color: isDark ? Colors.dark.primary : Colors.light.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
