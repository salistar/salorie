import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { a11y } from '../../lib/a11y';
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
import { useSignIn, useClerk } from '@clerk/clerk-expo';
import * as Sentry from '@sentry/react-native';
import { useGoogleSSO, OAUTH_REDIRECT } from '../../lib/googleSSO';
import { useRouter, Link } from 'expo-router';
import { Mail, Lock, ArrowRight } from 'lucide-react-native';
import LogoGoogle from '../../components/LogoGoogle';
import { useTranslation, Language } from '../../lib/i18n';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../lib/ThemeContext';
import { rowDir, txtAlign, flipAuto } from '../../lib/rtl';
import ScreenTopBar from '../../components/ScreenTopBar';
import { Input } from '../../components/ui';
import { useTokens, Tokens } from '../../constants/tokens';

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
  const k = useTokens();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const { signIn, setActive, isLoaded } = useSignIn();
  // Lu AU MOMENT du catch : `useAuth()` fermerait sur une valeur figee
  // avant la connexion, donc toujours fausse la ou on en a besoin.
  const clerk = useClerk();
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

      // Timeout de securite : 2 minutes max.
      //
      // ⚠ LE MINUTEUR DOIT ETRE ANNULE. `Promise.race` se regle des que la
      // premiere promesse aboutit, mais le `setTimeout`, lui, continue de
      // courir : il rejetait 120 s APRES une connexion deja reussie.
      let minuteur: any;
      const timeoutPromise = new Promise((_, reject) => {
        minuteur = setTimeout(() => reject(new Error('startSSOFlow timeout 120s — browser n\'est pas revenu')), 120_000);
      });

      const result: any = await Promise.race([
        startGoogleSSO({
          redirectUrl,
        }),
        timeoutPromise,
      ]).finally(() => clearTimeout(minuteur));
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
      // `horsLigne` = l'utilisateur n'a plus de reseau (cf. lib/googleSSO.ts).
      // Ce n'est pas un defaut de l'app : on affiche le message, on ne remonte rien.
      // ── SI LA SESSION EXISTE, LE FLUX A REUSSI : ON SE TAIT ────────────
      //
      // La redirection `salorie://oauth-callback` conclut parfois la session par
      // le lien profond pendant que la promesse de `startGoogleSSO` reste
      // suspendue. L'utilisateur est alors DEJA CONNECTE, et deux minutes plus
      // tard le minuteur lui annoncait un echec.
      //
      // Constate sur un Galaxy A07 le 26/08/2026 : « startSSOFlow timeout 120s »
      // affiche par-dessus l'accueil, avec « Bon retour idriss » lisible derriere.
      //
      // Le garde-fou existant cherchait « session », « already », « signed out »
      // DANS LE MESSAGE. Celui du minuteur n'en contient aucun, donc il passait au
      // travers. On lit desormais l'ETAT — la seule chose qui ne depende pas de
      // la formulation d'une erreur.
      if (clerk?.session) {
        console.log('[Google SSO] session active malgre l\'erreur — aucune alerte');
        return;
      }
      if (!err?.horsLigne) {
        Sentry.captureException(err, {
          tags: { ecran: 'sign-in', flux: 'google-sso' },
          extra: { codeClerk: code },
        });
      }
      alert(msg || 'Google sign in failed');
    }
  };

  // Couleurs dérivées du thème (l'écran était tout blanc en dur)
  const cardBg = isDark ? colors.card : k.surface;
  const inputBg = k.border;
  const textPrimary = k.text;
  const textMuted = k.textMuted;
  const placeholderColor = k.textMuted;
  const iconColor = k.textMuted;
  const dividerColor = k.border;
  const orLabel = language === 'fr' ? 'OU' : language === 'ar' ? 'أو' : 'OR';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Le bouton retour est celui de ScreenTopBar, pas un bouton pose A COTE.
          Assemble a la main, il ne recevait pas le decalage de l'encoche que la
          barre s'applique, et se retrouvait ~35 px plus haut que le logo et les
          boutons de droite. Au passage : un seul bouton retour dans l'app, avec
          son inversion RTL et son libelle d'accessibilite deja traites. */}
      <ScreenTopBar
        showBrand={false}
        showNotif={false}
        showBack
        onBack={() => router.replace('/welcome' as any)}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.logoWrapper}>
            <Image
              source={require('../../assets/images/abstraits/hero-connexion.jpg')}
              style={styles.heroPhoto}
              resizeMode="cover"
            />
          </View>
          <Text style={[styles.title, { color: colors.primary }]}>Salorie</Text>
          <Text style={[styles.subtitle, { color: textMuted }]}>{t('welcome.feature_calories')}</Text>
        </View>

        <View style={[
          styles.form,
          { backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? k.border : 'transparent' },
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
            {!loading && <View style={flipAuto()}><ArrowRight size={20} color={k.onAccent} /></View>}
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
            <LogoGoogle size={20} />
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
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
    borderColor: k.border,
  },
  langPillActive: {
    backgroundColor: k.accent,
    borderColor: k.accent,
  },
  langPillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  langPillTextActive: {
    color: k.onAccent,
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
    borderColor: k.surface,
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
    color: k.accent,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: k.textMuted,
    marginTop: 4,
  },
  form: {
    backgroundColor: k.surface,
    borderRadius: 32,
    padding: 32,
    shadowColor: k.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  label: {
    fontSize: 24,
    fontWeight: '700',
    color: k.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: k.textMuted,
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: k.border,
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
    color: k.text,
  },
  button: {
    backgroundColor: k.accent,
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: k.isDark ? 'transparent' : k.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: k.onAccent,
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
    backgroundColor: k.border,
  },
  dividerText: {
    marginHorizontal: 12,
    color: k.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: k.surface,
    borderWidth: 1,
    borderColor: k.border,
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // `gap` et non `marginRight` sur l'icone : la ligne s'inverse en
    // arabe (row-reverse), et une marge PHYSIQUE se retrouve alors du
    // mauvais cote — le logo Google etait colle au texte.
    gap: 12,
  },
  googleButtonText: {
    color: k.text,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    color: k.textMuted,
    fontSize: 15,
  },
  linkText: {
    color: k.accent,
    fontSize: 15,
    fontWeight: '700',
  },
});
