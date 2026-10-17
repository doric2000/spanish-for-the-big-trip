import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { Grain } from '../retro/art';
import { retro } from '../theme';
import { type ProgressRead, providerLabel, savedProgressLabel, showPassportStamp } from './account-copy';
import { deleteAccount } from './delete-account';
import { GoogleSignin } from './google';
import { supabase } from './supabase';

// Retro account screen as a traveler's passport (Figma "מסך חשבון · רטרו" 104:657, approved
// by Dor 2026-10-17). States: default, loading, error with retry, deleting; sign-out and
// delete each confirm with a native alert. The progress read also proves that Row Level
// Security returns only this user's rows.
const c = retro.colors;
const f = retro.fonts;

export default function AccountScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const [progress, setProgress] = useState<ProgressRead>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<'signing-out' | 'deleting' | null>(null);
  const insets = useSafeAreaInsets();
  const provider = session.user.app_metadata.provider;

  // The effect only fetches; "loading" is set where a new read starts (initial state, retry).
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
  }, [session.user.id, attempt]);

  async function signOut() {
    setBusy('signing-out');
    // 'local' clears this device's saved session even when offline.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) { setBusy(null); return; }
    // Also forget the Google account remembered on this device, so the next
    // Google sign-in asks which account to use. Best effort: we are already signed out.
    if (provider === 'google') GoogleSignin.signOut().catch(() => {});
  }

  function confirmSignOut() {
    Alert.alert('לצאת מהחשבון?', 'ההתקדמות שמורה בחשבון ותחזור כשתתחברו שוב.', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'יציאה', style: 'destructive', onPress: () => { void signOut(); } },
    ]);
  }

  async function removeAccount() {
    setBusy('deleting');
    const result = await deleteAccount({
      deleteOnServer: async () => await supabase.rpc('delete_my_account'),
      forgetGoogle: provider === 'google' ? () => GoogleSignin.revokeAccess() : undefined,
      signOutLocally: () => supabase.auth.signOut({ scope: 'local' }),
    });
    // On success the route guard shows sign-in, which confirms "החשבון נמחק.".
    if (result.status === 'error') {
      if (__DEV__) console.warn('Account deletion failed:', result.message);
      setBusy(null);
      Alert.alert('לא הצלחנו למחוק את החשבון', 'בדקו את החיבור לאינטרנט ונסו שוב.');
    }
  }

  function confirmDelete() {
    Alert.alert('למחוק את החשבון?', 'החשבון וההתקדמות יימחקו לצמיתות, ואי אפשר לשחזר אותם.', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחיקה', style: 'destructive', onPress: () => { void removeAccount(); } },
    ]);
  }

  return <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
    <StatusBar style="light" />
    <Grain opacity={0.1} />
    {/* The chevron points right: in Hebrew, "back" is toward the start of the line. */}
    <Pressable accessibilityRole="button" accessibilityLabel="חזרה" onPress={onBack} hitSlop={12}
      style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}>
      <Svg width={20} height={20} viewBox="0 0 20 20" accessible={false}>
        <Path d="M8 5l5 5-5 5" stroke={c.gold} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
      <Text style={styles.backLabel}>חזרה</Text>
    </Pressable>
    <Text accessibilityRole="header" style={styles.title}>החשבון שלי</Text>

    <View style={styles.passport}>
      <View style={styles.band}>
        <Text style={styles.bandTitle}>דרכון נוסע</Text>
        <Text style={styles.bandCode}>PASAPORTE · SBT</Text>
      </View>
      <View style={styles.fields}>
        <Field label="מחוברים עם"><Text style={styles.bigValue}>{providerLabel(provider)}</Text></Field>
        {session.user.email ? <Field label="דוא״ל"><Text selectable style={[styles.value, styles.ltr]}>{session.user.email}</Text></Field> : null}
        <Svg height={2} width="100%" accessible={false}><Path d="M0 1H1000" stroke={c.night} strokeOpacity={0.25} strokeWidth={2} strokeDasharray="6 5" /></Svg>
        <Field label="התקדמות שמורה">
          {progress.state === 'loading' ? <View accessibilityLabel="טוענים" style={styles.skeleton} />
            : progress.state === 'error' ? <View style={styles.errorArea}>
              <Text accessibilityRole="alert" style={styles.error}>לא הצלחנו לטעון את ההתקדמות.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="נסו שוב" onPress={() => { setProgress({ state: 'loading' }); setAttempt(n => n + 1); }}
                style={({ pressed }) => [styles.retry, pressed && { opacity: 0.8 }]}>
                <Text style={styles.retryLabel}>נסו שוב</Text>
              </Pressable>
            </View>
            : <Text style={styles.bigValue}>{savedProgressLabel(progress.rows)}</Text>}
        </Field>
      </View>
      {showPassportStamp(progress) && <View pointerEvents="none" style={styles.stamp}><Stamp /></View>}
    </View>

    {__DEV__ && <View style={styles.devBox}>
      <Text selectable style={styles.devText}>פיתוח בלבד: מזהה משתמש {session.user.id}</Text>
    </View>}
    <View style={styles.spacer} />
    <Pressable accessibilityRole="button" accessibilityLabel="יציאה מהחשבון" accessibilityState={{ disabled: busy !== null }}
      disabled={busy !== null} onPress={confirmSignOut}
      style={({ pressed }) => [styles.signOut, { opacity: busy !== null ? 0.5 : pressed ? 0.75 : 1 }]}>
      <Text style={styles.signOutLabel}>{busy === 'signing-out' ? 'יוצאים…' : 'יציאה מהחשבון'}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="מחיקת החשבון" accessibilityState={{ disabled: busy !== null, busy: busy === 'deleting' }}
      disabled={busy !== null} onPress={confirmDelete} hitSlop={8}
      style={({ pressed }) => [styles.deleteLink, pressed && { opacity: 0.7 }]}>
      <Text style={busy === 'deleting' ? styles.deletingLabel : styles.deleteLabel}>{busy === 'deleting' ? 'מוחקים את החשבון…' : 'מחיקת החשבון'}</Text>
    </Pressable>
  </View>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>;
}

function Stamp() {
  return <Svg width={84} height={84} viewBox="0 0 84 84" accessible={false}>
    <Circle cx={42} cy={42} r={39} stroke={c.stamp} strokeWidth={2.5} fill="none" />
    <Circle cx={42} cy={42} r={32} stroke={c.stamp} strokeWidth={1.2} strokeDasharray="3 3" fill="none" />
    <SvgText x={42} y={39} textAnchor="middle" fontFamily={f.mono} fontSize={9} fill={c.stamp} letterSpacing={1.5}>VIAJE</SvgText>
    <SvgText x={42} y={55} textAnchor="middle" fontFamily={f.mono} fontSize={14} fill={c.stamp}>C01</SvgText>
  </Svg>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night, paddingHorizontal: 20, gap: 16 },
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  backLabel: { fontFamily: f.bold, fontSize: 15, color: c.gold, writingDirection: 'rtl' },
  title: { fontFamily: f.poster, fontSize: 46, lineHeight: 46, color: c.cream, writingDirection: 'rtl' },
  passport: { backgroundColor: c.cream, borderRadius: 22, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 18 } },
  band: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.deep, paddingHorizontal: 18, paddingVertical: 12 },
  bandTitle: { fontFamily: f.bold, fontSize: 14, color: c.cream, writingDirection: 'rtl' },
  bandCode: { fontFamily: f.mono, fontSize: 11, letterSpacing: 2, color: c.gold, writingDirection: 'ltr' },
  fields: { paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 20, gap: 14 },
  field: { gap: 2, alignItems: 'flex-start' },
  label: { fontFamily: f.body, fontSize: 12, color: c.inkMuted, writingDirection: 'rtl' },
  bigValue: { fontFamily: f.poster, fontSize: 34, lineHeight: 36, color: c.night, writingDirection: 'rtl' },
  value: { fontFamily: f.medium, fontSize: 14, color: c.night },
  ltr: { writingDirection: 'ltr' },
  skeleton: { width: 120, height: 22, borderRadius: 11, backgroundColor: '#0D3B401F', marginTop: 6 },
  errorArea: { alignSelf: 'stretch', alignItems: 'center', gap: 10 },
  error: { alignSelf: 'stretch', fontFamily: f.medium, fontSize: 15, color: '#B4462E', writingDirection: 'rtl' },
  retry: { minHeight: 46, paddingHorizontal: 28, borderRadius: 14, backgroundColor: c.night, alignItems: 'center', justifyContent: 'center' },
  retryLabel: { fontFamily: f.bold, fontSize: 16, color: c.gold, writingDirection: 'rtl' },
  // `end` is the left side in this right-to-left app: the stamp sits opposite the text.
  stamp: { position: 'absolute', bottom: 18, end: 26, transform: [{ rotate: '14deg' }], opacity: 0.45 },
  devBox: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#FFF3DC66', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  devText: { fontFamily: f.body, fontSize: 12, color: '#FFF3DC99', writingDirection: 'rtl' },
  spacer: { flex: 1 },
  signOut: { minHeight: 54, borderRadius: 16, borderWidth: 1.5, borderColor: '#FFF3DC73', alignItems: 'center', justifyContent: 'center' },
  signOutLabel: { fontFamily: f.bold, fontSize: 18, color: c.cream, writingDirection: 'rtl' },
  deleteLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  deleteLabel: { fontFamily: f.bold, fontSize: 15, color: '#FF8A73', textDecorationLine: 'underline', writingDirection: 'rtl' },
  deletingLabel: { fontFamily: f.bold, fontSize: 15, color: '#FFF3DCB3', writingDirection: 'rtl' },
});
