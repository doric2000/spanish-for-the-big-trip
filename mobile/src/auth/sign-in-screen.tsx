import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { theme as t } from '../theme';
import { signInWithApple } from './apple-sign-in';
import { supabase } from './supabase';

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

export default function SignInScreen() {
  const [appleAvailable, setAppleAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inProgress = useRef(false);
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
    inProgress.current = true; setBusy(true); setMessage(null);
    const result = await signInWithApple(appleDeps);
    // On success the session listener in App replaces this screen.
    if (result.status === 'canceled') setMessage('הכניסה בוטלה. אפשר לנסות שוב.');
    if (result.status === 'error') {
      if (__DEV__) console.warn('Apple sign-in failed:', result.message);
      setMessage('לא הצלחנו להיכנס. בדקו את החיבור לאינטרנט ונסו שוב.');
    }
    inProgress.current = false; setBusy(false);
  }

  return <View style={styles.root}>
    <StatusBar style="dark" />
    <View style={styles.stack}>
      <Text accessibilityRole="header" style={styles.title}>ספרדית לטיול הגדול</Text>
      <Text style={styles.body}>לומדים מה שצריך לטיול, בתרגולים קצרים וממוקדים.</Text>
    </View>
    <View style={styles.stack}>
      {appleAvailable === null || busy ? <ActivityIndicator color={t.colors.primary} />
        : appleAvailable ? <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={t.radius.button} style={styles.appleButton} onPress={() => { void onApple(); }} />
        : <>
          <Text style={styles.note}>כניסה עם Apple אינה זמינה במכשיר הזה.</Text>
          {__DEV__ && unavailableReason && <Text selectable style={styles.note}>{unavailableReason}</Text>}
        </>}
      {message && <Text accessibilityRole="alert" style={styles.note}>{message}</Text>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.colors.background, padding: t.space.lg, justifyContent: 'space-between', paddingTop: 120, paddingBottom: t.space.xl },
  stack: { gap: t.space.md, width: '100%', maxWidth: 600, alignSelf: 'center' },
  title: { fontSize: t.type.title, fontWeight: '700', color: t.colors.ink, textAlign: 'right', writingDirection: 'rtl' },
  body: { fontSize: t.type.body, lineHeight: 30, color: t.colors.muted, textAlign: 'right', writingDirection: 'rtl' },
  note: { fontSize: t.type.small, color: t.colors.muted, textAlign: 'center', writingDirection: 'rtl' },
  appleButton: { width: '100%', height: 52 },
});
