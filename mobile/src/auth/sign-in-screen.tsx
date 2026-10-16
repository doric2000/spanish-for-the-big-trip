import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme as t } from '../theme';
import { signInWithApple } from './apple-sign-in';
import { supabase } from './supabase';

// Layout and states follow Figma "מסכי מערכת" / "מסך כניסה" (approved by Dor, 2026-10-16):
// Default, Busy, Canceled, Error, Unavailable. Google is added only once Google sign-in exists.
const logo = require('../../assets/logo/logo-d1-mark.png');

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

type Notice = 'canceled' | 'error' | null;

export default function SignInScreen() {
  const [appleAvailable, setAppleAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
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

  async function onApple() {
    if (inProgress.current) return;
    inProgress.current = true; setBusy(true); setNotice(null);
    const result = await signInWithApple(appleDeps);
    // On success the root layout's route guard replaces this screen.
    if (result.status === 'canceled') setNotice('canceled');
    if (result.status === 'error') {
      if (__DEV__) console.warn('Apple sign-in failed:', result.message);
      setNotice('error');
    }
    inProgress.current = false; setBusy(false);
  }

  return <View style={[styles.root, { paddingTop: insets.top + t.space.lg, paddingBottom: insets.bottom + t.space.md }]}>
    <StatusBar style="dark" />
    <View style={[styles.hero, busy && styles.dimmed]}>
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
          <Text style={styles.unavailable}>כניסה עם Apple אינה זמינה במכשיר הזה.</Text>
          {__DEV__ && unavailableReason && <Text selectable style={styles.note}>{unavailableReason}</Text>}
        </>
        : busy ? <View accessibilityRole="button" accessibilityState={{ disabled: true, busy: true }} style={[styles.buttonSlot, styles.busyButton]}>
          <Text style={styles.busyLabel}>מתחברים…</Text>
        </View>
        : <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={t.radius.button} style={styles.buttonSlot} onPress={() => { void onApple(); }} />}
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
  busyButton: { backgroundColor: '#000000', borderRadius: t.radius.button, opacity: 0.5 },
  busyLabel: { fontSize: t.type.body, fontWeight: '700', color: '#FFFFFF', writingDirection: 'rtl' },
  errorBox: { backgroundColor: t.colors.dangerSoft, borderColor: t.colors.dangerBorder, borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: t.space.md },
  errorText: { fontSize: t.type.small, lineHeight: 20, color: t.colors.danger, textAlign: 'right', writingDirection: 'rtl' },
  unavailable: { fontSize: t.type.body, color: t.colors.muted, textAlign: 'center', writingDirection: 'rtl' },
  note: { fontSize: t.type.small, color: t.colors.muted, textAlign: 'center', writingDirection: 'rtl' },
});
