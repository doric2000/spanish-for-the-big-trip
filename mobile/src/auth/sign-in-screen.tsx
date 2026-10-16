import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme as t } from '../theme';
import { signInWithApple } from './apple-sign-in';
import { GoogleSignin } from './google';
import { signInWithGoogle } from './google-sign-in';
import { supabase } from './supabase';

// Layout and states follow Figma "מסכי מערכת" / "מסך כניסה" (approved by Dor, 2026-10-16):
// Default, Busy Apple, Busy Google, Canceled, Error, Unavailable. The Google button follows
// Google's branding guidelines (light theme), so its colors are Google's, not our theme's.
const logo = require('../../assets/logo/logo-d1-mark.png');
const googleG = require('../../assets/auth/google-g.png');

const appleDeps = {
  randomNonce: () => Crypto.randomUUID(),
  sha256Hex: (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
  // Only the email scope: Supabase links accounts by email. The name is not needed.
  requestAppleCredential: (hashedNonce: string) => AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashedNonce,
  }),
  exchangeWithSupabase: (identityToken: string, rawNonce: string) =>
    supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce }),
};

const googleDeps = {
  requestGoogleCredential: async () => {
    const response = await GoogleSignin.signIn();
    return response.type === 'success' ? { type: 'success' as const, idToken: response.data.idToken } : { type: 'cancelled' as const };
  },
  // No nonce: see google-sign-in.ts.
  exchangeWithSupabase: (idToken: string) => supabase.auth.signInWithIdToken({ provider: 'google', token: idToken }),
};

type Provider = 'apple' | 'google';
type Notice = 'canceled' | 'error' | null;

export default function SignInScreen() {
  const [appleAvailable, setAppleAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const inProgress = useRef(false);
  const insets = useSafeAreaInsets();
  // Development-only diagnostics: why Apple sign-in is unavailable.
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(available => {
      setAppleAvailable(available);
      if (!available) setUnavailableReason(`isAvailableAsync=false on ${Platform.OS} ${String(Platform.Version)}`);
    }, (error: unknown) => {
      setAppleAvailable(false);
      setUnavailableReason(`isAvailableAsync failed on ${Platform.OS}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, []);

  // One guard for both buttons: a second tap on either one while signing in does nothing.
  async function signIn(provider: Provider) {
    if (inProgress.current) return;
    inProgress.current = true; setBusy(provider); setNotice(null);
    const result = provider === 'apple' ? await signInWithApple(appleDeps) : await signInWithGoogle(googleDeps);
    // On success the root layout's route guard replaces this screen.
    if (result.status === 'canceled') setNotice('canceled');
    if (result.status === 'error') {
      if (__DEV__) console.warn(`${provider} sign-in failed:`, result.message);
      setNotice('error');
    }
    inProgress.current = false; setBusy(null);
  }

  // Our own Apple button instead of the native one: the native label follows the
  // phone's language (Spanish on a phone set to Spanish, as learners often do), and
  // this app is Hebrew everywhere. Apple's rules for a custom button: black, the
  // Apple logo, the system font, "Continue with Apple" in the app's language.
  const appleButton = <Pressable accessibilityRole="button" accessibilityLabel="המשך עם Apple"
    accessibilityState={{ disabled: busy !== null, busy: busy === 'apple' }} disabled={busy !== null}
    onPress={() => { void signIn('apple'); }}
    style={({ pressed }) => [styles.buttonSlot, styles.appleButton, busy !== null ? styles.dimmedButton : pressed && styles.pressed]}>
    {/* U+F8FF is drawn as the Apple logo by the iOS system font. */}
    {busy !== 'apple' && <Text style={styles.appleLogo} accessible={false}>{'\uF8FF'}</Text>}
    <Text style={styles.appleLabel}>{busy === 'apple' ? 'מתחברים…' : 'המשך עם Apple'}</Text>
  </Pressable>;

  const googleButton = <Pressable accessibilityRole="button" accessibilityLabel="המשך עם Google"
    accessibilityState={{ disabled: busy !== null, busy: busy === 'google' }} disabled={busy !== null}
    onPress={() => { void signIn('google'); }}
    style={({ pressed }) => [styles.buttonSlot, styles.googleButton, busy !== null ? styles.dimmedButton : pressed && styles.pressed]}>
    {busy !== 'google' && <Image source={googleG} style={styles.googleG} accessible={false} />}
    <Text style={styles.googleLabel}>{busy === 'google' ? 'מתחברים…' : 'המשך עם Google'}</Text>
  </Pressable>;

  return <View style={[styles.root, { paddingTop: insets.top + t.space.lg, paddingBottom: insets.bottom + t.space.md }]}>
    <StatusBar style="dark" />
    <View style={[styles.hero, busy !== null && styles.dimmed]}>
      {/* Decorative: the app name is read right after it. */}
      <Image source={logo} style={styles.logo} accessible={false} importantForAccessibility="no" />
      <Text accessibilityRole="header" style={styles.title}>ספרדית לטיול הגדול</Text>
      <Text style={styles.tagline}>לומדים מה שצריך לטיול, בתרגולים קצרים וממוקדים.</Text>
    </View>
    <View style={styles.actions}>
      {notice === 'canceled' && <Text accessibilityLiveRegion="polite" style={styles.note}>הכניסה בוטלה. אפשר לנסות שוב.</Text>}
      {notice === 'error' && <View accessibilityRole="alert" style={styles.errorBox}>
        <Text style={styles.errorText}>לא הצלחנו להתחבר. בדקו את החיבור לאינטרנט ונסו שוב.</Text>
      </View>}
      {appleAvailable === null ? <View style={styles.buttonSlot}><ActivityIndicator color={t.colors.primary} /></View>
        : !appleAvailable ? <>
          {googleButton}
          <Text style={styles.unavailable}>כניסה עם Apple אינה זמינה במכשיר הזה.</Text>
          {__DEV__ && unavailableReason && <Text selectable style={styles.note}>{unavailableReason}</Text>}
        </>
        : <>{appleButton}{googleButton}</>}
      <Text style={styles.note}>הכניסה נדרשת כדי לשמור את ההתקדמות שלכם.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.colors.background, paddingHorizontal: t.space.lg, gap: t.space.lg },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.space.md, width: '100%', maxWidth: 600, alignSelf: 'center' },
  dimmed: { opacity: 0.5 },
  logo: { width: 112, height: 112 },
  title: { fontSize: t.type.title, fontWeight: '700', color: t.colors.ink, textAlign: 'center', writingDirection: 'rtl' },
  tagline: { fontSize: t.type.body, lineHeight: 28, color: t.colors.muted, textAlign: 'center', writingDirection: 'rtl' },
  actions: { gap: 12, width: '100%', maxWidth: 600, alignSelf: 'center' },
  buttonSlot: { width: '100%', height: 52, alignItems: 'center', justifyContent: 'center' },
  dimmedButton: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  // System font (no fontFamily), as Apple requires for a custom button.
  appleButton: { flexDirection: 'row', gap: 8, backgroundColor: '#000000', borderRadius: t.radius.button },
  appleLogo: { fontSize: 20, color: '#FFFFFF' },
  appleLabel: { fontSize: t.type.body, fontWeight: '600', color: '#FFFFFF', writingDirection: 'rtl' },
  // Google branding, light theme: white fill, #747775 border, #1F1F1F label, the 4-color G.
  googleButton: { flexDirection: 'row', gap: 10, backgroundColor: '#FFFFFF', borderColor: '#747775', borderWidth: 1, borderRadius: t.radius.button },
  googleG: { width: 20, height: 20 },
  googleLabel: { fontSize: t.type.body, fontWeight: '500', color: '#1F1F1F', writingDirection: 'rtl' },
  errorBox: { backgroundColor: t.colors.dangerSoft, borderColor: t.colors.dangerBorder, borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: t.space.md },
  errorText: { fontSize: t.type.small, lineHeight: 20, color: t.colors.danger, writingDirection: 'rtl' },
  unavailable: { fontSize: t.type.body, color: t.colors.muted, textAlign: 'center', writingDirection: 'rtl' },
  note: { fontSize: t.type.small, color: t.colors.muted, textAlign: 'center', writingDirection: 'rtl' },
});
