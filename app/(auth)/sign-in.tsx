import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSignIn, useSSO } from '@clerk/clerk-expo';
import { useRouter, Link } from 'expo-router';
import { Mail, Lock, ArrowRight, Globe, ArrowLeft } from 'lucide-react-native';
import { useTranslation, Language } from '../../lib/i18n';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import ScreenTopBar from '../../components/ScreenTopBar';

const { width } = Dimensions.get('window');

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
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
        identifier: emailAddress,
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
        createdSessionId: completeSignIn.createdSessionId,
      });
      await setActive({ session: completeSignIn.createdSessionId });
      console.log('\x1b[34m[API←Clerk] setActive OK\x1b[0m');
    } catch (err: any) {
      console.error('\x1b[34m[API←Clerk] signIn.create FAILED:\x1b[0m', JSON.stringify(err, null, 2));
      alert(err.errors?.[0]?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const onGoogleSignInPress = async () => {
    try {
      // Use the oauth-callback path explicitly so deep link lands on the dedicated
      // route (which calls WebBrowser.maybeCompleteAuthSession). Empty path = "/"
      // which causes a white screen if no index route exists.
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: 'salorie',
        path: 'oauth-callback',
      });
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
        startSSOFlow({
          strategy: 'oauth_google',
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
      // "Session already exists" = l'utilisateur EST deja connecte (retry, double-tap,
      // ou session persistee). Ne JAMAIS afficher d'erreur — on entre dans l'app.
      if (code === 'session_exists') {
        console.log('[Google SSO] session_exists -> deja connecte, on entre dans l app');
        router.replace('/(tabs)' as any);
        return;
      }
      console.error('[Google SSO] Error:', JSON.stringify(err, null, 2));
      alert(err.errors?.[0]?.message || err?.message || 'Google sign in failed');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={[styles.topRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/welcome' as any)}>
          <ArrowLeft size={20} color={Colors.light.gray[700]} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
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
          <Text style={styles.title}>Salorie</Text>
          <Text style={styles.subtitle}>{t('welcome.feature_calories')}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>{t('auth.welcome_back')}</Text>
          <Text style={styles.description}>{t('auth.sign_in_continue')}</Text>

          <View style={styles.inputContainer}>
            <Mail size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t('auth.email')}
              value={emailAddress}
              onChangeText={setEmailAddress}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Lock size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={onSignInPress}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? t('auth.signing_in') : t('auth.sign_in')}</Text>
            {!loading && <ArrowRight size={20} color="#fff" />}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            style={styles.googleButton}
            onPress={onGoogleSignInPress}
          >
            <Globe size={20} color="#222" style={styles.googleIcon} />
            <Text style={styles.googleButtonText}>{t('auth.continue_google')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.no_account')} </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <Text style={styles.linkText}>{t('auth.sign_up')}</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
    borderColor: Colors.light.gray[200],
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
    borderColor: Colors.light.gray[200],
  },
  langPillActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
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
    borderColor: Colors.light.white,
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
    color: Colors.light.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.light.gray[500],
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
    color: Colors.light.gray[800],
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: Colors.light.gray[500],
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.gray[100],
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
    color: Colors.light.gray[800],
  },
  button: {
    backgroundColor: Colors.light.primary,
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: Colors.light.primary,
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
    backgroundColor: Colors.light.gray[200],
  },
  dividerText: {
    marginHorizontal: 12,
    color: Colors.light.gray[400],
    fontSize: 12,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.light.gray[200],
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
    color: Colors.light.gray[800],
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    color: Colors.light.gray[500],
    fontSize: 15,
  },
  linkText: {
    color: Colors.light.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
