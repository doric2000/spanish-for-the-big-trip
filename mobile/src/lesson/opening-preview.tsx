import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import type { Unit } from '../../../content/src/schema';
import source from '../../../content/units/unit1a.json';
import { theme as t } from '../theme';
import { moveOpeningStep, openingSteps } from './opening-data';

const steps = openingSteps(source as Unit);
const vocabularyCount = steps.filter(step => step.type === 'vocabulary').length;
const scenePath = 'assets/characters/juan/scenes/unit1a-entry-hostel-v1.png';
const approvedScene = require('../../../assets/characters/juan/scenes/unit1a-entry-hostel-v1.png');
const audioPath = 'assets/characters/juan/voice/unit1a-buenos-dias-audition-v4/buenos-dias.mp3';
const approvedAudio = require('../../../assets/characters/juan/voice/unit1a-buenos-dias-audition-v4/buenos-dias.mp3');

function Action({ title, onPress, secondary = false, disabled = false, busy = false }: {
  title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
    onPress={onPress} style={({ pressed }) => [styles.action, secondary && styles.secondaryAction,
      { opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1 }]}>
    {busy ? <ActivityIndicator color={secondary ? t.colors.primary : t.colors.onPrimary} />
      : <Text style={[styles.actionLabel, secondary && styles.secondaryLabel]}>{title}</Text>}
  </Pressable>;
}

function Scene({ path }: { path: string | null }) {
  const [failed, setFailed] = useState(false);
  if (path !== scenePath || failed) return <Text accessibilityRole="alert" style={styles.note}>התמונה אינה זמינה כרגע.</Text>;
  return <Image source={approvedScene} style={styles.scene} resizeMode="cover"
    accessibilityLabel="חואן מברך אתכם בהוסטל" onError={() => setFailed(true)} />;
}

function ApprovedAudio() {
  const player = useAudioPlayer(approvedAudio, { keepAudioSessionActive: true });
  const status = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const actionInProgress = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  async function toggle() {
    if (actionInProgress.current) return;
    actionInProgress.current = true; setBusy(true); setError(null);
    try {
      if (player.playing) { player.pause(); return; }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
      if (!active.current) return;
      await player.seekTo(0);
      if (!active.current) return;
      player.muted = false; player.volume = 1; player.play();
    } catch {
      if (active.current) setError('לא הצלחנו להשמיע את הדוגמה. אפשר לטעון אותה שוב.');
    } finally {
      actionInProgress.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (error || status.error) return <View style={styles.stack}>
    <Text accessibilityRole="alert" style={styles.error}>{error ?? 'לא הצלחנו לטעון את הדוגמה.'}</Text>
    <Action title="טעינת השמע מחדש" secondary onPress={() => {
      setError(null);
      try { player.replace(approvedAudio); }
      catch { setError('הטעינה לא הצליחה. אפשר לנסות שוב.'); }
    }} />
  </View>;
  return <Action title={status.playing ? 'עצירת השמעה' : status.isLoaded ? 'השמעה' : 'טוענים את השמע…'}
    onPress={() => { void toggle(); }} secondary disabled={!status.isLoaded} busy={busy} />;
}

export default function OpeningPreview({ onOpenRecorder }: { onOpenRecorder: () => void }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const finishedPreview = index === steps.length;
  const vocabularyIndex = steps.slice(0, index + 1).filter(item => item.type === 'vocabulary').length;
  const advance = () => setIndex(current => moveOpeningStep(current, 'next', steps.length));
  return <>
    <StatusBar style="dark" />
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page} key={step?.id ?? 'preview-boundary'}>
      <View style={styles.stack}>
        <Text style={styles.previewLabel}>סקירת פתיחה · 1A</Text>
        <Text style={styles.chapter}>פרק ראשון</Text>
        {finishedPreview ? <>
          <Text accessibilityRole="header" style={styles.title}>סיימתם את מקטע הסקירה</Text>
          <Text style={styles.body}>ראינו את הכניסה ואת הכנת המילים. השיחה והתרגולים יתחברו בהמשך.</Text>
          <Text style={styles.note}>זו סקירת פיתוח מקומית. היחידה עדיין אינה מלאה, ואין כאן שמירת התקדמות בחשבון.</Text>
        </> : step?.type === 'entry' ? <>
          <Text accessibilityRole="header" style={styles.title}>{step.titleHe}</Text>
          <Scene path={step.scenePath} />
          <Text style={styles.body}>{step.bodyHe}</Text>
        </> : step?.type === 'vocabulary' ? <>
          <Text accessibilityRole="header" style={styles.title}>המילים שנצטרך</Text>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.note}>{step.characterNameHe}</Text>
              <Text style={styles.note}>{vocabularyIndex} מתוך {vocabularyCount}</Text>
            </View>
            <Text selectable style={styles.expression}>{step.expressionEs}</Text>
            <Text style={styles.meaning}>{step.meaningHe}</Text>
            {step.audioPath === audioPath ? <ApprovedAudio key={step.id} />
              : <Text style={styles.note}>השמע לביטוי הזה עדיין בהכנה.</Text>}
          </View>
        </> : <Text accessibilityRole="alert" style={styles.error}>לא נמצאו מסכים לסקירה.</Text>}
      </View>
      <View style={styles.footer}>
        {finishedPreview ? <>
          <Action title="חזרה לתחילת הסקירה" onPress={() => setIndex(0)} />
          <Action title="תרגול הקלטה" onPress={onOpenRecorder} secondary />
        </> : step ? <>
          <Action title={step.type === 'entry' ? step.actionLabelHe : index === steps.length - 1 ? 'סיום הסקירה' : 'לביטוי הבא'} onPress={advance} />
          {index > 0 && <Action title="חזרה" onPress={() => setIndex(current => moveOpeningStep(current, 'back', steps.length))} secondary />}
        </> : <Action title="תרגול הקלטה" onPress={onOpenRecorder} />}
      </View>
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.colors.background },
  page: { flexGrow: 1, padding: t.space.lg, paddingTop: t.space.xl, gap: t.space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  stack: { gap: t.space.md },
  previewLabel: { fontSize: t.type.small, color: t.colors.muted, textAlign: 'right', writingDirection: 'rtl' },
  chapter: { fontSize: t.type.small, color: t.colors.primary, textAlign: 'right', writingDirection: 'rtl' },
  title: { fontSize: t.type.title, fontWeight: '700', color: t.colors.ink, textAlign: 'right', writingDirection: 'rtl' },
  scene: { width: '100%', aspectRatio: 1.24, borderRadius: t.radius.card },
  body: { fontSize: t.type.body, lineHeight: 30, color: t.colors.muted, textAlign: 'right', writingDirection: 'rtl' },
  card: { backgroundColor: t.colors.surface, borderColor: t.colors.border, borderWidth: 1, borderRadius: t.radius.card, padding: t.space.lg, gap: t.space.lg },
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: t.space.md },
  expression: { fontSize: t.type.expression, fontWeight: '700', color: t.colors.ink, textAlign: 'center', writingDirection: 'ltr', paddingTop: t.space.lg },
  meaning: { fontSize: t.type.meaning, color: t.colors.muted, textAlign: 'center', writingDirection: 'rtl' },
  note: { fontSize: t.type.small, color: t.colors.muted, textAlign: 'right', writingDirection: 'rtl' },
  error: { fontSize: t.type.body, color: t.colors.danger, textAlign: 'right', writingDirection: 'rtl' },
  footer: { marginTop: 'auto', paddingTop: t.space.xl, paddingBottom: t.space.md, gap: t.space.sm },
  action: { backgroundColor: t.colors.primary, borderRadius: t.radius.button, minHeight: t.touchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: t.space.lg, paddingVertical: t.space.md },
  secondaryAction: { backgroundColor: t.colors.soft },
  actionLabel: { fontSize: t.type.body, fontWeight: '600', color: t.colors.onPrimary, textAlign: 'center', writingDirection: 'rtl' },
  secondaryLabel: { color: t.colors.primary },
});
