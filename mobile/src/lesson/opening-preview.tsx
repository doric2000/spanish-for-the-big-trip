import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchUnit, type UnitFailure } from '../api/units';
import { supabase } from '../auth/supabase';
import { theme as t } from '../theme';
import { EntryScreen } from './entry-screen';
import { audioFor, faceCropFor, imageFor } from './media';
import { activityCode, moveOpeningStep, openingSteps, type OpeningStep, unitCodes } from './opening-data';
import { VocabularyCardScreen } from './vocabulary-card-screen';

const failureMessages: Record<UnitFailure, string> = {
  not_configured: 'כתובת השרת לא הוגדרה (EXPO_PUBLIC_API_URL ב-mobile/.env.local).',
  unreachable: 'לא הצלחנו להתחבר לשרת. בדקו שהוא רץ ושהטלפון והמחשב באותה רשת.',
  unauthorized: 'השרת לא אישר את החיבור לחשבון. נסו להתנתק ולהתחבר שוב.',
  not_found: 'היחידה לא נמצאה בשרת.',
  server: 'השרת החזיר שגיאה. בדקו את הלוג שלו.',
};

function Action({ title, onPress, secondary = false }: { title: string; onPress: () => void; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => [styles.action, secondary && styles.secondaryAction, { opacity: pressed ? 0.75 : 1 }]}>
    <Text style={[styles.actionLabel, secondary && styles.secondaryLabel]}>{title}</Text>
  </Pressable>;
}

type Ready = { unitId: string; activityCount: number; steps: OpeningStep[] };
type Load = { status: 'loading' } | { status: 'failed'; reason: UnitFailure } | ({ status: 'ready' } & Ready);

type PreviewProps = { onOpenRecorder: () => void; onOpenAccount?: () => void; onClose: () => void };

export default function OpeningPreview(props: PreviewProps) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      // Read the session at request time: getSession refreshes an expired token,
      // and a token refresh must not restart the lesson.
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const result = token ? await fetchUnit(process.env.EXPO_PUBLIC_API_URL, 'C01-U01', token)
        : { ok: false as const, reason: 'unauthorized' as const };
      if (!active) return;
      setLoad(result.ok
        ? { status: 'ready', unitId: result.unit.id, activityCount: result.unit.activities.length, steps: openingSteps(result.unit) }
        : { status: 'failed', reason: result.reason });
    })();
    return () => { active = false; };
  }, [attempt]);

  if (load.status === 'ready') return <PreviewSteps {...load} {...props} />;
  return <View style={[styles.root, styles.centered]}>
    <StatusBar style="dark" />
    {load.status === 'loading' ? <>
      <ActivityIndicator color={t.colors.primary} />
      <Text style={styles.note}>טוענים את היחידה מהשרת…</Text>
    </> : <View style={styles.stack}>
      <Text accessibilityRole="alert" style={styles.error}>{failureMessages[load.reason]}</Text>
      <Action title="נסו שוב" onPress={() => { setLoad({ status: 'loading' }); setAttempt(n => n + 1); }} />
    </View>}
  </View>;
}

function PreviewSteps({ unitId, activityCount, steps, onOpenRecorder, onOpenAccount, onClose }: PreviewProps & Ready) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const advance = () => setIndex(current => moveOpeningStep(current, 'next', steps.length));
  const back = () => setIndex(current => moveOpeningStep(current, 'back', steps.length));
  const header = { code: activityCode(unitId, index, activityCount), index, count: activityCount };
  // Safe areas are padded by hand: with 'automatic' insets iOS shifted the
  // full-height content down by the top inset, pushing the footer under the
  // home indicator.
  const insets = useSafeAreaInsets();

  if (step?.type === 'entry') return <EntryScreen content={step} scene={imageFor(step.sceneAssetId, step.sceneUrl)}
    unitCode={unitCodes(unitId)} headerCode={header.code} index={index} count={activityCount}
    onStart={advance} onClose={onClose} />;

  if (step?.type === 'vocabulary') {
    const cards = steps.filter(s => s.type === 'vocabulary');
    const avatarSource = step.characterImageAssetId ? imageFor(step.characterImageAssetId, step.characterImageUrl) : null;
    const crop = step.characterImageAssetId ? faceCropFor(step.characterImageAssetId) : null;
    // The preview stops after the cards; "סיום הסקירה" is a development label only.
    return <VocabularyCardScreen key={step.id} card={step} header={header}
      position={{ index: cards.indexOf(step), count: cards.length }}
      avatar={avatarSource && crop ? { source: avatarSource, crop } : null}
      audio={audioFor(step.audioAssetId, step.audioUrl)}
      nextLabel={index === steps.length - 1 ? 'סיום הסקירה' : 'הביטוי הבא'}
      onNext={advance} onBack={back} onClose={onClose} />;
  }

  // The end of the supported prefix: a development boundary, not lesson completion.
  return <>
    <StatusBar style="dark" />
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.page, { paddingTop: insets.top + t.space.xl, paddingBottom: insets.bottom + t.space.lg }]}>
      <View style={styles.stack}>
        <View style={styles.topRow}>
          <Text style={styles.previewLabel}>סקירת פתיחה · 1A</Text>
          {onOpenAccount ? <Pressable accessibilityRole="button" onPress={onOpenAccount} hitSlop={12}>
            <Text style={styles.link}>החשבון שלי</Text>
          </Pressable> : null}
        </View>
        {steps.length ? <>
          <Text accessibilityRole="header" style={styles.title}>סיימתם את מקטע הסקירה</Text>
          <Text style={styles.body}>ראינו את הכניסה ואת הכנת המילים. השיחה והתרגולים יתחברו בהמשך.</Text>
          <Text style={styles.note}>זו סקירת פיתוח מקומית. היחידה עדיין אינה מלאה, ואין כאן שמירת התקדמות בחשבון.</Text>
        </> : <Text accessibilityRole="alert" style={styles.error}>לא נמצאו מסכים לסקירה.</Text>}
      </View>
      <View style={styles.footer}>
        {steps.length ? <Action title="חזרה לתחילת הסקירה" onPress={() => setIndex(0)} /> : null}
        <Action title="תרגול הקלטה" onPress={onOpenRecorder} secondary={steps.length > 0} />
      </View>
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.colors.background },
  centered: { justifyContent: 'center', alignItems: 'center', padding: t.space.lg, gap: t.space.md },
  page: { flexGrow: 1, padding: t.space.lg, gap: t.space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  stack: { gap: t.space.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontSize: t.type.small, color: t.colors.primary, fontWeight: '600', writingDirection: 'rtl' },
  previewLabel: { fontSize: t.type.small, color: t.colors.muted, writingDirection: 'rtl' },
  title: { fontSize: t.type.title, fontWeight: '700', color: t.colors.ink, writingDirection: 'rtl' },
  body: { fontSize: t.type.body, lineHeight: 30, color: t.colors.muted, writingDirection: 'rtl' },
  note: { fontSize: t.type.small, color: t.colors.muted, writingDirection: 'rtl' },
  error: { fontSize: t.type.body, color: t.colors.danger, writingDirection: 'rtl' },
  footer: { marginTop: 'auto', paddingTop: t.space.xl, paddingBottom: t.space.md, gap: t.space.sm },
  action: { backgroundColor: t.colors.primary, borderRadius: t.radius.button, minHeight: t.touchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: t.space.lg, paddingVertical: t.space.md },
  secondaryAction: { backgroundColor: t.colors.soft },
  actionLabel: { fontSize: t.type.body, fontWeight: '600', color: t.colors.onPrimary, textAlign: 'center', writingDirection: 'rtl' },
  secondaryLabel: { color: t.colors.primary },
});
