import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Grain } from '../retro/art';
import { retro } from '../theme';
import { signInWithApple } from './apple-sign-in';
import { BoardingPass } from './boarding-pass';
import { GoogleSignin } from './google';
import { signInWithGoogle } from './google-sign-in';
import { supabase } from './supabase';

// Retro boarding pass sign-in (Claude Design prototype, artboard SignInAB, approved by
// Dor 2026-10-16). States: default, busy (per button), canceled, error, Apple unavailable.
// On the dark ticket background we use Apple's white custom-button style and Google's
// official dark theme (#131314 fill, #8E918F border, #E3E3E3 label, the 4-colour G).
const googleG = require('../../assets/auth/google-g.png');
const c = retro.colors;
const f = retro.fonts;

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
  // this app is Hebrew everywhere. Apple's rules for a custom button: black or white,
  // the Apple logo, the system font, "Continue with Apple" in the app's language.
  const appleButton = <Pressable accessibilityRole="button" accessibilityLabel="המשך עם Apple"
    accessibilityState={{ disabled: busy !== null, busy: busy === 'apple' }} disabled={busy !== null}
    onPress={() => { void signIn('apple'); }}
    style={({ pressed }) => [styles.button, styles.appleButton, busy === 'google' ? styles.dimmedButton : pressed && styles.pressed]}>
    {busy === 'apple' ? <ActivityIndicator color="#000000" />
      /* U+F8FF is drawn as the Apple logo by the iOS system font. */
      : <Text style={styles.appleLogo} accessible={false}>{'\uF8FF'}</Text>}
    <Text style={styles.appleLabel}>{busy === 'apple' ? 'מתחברים…' : 'המשך עם Apple'}</Text>
  </Pressable>;

  const googleButton = <Pressable accessibilityRole="button" accessibilityLabel="המשך עם Google"
    accessibilityState={{ disabled: busy !== null, busy: busy === 'google' }} disabled={busy !== null}
    onPress={() => { void signIn('google'); }}
    style={({ pressed }) => [styles.button, styles.googleButton, busy === 'apple' ? styles.dimmedButton : pressed && styles.pressed]}>
    {busy === 'google' ? <ActivityIndicator color="#E3E3E3" /> : <Image source={googleG} style={styles.googleG} accessible={false} />}
    <Text style={styles.googleLabel}>{busy === 'google' ? 'מתחברים…' : 'המשך עם Google'}</Text>
  </Pressable>;

  return <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
    <StatusBar style="light" />
    <Grain opacity={0.12} />
    {/* The ticket is decoration; the app name is announced here for screen readers. */}
    <Text accessibilityRole="header" style={styles.srOnly}>ספרדית לטיול הגדול</Text>
    <View style={styles.ticketArea} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <BoardingPass dimmed={busy !== null} />
    </View>
    <View style={styles.actions}>
      <Text style={styles.tagline}>לומדים מה שצריך לטיול, בתרגולים קצרים וממוקדים.</Text>
      {notice === 'canceled' && <Text accessibilityLiveRegion="polite" style={styles.canceled}>הכניסה בוטלה. אפשר לנסות שוב.</Text>}
      {notice === 'error' && <View accessibilityRole="alert" style={styles.errorBox}>
        <Text style={styles.errorText}>לא הצלחנו להתחבר. בדקו את החיבור לאינטרנט ונסו שוב.</Text>
      </View>}
      {appleAvailable === null ? <View style={styles.button}><ActivityIndicator color={c.gold} /></View>
        : !appleAvailable ? <>
          {googleButton}
          <Text style={styles.note}>כניסה עם Apple אינה זמינה במכשיר הזה.</Text>
          {__DEV__ && unavailableReason && <Text selectable style={styles.note}>{unavailableReason}</Text>}
        </>
        : <>{appleButton}{googleButton}</>}
      <Text style={styles.note}>הכניסה נדרשת כדי לשמור את ההתקדמות שלכם.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night, gap: 16 },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  ticketArea: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
  actions: { gap: 12, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24 },
  tagline: { fontFamily: f.body, fontSize: 16, lineHeight: 24, color: '#FFF3DCCC', textAlign: 'center', writingDirection: 'rtl' },
  button: { width: '100%', height: 54, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  dimmedButton: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  // System font (no fontFamily), as Apple requires for a custom button.
  appleButton: { backgroundColor: '#FFFFFF' },
  appleLogo: { fontSize: 20, color: '#000000' },
  appleLabel: { fontSize: 18, fontWeight: '600', color: '#000000', writingDirection: 'rtl' },
  googleButton: { gap: 10, backgroundColor: '#131314', borderColor: '#8E918F', borderWidth: 1 },
  googleG: { width: 20, height: 20 },
  googleLabel: { fontFamily: f.medium, fontSize: 18, color: '#E3E3E3', writingDirection: 'rtl' },
  canceled: { fontFamily: f.body, fontSize: 14, color: c.pink, textAlign: 'center', writingDirection: 'rtl' },
  errorBox: { backgroundColor: '#F26B3A26', borderColor: '#F26B3A80', borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  errorText: { fontFamily: f.body, fontSize: 14, lineHeight: 20, color: '#FFD9CC', writingDirection: 'rtl' },
  note: { fontFamily: f.body, fontSize: 13, lineHeight: 20, color: '#FFF3DC99', textAlign: 'center', writingDirection: 'rtl' },
});
