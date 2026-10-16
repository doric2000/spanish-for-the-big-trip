import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme as t } from '../theme';
import { supabase } from './supabase';

// Stage 04 checkpoint: proves the signed-in session reaches the database and
// that Row Level Security returns only this user's progress rows.
type ProgressRead = { state: 'loading' } | { state: 'ok'; rows: number } | { state: 'error' };

export default function AccountScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const [progress, setProgress] = useState<ProgressRead>({ state: 'loading' });
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    // No user filter on purpose: the database policy must do the filtering.
    supabase.from('user_unit_progress').select('unit_id', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (!active) return;
        if (error) { if (__DEV__) console.warn('Progress read failed:', error.message); setProgress({ state: 'error' }); }
        else setProgress({ state: 'ok', rows: count ?? 0 });
      });
    return () => { active = false; };
  }, [session.user.id]);

  async function signOut() {
    setSigningOut(true);
    // 'local' clears this device's saved session even when offline.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) setSigningOut(false);
  }

  const provider = session.user.app_metadata.provider ?? 'unknown';
  return <View style={styles.root}>
    <View style={styles.stack}>
      <Text accessibilityRole="header" style={styles.title}>החשבון שלי</Text>
      <Text style={styles.body}>מחוברים דרך {provider === 'apple' ? 'Apple' : provider}</Text>
      {__DEV__ && <Text selectable style={styles.note}>מזהה משתמש: {session.user.id}</Text>}
      {progress.state === 'loading' ? <ActivityIndicator color={t.colors.primary} />
        : progress.state === 'error' ? <Text accessibilityRole="alert" style={styles.error}>לא הצלחנו לקרוא את ההתקדמות.</Text>
        : <Text style={styles.body}>שורות התקדמות שמורות: {progress.rows}</Text>}
    </View>
    <View style={styles.stack}>
      <Action title={signingOut ? 'יוצאים…' : 'יציאה מהחשבון'} onPress={() => { void signOut(); }} disabled={signingOut} />
      <Action title="חזרה" onPress={onBack} secondary />
    </View>
  </View>;
}

function Action({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, secondary && styles.secondaryAction, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}>
    <Text style={[styles.actionLabel, secondary && styles.secondaryLabel]}>{title}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.colors.background, padding: t.space.lg, paddingTop: 96, paddingBottom: t.space.xl, justifyContent: 'space-between' },
  stack: { gap: t.space.md, width: '100%', maxWidth: 600, alignSelf: 'center' },
  title: { fontSize: t.type.title, fontWeight: '700', color: t.colors.ink, textAlign: 'right', writingDirection: 'rtl' },
  body: { fontSize: t.type.body, color: t.colors.muted, textAlign: 'right', writingDirection: 'rtl' },
  note: { fontSize: t.type.small, color: t.colors.muted, textAlign: 'right' },
  error: { fontSize: t.type.body, color: t.colors.danger, textAlign: 'right', writingDirection: 'rtl' },
  action: { backgroundColor: t.colors.primary, borderRadius: t.radius.button, minHeight: t.touchTarget, alignItems: 'center', justifyContent: 'center', padding: t.space.md },
  secondaryAction: { backgroundColor: t.colors.soft },
  actionLabel: { fontSize: t.type.body, fontWeight: '600', color: t.colors.onPrimary, writingDirection: 'rtl' },
  secondaryLabel: { color: t.colors.primary },
});
