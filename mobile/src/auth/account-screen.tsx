import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme as t } from '../theme';
import { providerLabel, savedProgressLabel } from './account-copy';
import { GoogleSignin } from './google';
import { supabase } from './supabase';

// Layout and states follow Figma "מסכי מערכת" / "מסך חשבון" (approved by Dor, 2026-10-16).
// The progress read also proves that Row Level Security returns only this user's rows.
type ProgressRead = { state: 'loading' } | { state: 'ok'; rows: number } | { state: 'error' };

export default function AccountScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const [progress, setProgress] = useState<ProgressRead>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let active = true;
    setProgress({ state: 'loading' });
    // No user filter on purpose: the database policy must do the filtering.
    supabase.from('user_unit_progress').select('unit_id', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (!active) return;
        if (error) { if (__DEV__) console.warn('Progress read failed:', error.message); setProgress({ state: 'error' }); }
        else setProgress({ state: 'ok', rows: count ?? 0 });
      });
    return () => { active = false; };
  }, [session.user.id, attempt]);

  async function signOut() {
    setSigningOut(true);
    // 'local' clears this device's saved session even when offline.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) { setSigningOut(false); return; }
    // Also forget the Google account remembered on this device, so the next
    // Google sign-in asks which account to use. Best effort: we are already signed out.
    if (session.user.app_metadata.provider === 'google') GoogleSignin.signOut().catch(() => {});
  }

  function confirmSignOut() {
    Alert.alert('לצאת מהחשבון?', 'ההתקדמות שמורה בחשבון ותחזור כשתתחברו שוב.', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'יציאה', style: 'destructive', onPress: () => { void signOut(); } },
    ]);
  }

  return <View style={[styles.root, { paddingTop: insets.top + t.space.md, paddingBottom: insets.bottom + t.space.md }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="חזרה" onPress={onBack} hitSlop={12}
      style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={styles.backChevron} accessible={false}>›</Text>
      <Text style={styles.backLabel}>חזרה</Text>
    </Pressable>
    <Text accessibilityRole="header" style={styles.title}>החשבון שלי</Text>
    <InfoCard label="מחוברים עם" value={providerLabel(session.user.app_metadata.provider)} detail={session.user.email} />
    <View style={styles.card}>
      <Text style={styles.cardLabel}>התקדמות שמורה</Text>
      {progress.state === 'loading' ? <View accessibilityLabel="טוענים" style={styles.skeleton} />
        : progress.state === 'error' ? <>
          <Text accessibilityRole="alert" style={styles.error}>לא הצלחנו לטעון את ההתקדמות.</Text>
          <Action title="נסו שוב" small onPress={() => setAttempt(n => n + 1)} />
        </>
        : <Text style={styles.cardValue}>{savedProgressLabel(progress.rows)}</Text>}
    </View>
    {__DEV__ && <View style={styles.devBox}>
      <Text selectable style={styles.devText}>פיתוח בלבד: מזהה משתמש {session.user.id}</Text>
    </View>}
    <View style={styles.spacer} />
    <Action title={signingOut ? 'יוצאים…' : 'יציאה מהחשבון'} onPress={confirmSignOut} disabled={signingOut} />
  </View>;
}

function InfoCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <View style={styles.card}>
    <Text style={styles.cardLabel}>{label}</Text>
    <Text style={styles.cardValue}>{value}</Text>
    {detail ? <Text selectable style={[styles.cardLabel, styles.ltr]}>{detail}</Text> : null}
  </View>;
}

function Action({ title, onPress, small = false, disabled = false }: { title: string; onPress: () => void; small?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, small && styles.smallAction, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}>
    <Text style={[styles.actionLabel, small && styles.smallLabel]}>{title}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.colors.background, paddingHorizontal: t.space.lg, gap: t.space.md },
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: t.space.xs, minHeight: t.touchTarget },
  backLabel: { fontSize: t.type.small, fontWeight: '600', color: t.colors.primary, writingDirection: 'rtl' },
  backChevron: { fontSize: 24, lineHeight: 26, color: t.colors.primary, writingDirection: 'ltr' },
  title: { fontSize: t.type.title, fontWeight: '700', color: t.colors.ink, writingDirection: 'rtl' },
  card: { backgroundColor: t.colors.surface, borderColor: t.colors.border, borderWidth: 1, borderRadius: t.radius.card, paddingVertical: t.space.md, paddingHorizontal: 20, gap: t.space.xs, alignItems: 'flex-start' },
  cardLabel: { fontSize: t.type.small, color: t.colors.muted, writingDirection: 'rtl' },
  cardValue: { fontSize: t.type.body, fontWeight: '700', color: t.colors.ink, writingDirection: 'rtl' },
  ltr: { writingDirection: 'ltr' },
  skeleton: { width: 120, height: 18, borderRadius: 9, backgroundColor: t.colors.soft, marginTop: t.space.xs },
  error: { fontSize: t.type.body, color: t.colors.danger, writingDirection: 'rtl' },
  devBox: { borderWidth: 1, borderStyle: 'dashed', borderColor: t.colors.muted, borderRadius: 12, paddingVertical: t.space.sm, paddingHorizontal: 12 },
  devText: { fontSize: t.type.small, color: t.colors.muted, writingDirection: 'rtl' },
  spacer: { flex: 1 },
  action: { backgroundColor: t.colors.soft, borderRadius: t.radius.button, minHeight: t.touchTarget, alignItems: 'center', justifyContent: 'center', padding: t.space.md, alignSelf: 'stretch' },
  smallAction: { alignSelf: 'flex-start', minHeight: 40, paddingVertical: t.space.sm, paddingHorizontal: t.space.md, marginTop: t.space.xs },
  actionLabel: { fontSize: t.type.body, fontWeight: '600', color: t.colors.ink, writingDirection: 'rtl' },
  smallLabel: { fontSize: t.type.small },
});
