import React, { useState, useRef, useMemo } from 'react';
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
import { useSignUp } from '@clerk/clerk-expo';
import * as Sentry from '@sentry/react-native';
import { useGoogleSSO, OAUTH_REDIRECT } from '../../lib/googleSSO';
import { useRouter, Link } from 'expo-router';
import { Mail, Lock, User, ArrowRight, Globe, ArrowLeft, Hash } from 'lucide-react-native';
import { useTranslation, Language } from '../../lib/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenTopBar from '../../components/ScreenTopBar';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import { saveUserToFirestore } from '../../lib/firebase';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { rowDir, txtAlign } from '../../lib/rtl';
import { Input } from '../../components/ui';

// Verification step strings (kept local — pas de clés dans lib/i18n.tsx)
const TXT = {
  en: {
    verify_email: 'Verify Email',
    sent_code: "We've sent a code to",
    enter_code: 'Enter Verification Code',
    verifying: 'Verifying...',
    sign_in: 'Sign In',
  },
  fr: {
    verify_email: "Vérifier l'e-mail",
    sent_code: 'Nous avons envoyé un code à',
    enter_code: 'Entrez le code de vérification',
    verifying: 'Vérification...',
    sign_in: 'Connexion',
  },
  ar: {
    verify_email: 'تأكيد البريد الإلكتروني',
    sent_code: 'لقد أرسلنا رمزًا إلى',
    enter_code: 'أدخل رمز التحقق',
    verifying: 'جارٍ التحقق...',
    sign_in: 'تسجيل الدخول',
  },
};

const { width } = Dimensions.get('window');

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const { t, language, setLanguage, isRTL } = useTranslation();
  const { colors, resolved } = useTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const tx = TXT[language as keyof typeof TXT] ?? TXT.en;
  const { isLoaded, signUp, setActive } = useSignUp();
  const { startGoogleSSO } = useGoogleSSO();
  const router = useRouter();

  React.useEffect(() => {
    console.log('\x1b[33m[sign-up.tsx] MOUNT\x1b[0m', { time: new Date().toISOString() });
    Linking.getInitialURL().then((url) => {
      console.log('\x1b[33m[sign-up.tsx] Linking.getInitialURL\x1b[0m', { url });
    }).catch(() => {});

    const sub = Linking.addEventListener('url', (event) => {
      console.log('\x1b[36m[sign-up.tsx] Linking event (URL recue)\x1b[0m', { url: event.url });
    });
    return () => sub.remove();
  }, []);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  // Audit formulaires : chaînage du focus prénom → nom → e-mail → mot de passe.
  const lastNameRef = useRef<import('react-native').TextInput>(null);
  const emailRef = useRef<import('react-native').TextInput>(null);
  const signupPwRef = useRef<import('react-native').TextInput>(null);

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    setLoading(true);

    try {
      console.log('\x1b[32m[API→Clerk] signUp.create REQUEST\x1b[0m', {
        hasFirstName: !!firstName,
        hasLastName: !!lastName,
        emailDomain: emailAddress.includes('@') ? emailAddress.split('@')[1] : undefined,
      });
      const t0 = Date.now();
      await signUp.create({
        firstName,
        lastName,
        emailAddress,
        password,
      });
      console.log('\x1b[34m[API←Clerk] signUp.create OK\x1b[0m', { ms: Date.now() - t0 });

      console.log('\x1b[32m[API→Clerk] prepareEmailAddressVerification REQUEST\x1b[0m', { strategy: 'email_code' });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      console.log('\x1b[34m[API←Clerk] prepareEmailAddressVerification OK — code emailed\x1b[0m');
      setPendingVerification(true);
    } catch (err: any) {
      console.error('\x1b[34m[API←Clerk] signUp.create FAILED:\x1b[0m', JSON.stringify(err, null, 2));
      alert(err.errors?.[0]?.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const onPressVerify = async () => {
    if (!isLoaded) return;
    setLoading(true);

    try {
      console.log('\x1b[32m[API→Clerk] attemptEmailAddressVerification REQUEST\x1b[0m', { code });
      const t0 = Date.now();
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });
      console.log('\x1b[34m[API←Clerk] attemptEmailAddressVerification RESPONSE\x1b[0m', {
        ms: Date.now() - t0,
        status: completeSignUp.status,
        createdUserId: completeSignUp.createdUserId,
        createdSessionId: completeSignUp.createdSessionId,
      });

      if (completeSignUp.status === 'complete') {
        const user = completeSignUp.createdUserId;
        // Save user to Firestore
        await saveUserToFirestore({
            id: user as string,
            email: emailAddress,
            firstName,
            lastName,
        });

        await setActive({ session: completeSignUp.createdSessionId });
        router.replace('/(tabs)');
      } else {
        console.error(JSON.stringify(completeSignUp, null, 2));
      }
    } catch (err: any) {
      console.error(JSON.stringify(err, null, 2));
      alert(err.errors?.[0]?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const onGoogleSignUpPress = async () => {
    try {
      // Use the oauth-callback path explicitly so deep link lands on the dedicated
      // route (which calls WebBrowser.maybeCompleteAuthSession). Empty path = "/"
      // which causes a white screen if no index route exists.
      const redirectUrl = OAUTH_REDIRECT; // App Link HTTPS vérifié (fix définitif OAuth)
      const linkingUrl = Linking.createURL('');
      const linkingUrlOAuth = Linking.createURL('oauth-callback');
      console.log('\x1b[35m[sign-up.tsx] Diagnostic URLs\x1b[0m', {
        'AuthSession.makeRedirectUri (oauth-callback)': redirectUrl,
        'Linking.createURL("")': linkingUrl,
        'Linking.createURL("oauth-callback")': linkingUrlOAuth,
      });
      console.log('\x1b[32m[API→Clerk] startSSOFlow REQUEST (sign-up)\x1b[0m', {
        strategy: 'oauth_google',
        redirectUrl,
      });
      console.log('\x1b[33m[Google SSO sign-up] await startSSOFlow…\x1b[0m');
      const t0 = Date.now();

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
      console.log('\x1b[34m[API←Clerk] startSSOFlow RESPONSE (sign-up)\x1b[0m', {
        ms: Date.now() - t0,
        createdSessionId,
        hasSignIn: !!ssoSignIn,
        hasSignUp: !!ssoSignUp,
        signUpStatus: ssoSignUp?.status,
        signInStatus: ssoSignIn?.status,
      });

      if (createdSessionId) {
        await (ssoSetActive ?? setActive)({ session: createdSessionId });
        console.log('\x1b[34m[API←Clerk] setActive OK (sign-up Google)\x1b[0m');
        return;
      }

      if (ssoSignUp && ssoSignUp.status === 'missing_requirements') {
        console.log('\x1b[33m[Google SSO sign-up] missing_requirements → tentative transfer\x1b[0m');
        try {
          await ssoSignUp.create({ transfer: true });
          if (ssoSignUp.createdSessionId) {
            await (ssoSetActive ?? setActive)({ session: ssoSignUp.createdSessionId });
            console.log('\x1b[34m[API←Clerk] setActive OK (sign-up Google transfer)\x1b[0m');
            return;
          }
        } catch (e: any) {
          console.warn('[Google SSO sign-up] transfer failed', e?.message);
        }
      }

      console.warn('[Google SSO sign-up] No session created');
    } catch (err: any) {
      const code = err?.errors?.[0]?.code || err?.code;
      const msg = err?.errors?.[0]?.message || err?.message || '';
      // Déjà connecté / "Signed out" transitoire = session conclue en parallèle → pas d'alerte.
      if (code === 'session_exists' || /signed[\s_-]?out|session|already/i.test(msg)) {
        console.log('[Google SSO sign-up] état bénin, pas d\'alerte:', code || msg);
        return;
      }
      // Meme raison que sur sign-in : sans cette ligne, une inscription Google
      // cassee reste invisible. Un utilisateur qui n'arrive pas a creer son
      // compte ne remplit pas de formulaire de support — il desinstalle.
      console.error('[API<-Clerk] Google Sign Up FAILED:', JSON.stringify(err, null, 2));
      Sentry.captureException(err, {
        tags: { ecran: 'sign-up', flux: 'google-sso' },
        extra: { codeClerk: code },
      });
      alert(msg || 'Google sign up failed');
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

  if (pendingVerification) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.verifyForm, { backgroundColor: colors.background }]}>
            <Text style={[styles.label, { color: textPrimary, textAlign: txtAlign(isRTL) }]}>{tx.verify_email}</Text>
            <Text style={[styles.description, { color: textMuted, textAlign: txtAlign(isRTL) }]}>{tx.sent_code} {emailAddress}</Text>

            <Input
                icon={<Hash size={20} color={iconColor} />}
                value={code}
                placeholder={tx.enter_code}
                onChangeText={setCode}
                keyboardType="number-pad"
                accessibilityLabel={tx.enter_code}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                returnKeyType="go"
                onSubmitEditing={() => { if (!loading) onPressVerify(); }}
            />

            <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary, shadowColor: isDark ? 'transparent' : colors.primary }, loading && styles.buttonDisabled]}
                onPress={onPressVerify}
            >
                <Text style={styles.buttonText}>{loading ? tx.verifying : tx.verify_email}</Text>
            </TouchableOpacity>
        </View>
      </View>
    );
  }

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
              source={require('../../assets/images/illustrations/welcome.jpg')}
              style={styles.heroPhoto}
              resizeMode="cover"
            />
          </View>
          <Text style={[styles.brandName, { color: colors.primary }]}>Salorie</Text>
          <Text style={[styles.title, { color: textPrimary }]}>{t('auth.create_account')}</Text>
          <Text style={[styles.subtitle, { color: textMuted }]}>{t('auth.join_salorie')}</Text>
        </View>

        <View style={[
          styles.form,
          { backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent' },
          isDark && { shadowColor: 'transparent' },
        ]}>
          <View style={[styles.row, { flexDirection: rowDir(isRTL) }]}>
            <Input
              containerStyle={{ flex: 1, marginRight: 8, marginBottom: 0 }}
              icon={<User size={18} color={iconColor} />}
              placeholder={t('auth.first_name')}
              accessibilityLabel={t('auth.first_name')}
              value={firstName}
              onChangeText={setFirstName}
              autoComplete="name-given"
              textContentType="givenName"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => lastNameRef.current?.focus()}
              blurOnSubmit={false}
            />
            <Input
              containerStyle={{ flex: 1, marginLeft: 8, marginBottom: 0 }}
              ref={lastNameRef}
              placeholder={t('auth.last_name')}
              accessibilityLabel={t('auth.last_name')}
              value={lastName}
              onChangeText={setLastName}
              autoComplete="name-family"
              textContentType="familyName"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          <Input
            icon={<Mail size={20} color={iconColor} />}
            ref={emailRef}
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
            onSubmitEditing={() => signupPwRef.current?.focus()}
            blurOnSubmit={false}
          />

          <Input
            icon={<Lock size={20} color={iconColor} />}
            ref={signupPwRef}
            placeholder={t('auth.password')}
            accessibilityLabel={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => { if (!loading) onSignUpPress(); }}
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary, shadowColor: isDark ? 'transparent' : colors.primary }, loading && styles.buttonDisabled]}
            onPress={onSignUpPress}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? '...' : t('auth.get_started')}</Text>
            {!loading && <ArrowRight size={20} color="#fff" />}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />
            <Text style={[styles.dividerText, { color: textMuted }]}>{orLabel}</Text>
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />
          </View>

          <TouchableOpacity
            style={[styles.googleButton, { backgroundColor: cardBg, borderColor: dividerColor, flexDirection: rowDir(isRTL) }]}
            onPress={onGoogleSignUpPress}
          >
            <Globe size={20} color={isDark ? '#fff' : '#222'} style={styles.googleIcon} />
            <Text style={[styles.googleButtonText, { color: textPrimary }]}>{t('auth.continue_google')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.footer, { flexDirection: rowDir(isRTL) }]}>
          <Text style={[styles.footerText, { color: textMuted }]}>{t('welcome.have_account')} </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text style={[styles.linkText, { color: colors.primary }]}>{tx.sign_in}</Text>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  logoWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: isDark ? Colors.dark.white : Colors.light.white,
  },
  heroPhoto: {
    width: '100%',
    height: '100%',
  },
  logoText: {
    fontSize: 48,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '900',
    color: isDark ? Colors.dark.primary : Colors.light.primary,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: isDark ? Colors.dark.gray[800] : Colors.light.gray[800],
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500],
    marginTop: 8,
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
  verifyForm: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  label: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#64748B',
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
