import React, { useState } from 'react';
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
import { useSignUp, useSSO } from '@clerk/clerk-expo';
import { useRouter, Link } from 'expo-router';
import { Mail, Lock, User, ArrowRight, Globe, ArrowLeft } from 'lucide-react-native';
import { useTranslation, Language } from '../../lib/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenTopBar from '../../components/ScreenTopBar';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import { saveUserToFirestore } from '../../lib/firebase';
import { Colors } from '../../constants/Colors';

const { width } = Dimensions.get('window');

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const { t, language, setLanguage, isRTL } = useTranslation();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { startSSOFlow } = useSSO();
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

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    setLoading(true);

    try {
      console.log('\x1b[32m[API→Clerk] signUp.create REQUEST\x1b[0m', {
        firstName, lastName, emailAddress,
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
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: 'salorie',
        path: 'oauth-callback',
      });
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
        startSSOFlow({
          strategy: 'oauth_google',
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
      // Deja connecte (Google a renvoye une session existante) -> on entre dans l app.
      if (code === 'session_exists') {
        console.log('[Google SSO sign-up] session_exists -> deja connecte, on entre dans l app');
        router.replace('/(tabs)' as any);
        return;
      }
      console.error('[API<-Clerk] Google Sign Up FAILED:', JSON.stringify(err, null, 2));
      alert(err.errors?.[0]?.message || err?.message || 'Google sign up failed');
    }
  };

  if (pendingVerification) {
    return (
      <View style={styles.container}>
        <View style={styles.verifyForm}>
            <Text style={styles.label}>Verify Email</Text>
            <Text style={styles.description}>We've sent a code to {emailAddress}</Text>
            
            <View style={styles.inputContainer}>
                <Lock size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                    value={code}
                    placeholder="Enter Verification Code"
                    onChangeText={setCode}
                    style={styles.input}
                    keyboardType="number-pad"
                />
            </View>

            <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={onPressVerify}
            >
                <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify Email'}</Text>
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
              source={require('../../assets/images/illustrations/welcome.jpg')}
              style={styles.heroPhoto}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.brandName}>Salorie</Text>
          <Text style={styles.title}>{t('auth.create_account')}</Text>
          <Text style={styles.subtitle}>{t('auth.join_salorie')}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.row}>
            <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
              <User size={18} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.first_name')}
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>
            <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
              <TextInput
                style={styles.input}
                placeholder={t('auth.last_name')}
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
          </View>

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
            onPress={onSignUpPress}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? '...' : t('auth.get_started')}</Text>
            {!loading && <ArrowRight size={20} color="#fff" />}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            style={styles.googleButton}
            onPress={onGoogleSignUpPress}
          >
            <Globe size={20} color="#222" style={styles.googleIcon} />
            <Text style={styles.googleButtonText}>{t('auth.continue_google')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('welcome.have_account')} </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text style={styles.linkText}>Sign In</Text>
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
    borderColor: Colors.light.white,
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
    color: Colors.light.primary,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.light.gray[800],
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.light.gray[500],
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
