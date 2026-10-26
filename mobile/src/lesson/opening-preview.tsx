import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AttemptResult, Progress } from '../../../content/src/progress-types';
import { fetchUnit, startUnit, submitAttempt, type UnitFailure } from '../api/units';
import { supabase } from '../auth/supabase';
import { theme as t } from '../theme';
import { DialogueScreen } from './dialogue-screen';
import { EntryScreen } from './entry-screen';
import { ExplanationScreen } from './explanation-screen';
import type { SaveState } from './lesson-button';
import { audioFor, faceCropFor, imageFor } from './media';
import { ListenSelectScreen } from './listen-select-screen';
import { SpeakScreen } from './speak-screen';
import { activityCode, attemptRequest, type ComparisonMode, frontierIndex, type LessonRequest, type LessonResponse, moveOpeningStep, openingSteps, restorablePending, sameTap, type OpeningStep, unitCodes } from './opening-data';
import { clearPending, readPending, savePending } from './pending-store';
import { VocabularyCardScreen } from './vocabulary-card-screen';

const failureMessages: Record<UnitFailure, string> = {
  not_configured: 'כתובת השרת לא הוגדרה (EXPO_PUBLIC_API_URL ב-mobile/.env.local).',
  unreachable: 'לא הצלחנו להתחבר לשרת. בדקו שהוא רץ ושהטלפון והמחשב באותה רשת.',
  unauthorized: 'השרת לא אישר את החיבור לחשבון. נסו להתנתק ולהתחבר שוב.',
  not_found: 'היחידה לא נמצאה בשרת.',
  conflict: 'ההתקדמות השתנתה בזמן הטעינה. נסו שוב.',
  server: 'השרת החזיר שגיאה. בדקו את הלוג שלו.',
};

// A tap the server did not confirm. The same request is resent on the next tap.
const saveMessages: Record<UnitFailure, string> = {
  not_configured: failureMessages.not_configured,
  unreachable: 'לא הצלחנו לשמור. בדקו את החיבור ונסו שוב.',
  unauthorized: 'החיבור לחשבון פג. נסו להתנתק ולהתחבר שוב.',
  not_found: 'היחידה לא נמצאה בשרת.',
  conflict: 'ההתקדמות התעדכנה ממקום אחר. ממשיכים מהנקודה השמורה.',
  server: 'השרת לא הצליח לשמור. נסו שוב בעוד רגע.',
};

// Read the session at request time: getSession refreshes an expired token,
// and a token refresh must not restart the lesson.
async function currentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ? { token: data.session.access_token, userId: data.session.user.id } : null;
}
const accessToken = async () => (await currentSession())?.token ?? null;
const apiUrl = () => process.env.EXPO_PUBLIC_API_URL;

function Action({ title, onPress, secondary = false }: { title: string; onPress: () => void; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => [styles.action, secondary && styles.secondaryAction, { opacity: pressed ? 0.75 : 1 }]}>
    <Text style={[styles.actionLabel, secondary && styles.secondaryLabel]}>{title}</Text>
  </Pressable>;
}

type Ready = { unitId: string; userId: string; activityCount: number; steps: OpeningStep[]; progress: Progress;
  restored: LessonRequest | null };
type Load = { status: 'loading' } | { status: 'failed'; reason: UnitFailure } | ({ status: 'ready' } & Ready);

type PreviewProps = { onOpenRecorder: () => void; onOpenAccount?: () => void; onClose: () => void };

export default function OpeningPreview(props: PreviewProps) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await currentSession();
      if (!session) { if (active) setLoad({ status: 'failed', reason: 'unauthorized' }); return; }
      const { token, userId } = session;
      // The content, then where this learner stands. Start is safe to repeat: it
      // returns the saved progress, so reopening the lesson resumes it.
      const unit = await fetchUnit(apiUrl(), 'C01-U01', token);
      if (!unit.ok) { if (active) setLoad({ status: 'failed', reason: unit.reason }); return; }
      const started = await startUnit(apiUrl(), unit.unit.id, token);
      if (!active) return;
      if (!started.ok) { setLoad({ status: 'failed', reason: started.reason }); return; }
      // A tap left unconfirmed when the app closed; dropped if it no longer fits.
      const saved = await readPending(unit.unit.id);
      const restored = restorablePending(saved, userId, unit.unit.id, started.progress);
      if (saved && !restored) await clearPending(unit.unit.id);
      if (!active) return;
      setLoad({ status: 'ready', unitId: unit.unit.id, userId, activityCount: unit.unit.activities.length,
        steps: openingSteps(unit.unit), progress: started.progress, restored });
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

function PreviewSteps({ unitId, userId, activityCount, steps, progress: initial, restored, onOpenRecorder, onOpenAccount, onClose }: PreviewProps & Ready) {
  // The server's progress is the truth; index is only what is on screen. "חזרה" moves
  // the view back without touching the saved progress (approved by Dor, 2026-10-25).
  const [progress, setProgress] = useState(initial);
  const frontier = frontierIndex(steps, progress);
  const [index, setIndex] = useState(frontier);
  const [save, setSave] = useState<SaveState>({ busy: false, errorHe: null });
  // The tap the server has not confirmed yet, also kept in the Keychain so that a
  // resend after closing the app reuses its requestId.
  const pending = useRef<LessonRequest | null>(restored);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const step = steps[index];

  // follow: move the screen to where the server now stands. An answer stays on its
  // screen to show the feedback; "ממשיכים" moves on from there.
  const send = async (request: LessonRequest, follow: boolean): Promise<AttemptResult | null> => {
    // Saved before it leaves the phone: the server may store it even if its answer is lost.
    await savePending({ userId, unitId, request });
    const token = await accessToken();
    const sent = token ? await submitAttempt(apiUrl(), unitId, token, request) : { ok: false as const, reason: 'unauthorized' as const };
    // Confirmed or refused, the server has settled this tap: forget it, even if the
    // learner already left the lesson.
    if (sent.ok || sent.reason === 'conflict') await clearPending(unitId);
    if (!mounted.current) return null;
    if (sent.ok) {
      pending.current = null;
      setProgress(sent.result.progress);
      if (follow) setIndex(frontierIndex(steps, sent.result.progress));
      setSave({ busy: false, errorHe: null });
      return sent.result;
    }
    if (sent.reason === 'conflict' && token) {
      // Saved elsewhere first (another phone, or a lost answer to an earlier tap):
      // drop this request and continue from what the server holds.
      pending.current = null;
      const saved = await startUnit(apiUrl(), unitId, token);
      if (!mounted.current) return null;
      if (saved.ok) { setProgress(saved.progress); setIndex(frontierIndex(steps, saved.progress)); }
    }
    setSave({ busy: false, errorHe: saveMessages[sent.reason] });
    return null;
  };

  // A tap on the current activity. Repeating the unconfirmed tap resends the very same
  // request, so the server counts it once; a different tap gets a new requestId.
  const tap = (response: LessonResponse, follow: boolean) => {
    if (save.busy || progress.status !== 'in_progress' || !progress.currentActivityId) return Promise.resolve(null);
    const current = { ...progress, currentActivityId: progress.currentActivityId };
    const request = pending.current && sameTap(pending.current, current, response) ? pending.current
      : attemptRequest(current, Crypto.randomUUID(), response);
    pending.current = request;
    setSave({ busy: true, errorHe: null });
    return send(request, follow);
  };

  const advance = () => {
    if (save.busy) return;
    // Reviewing an earlier step: view only, nothing to save.
    if (index < frontier) { setIndex(current => moveOpeningStep(current, 'next', steps.length)); return; }
    void tap({ kind: 'continue' }, true);
  };
  // Speaking: the learner compared their line with the model, by recording or aloud.
  // There is no outcome to show, so a confirmed comparison moves on like "continue".
  const compare = (mode: ComparisonMode) => {
    if (save.busy) return;
    if (index < frontier) { setIndex(current => moveOpeningStep(current, 'next', steps.length)); return; }
    void tap({ kind: 'self_comparison', mode, compared: true }, true);
  };
  const back = () => { if (!save.busy) setIndex(current => moveOpeningStep(current, 'back', steps.length)); };
  // A save error belongs to the step where the tap happened.
  const shownSave = index === frontier ? save : { busy: false, errorHe: null };
  const header = { code: activityCode(unitId, index, activityCount), index, count: activityCount };
  // Safe areas are padded by hand: with 'automatic' insets iOS shifted the
  // full-height content down by the top inset, pushing the footer under the
  // home indicator.
  const insets = useSafeAreaInsets();

  if (step?.type === 'entry') return <EntryScreen content={step} scene={imageFor(step.sceneAssetId, step.sceneUrl)}
    unitCode={unitCodes(unitId)} headerCode={header.code} index={index} count={activityCount}
    save={shownSave} onStart={advance} onClose={onClose} />;

  if (step?.type === 'vocabulary') {
    const cards = steps.filter(s => s.type === 'vocabulary');
    const avatarSource = step.characterImageAssetId ? imageFor(step.characterImageAssetId, step.characterImageUrl) : null;
    const crop = step.characterImageAssetId ? faceCropFor(step.characterImageAssetId) : null;
    // The preview stops after the cards; "סיום הסקירה" is a development label only.
    return <VocabularyCardScreen key={step.id} card={step} header={header}
      position={{ index: cards.indexOf(step), count: cards.length }}
      avatar={avatarSource && crop ? { source: avatarSource, crop } : null}
      audio={audioFor(step.audioAssetId, step.audioUrl)}
      nextLabel={index === steps.length - 1 ? 'סיום הסקירה' : steps[index + 1]?.type === 'vocabulary' ? 'הביטוי הבא' : 'ממשיכים'}
      save={shownSave} onNext={advance} onBack={back} onClose={onClose} />;
  }

  if (step?.type === 'explanation') return <ExplanationScreen key={step.id} content={step} header={header}
    audio={step.examples.map(e => e.audioAssetId ? audioFor(e.audioAssetId, e.audioUrl) : null)}
    save={shownSave} onNext={advance} onBack={back} onClose={onClose} />;

  if (step?.type === 'dialogue') return <DialogueScreen key={step.id} content={step} header={header}
    avatars={step.turns.map(turn => {
      const source = turn.imageAssetId ? imageFor(turn.imageAssetId, turn.imageUrl) : null;
      const crop = turn.imageAssetId ? faceCropFor(turn.imageAssetId) : null;
      return source && crop ? { source, crop } : null;
    })}
    audio={step.turns.map(turn => audioFor(turn.audioAssetId, turn.audioUrl))}
    save={shownSave} onNext={advance} onBack={back} onClose={onClose} />;

  if (step?.type === 'speak') return <SpeakScreen key={step.id} content={step} header={header}
    audio={audioFor(step.audioAssetId, step.audioUrl)} reviewOnly={index < frontier} save={shownSave}
    onCompare={compare} onBack={back} onClose={onClose} />;

  if (step?.type === 'listen_select') {
    const avatarSource = step.characterImageAssetId ? imageFor(step.characterImageAssetId, step.characterImageUrl) : null;
    const crop = step.characterImageAssetId ? faceCropFor(step.characterImageAssetId) : null;
    // Before the server confirms the answer the check is current; once solved (or seen
    // again through "חזרה") it is behind the frontier and only "ממשיכים" remains.
    return <ListenSelectScreen key={step.id} content={step} header={header} unitShort={unitCodes(unitId).short}
      avatar={avatarSource && crop ? { source: avatarSource, crop } : null}
      audio={audioFor(step.audioAssetId, step.audioUrl)} reviewOnly={index < frontier} save={shownSave}
      onAnswer={response => tap(response, false)}
      onContinue={() => setIndex(current => moveOpeningStep(current, 'next', steps.length))} onBack={back} onClose={onClose} />;
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
          <Text style={styles.body}>ראינו את הכניסה, את הכנת המילים, את הבדיקות, את השיחה ואת תרגול הדיבור. שאר התרגולים יתחברו בהמשך.</Text>
          <Text style={styles.note}>זו סקירת פיתוח. ההתקדמות נשמרת בחשבון, ומכאן היא תמשיך כשהמסך הבא ייבנה.</Text>
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
