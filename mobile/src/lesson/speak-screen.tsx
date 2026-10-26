import { type ReactNode, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { type AudioSource, getRecordingPermissionsAsync } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { retro } from '../theme';
import { LessonAudioButton, LessonButton, LessonButtonRow, LessonRecordButton, LessonSaveError, LessonSecondaryButton, MicIcon, type SaveState } from './lesson-button';
import { LearnerBadge } from './lesson-avatar';
import { LessonHeader } from './lesson-header';
import type { ComparisonMode } from './opening-data';
import { usePlayback } from './playback';
import { useSelfRecording } from './recording';

// Speak and compare (Figma "Template / Speak" 87:1543, approved by Dor 2026-10-26):
// the learner says the line, records it, and listens to the take next to the model.
// Without a microphone (refused, or by choice) they say it aloud and the model is
// revealed. Either way "ממשיכים" reports only that they compared; there is no score.
// The take stays on the device. A step seen again through "חזרה" opens on the model.
const c = retro.colors;
const f = retro.fonts;

export type SpeakContent = { id: string; promptHe: string; modelTextEs: string; modelNoteHe: string | null; alternativeHe: string };

type Props = {
  content: SpeakContent; audio: AudioSource | null; header: { code: string; index: number; count: number };
  reviewOnly: boolean; save: SaveState; onCompare: (mode: ComparisonMode) => void; onBack: () => void; onClose: () => void;
};

type Phase = 'ready' | 'recording' | 'recorded' | 'model' | 'denied';

export function SpeakScreen({ content, audio, header, reviewOnly, save, onCompare, onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const column = Math.min(windowWidth, 600) - 40;
  const gutter = (windowWidth - column) / 2;
  const take = useSelfRecording();
  const [phase, setPhase] = useState<Phase>(reviewOnly ? 'model' : 'ready');
  const [canAskAgain, setCanAskAgain] = useState(false);
  const [modelPlaying, setModelPlaying] = useState(false);

  // Only one sound at a time: the model stops the take (the take stops the model below).
  const pauseTake = take.pause;
  useEffect(() => { if (modelPlaying) pauseTake(); }, [modelPlaying, pauseTake]);

  // Back from the device settings with access granted: offer recording again.
  useEffect(() => {
    if (phase !== 'denied') return;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      void getRecordingPermissionsAsync().then(p => { if (p.granted) setPhase('ready'); }).catch(() => {});
    });
    return () => subscription.remove();
  }, [phase]);

  async function record() {
    const result = await take.start();
    if (result === 'recording') setPhase('recording');
    else if (result !== 'failed') { setCanAskAgain(result.canAskAgain); setPhase('denied'); }
  }
  async function stop() {
    setPhase(await take.stop() ? 'recorded' : 'ready');
  }

  const model = <ModelCard textEs={content.modelTextEs} noteHe={content.modelNoteHe} audio={audio}
    takePlaying={take.playing} onPlayingChange={setModelPlaying} />;
  const footer = { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, 20) };
  const continueRow = (mode: ComparisonMode) => <LessonButtonRow>
    {/* Right to left: back on the right, the main action on the left. */}
    <View style={styles.back}><LessonSecondaryButton label="חזרה" disabled={save.busy} onPress={onBack} /></View>
    <View style={styles.next}><LessonButton label="ממשיכים" busy={save.busy} onPress={() => onCompare(mode)} /></View>
  </LessonButtonRow>;

  return <View style={styles.root}>
    <StatusBar style="light" />
    <LessonHeader code={header.code} index={header.index} count={header.count} onClose={onClose} topInset={insets.top} />
    <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
      <Text accessibilityRole="header" style={styles.prompt}>{content.promptHe}</Text>
      <View style={styles.activity}>
        {phase === 'ready' ? <>
          <Disc label="הקלטה" color={c.sunset} disabled={take.busy} onPress={() => { void record(); }}>
            <MicIcon size={48} color={c.plum} />
          </Disc>
          <Pressable accessibilityRole="button" accessibilityLabel={content.alternativeHe} onPress={() => setPhase('model')}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
            <Text style={styles.chipLabel}>{content.alternativeHe}</Text>
          </Pressable>
        </> : phase === 'recording' ? <>
          <View style={styles.status} accessibilityLiveRegion="polite">
            <View style={styles.redDot} />
            <Text style={styles.statusText}>מקליטים… {Math.floor(take.recordedMillis / 1000)} שניות</Text>
            <Text style={styles.clock}>{clock(take.recordedMillis)}</Text>
          </View>
          <Disc label="עצירת הקלטה" color={c.stamp} rings disabled={take.busy} onPress={() => { void stop(); }}>
            <Svg width={38} height={38} viewBox="0 0 38 38" accessible={false}>
              <Path d="M24.5417 9.5H13.4583C11.2722 9.5 9.5 11.2722 9.5 13.4583V24.5417C9.5 26.7278 11.2722 28.5 13.4583 28.5H24.5417C26.7278 28.5 28.5 26.7278 28.5 24.5417V13.4583C28.5 11.2722 26.7278 9.5 24.5417 9.5Z" fill={c.cream} />
            </Svg>
          </Disc>
          <Bars heights={LEVEL} width={5} gap={4} radius={3} played={LEVEL.length} />
        </> : phase === 'recorded' ? <>
          <Text style={styles.instruction}>הקשיבו להקלטה שלכם ולדוגמה. אפשר לנסות שוב.</Text>
          <View style={styles.mine}>
            <Pressable accessibilityRole="button" accessibilityLabel={take.playing ? 'עצירת ההקלטה' : 'השמעת ההקלטה'}
              accessibilityState={{ disabled: !take.loaded || take.busy }} disabled={!take.loaded || take.busy}
              onPress={() => { void take.togglePlayback(); }}
              style={({ pressed }) => [styles.playMine, (!take.loaded || take.busy) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.playMineLabel}>{take.playing ? 'עצירת ההקלטה' : 'השמעת ההקלטה'}</Text>
              <PlayIcon playing={take.playing} size={16} color={c.night} />
            </Pressable>
            {/* Like a media scrubber, the take plays from left to right. */}
            <View style={styles.wave}><Bars heights={WAVE} width={4} gap={3} radius={2} played={Math.round(take.progress * WAVE.length)} /></View>
            <Text style={styles.clock}>{clock(take.takeSeconds * 1000)}</Text>
          </View>
          {model}
        </> : phase === 'model' ? model
          : <View style={styles.alert}>
            <View style={styles.alertTitleRow}>
              <Text accessibilityRole="alert" style={styles.alertTitle}>נדרשת גישה למיקרופון</Text>
              <MicOffIcon />
            </View>
            <Text style={styles.alertBody}>{canAskAgain ? 'כדי להקליט את עצמכם, צריך לאשר גישה למיקרופון.' : 'אפשר לאפשר גישה למיקרופון בהגדרות המכשיר.'}</Text>
            <SheetButton label={canAskAgain ? 'לאשר גישה' : 'פתיחת הגדרות'} filled
              onPress={() => { if (canAskAgain) void record(); else void Linking.openSettings().catch(() => {}); }} />
            <SheetButton label={content.alternativeHe} onPress={() => setPhase('model')} />
          </View>}
        {take.failure && phase !== 'recording' ? <Text accessibilityRole="alert" style={styles.failure}>{take.failure}</Text> : null}
      </View>
    </ScrollView>
    {phase === 'recording' ? <View style={{ height: footer.paddingBottom }} />
      : <View style={[styles.footer, footer]}>
        <LessonSaveError message={save.errorHe} />
        {phase === 'ready' ? <>
          <Text style={styles.note}>ההקלטה נשמרת זמנית במכשיר שלך.</Text>
          <LessonSecondaryButton label="חזרה" onPress={onBack} />
        </> : phase === 'recorded' ? <>
          <LessonSecondaryButton label="להקליט שוב" disabled={take.busy || save.busy} onPress={() => { void record(); }} />
          {continueRow('recording')}
        </> : phase === 'model' ? <>
          <LessonRecordButton label="הקלטה" disabled={take.busy || save.busy} onPress={() => { void record(); }} />
          {continueRow('without_microphone')}
        </> : <LessonSecondaryButton label="חזרה" onPress={onBack} />}
      </View>}
  </View>;
}

const LEVEL = [14, 26, 18, 34, 22, 30, 12, 28, 20, 34, 16, 24, 30, 14];
const WAVE = [10, 18, 26, 14, 30, 22, 12, 24, 28, 16, 20, 10, 26, 18];

// 2500 -> "00:02".
export function clock(millis: number) {
  const seconds = Math.max(0, Math.floor(millis / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// The model line (Figma Speak "Model" 87:1344): the learner badge, the Spanish, and its
// recording. Without a recording the play button is disabled.
function ModelCard({ textEs, noteHe, audio, takePlaying, onPlayingChange }: {
  textEs: string; noteHe: string | null; audio: AudioSource | null; takePlaying: boolean; onPlayingChange: (playing: boolean) => void;
}) {
  return <>
    <View style={styles.model}>
      {/* Right to left: the badge on the right, the play button on the left. */}
      <LearnerBadge size={48} />
      <Text selectable accessibilityLanguage="es-MX" style={styles.modelText}>{textEs}</Text>
      {audio ? <ModelPlay source={audio} takePlaying={takePlaying} onPlayingChange={onPlayingChange} />
        : <View style={styles.modelPlay}><LessonAudioButton label="השמעה" playing={false} disabled onPress={() => {}} /></View>}
    </View>
    {noteHe ? <Text style={styles.instruction}>{noteHe}</Text> : null}
  </>;
}

function ModelPlay({ source, takePlaying, onPlayingChange }: { source: AudioSource; takePlaying: boolean; onPlayingChange: (playing: boolean) => void }) {
  const playback = usePlayback(source);
  const { playing, pause } = playback;
  useEffect(() => { onPlayingChange(playing); }, [playing, onPlayingChange]);
  useEffect(() => { if (takePlaying) pause(); }, [takePlaying, pause]);
  if (playback.failure) return <View style={styles.modelPlay}><LessonAudioButton label="טעינה" playing={false} onPress={playback.reload} /></View>;
  return <View style={styles.modelPlay}>
    <LessonAudioButton label={playing ? 'עצירה' : 'השמעה'} playing={playing} disabled={!playback.loaded} busy={playback.busy} onPress={playback.toggle} />
  </View>;
}

// The 124pt record or stop disc with its label underneath. While recording, two rings
// surround it.
function Disc({ label, color, rings = false, disabled, onPress, children }: {
  label: string; color: string; rings?: boolean; disabled: boolean; onPress: () => void; children: ReactNode;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.discStack, pressed && styles.pressed]}>
    <View style={[styles.disc, { backgroundColor: color }]}>
      {rings ? <View pointerEvents="none" style={styles.rings}>
        <Svg width={178} height={178} viewBox="0 0 178 178" accessible={false}>
          <Circle cx={89} cy={89} r={73} stroke={c.stamp} strokeWidth={4} fill="none" />
          <Circle cx={89} cy={89} r={87} stroke={c.stamp} strokeWidth={4} fill="none" />
        </Svg>
      </View> : null}
      {children}
    </View>
    <Text style={styles.discLabel}>{label}</Text>
  </Pressable>;
}

// Decorative sound bars. played: how many, from the left, are gold; the rest are cream.
function Bars({ heights, width, gap, radius, played }: { heights: number[]; width: number; gap: number; radius: number; played: number }) {
  return <View accessible={false} style={[styles.bars, { gap }]}>
    {heights.map((h, i) => <View key={i} style={{ width, height: h, borderRadius: radius, backgroundColor: i < played ? c.gold : c.cream }} />)}
  </View>;
}

function PlayIcon({ playing, size, color }: { playing: boolean; size: number; color: string }) {
  // Media icons keep pointing right in a right-to-left layout, as on iOS.
  return <Svg width={size} height={size} viewBox="0 0 20 20" accessible={false}>
    {playing ? <>
      <Path d="M5 4.17h3.33v11.67H5z" fill={color} />
      <Path d="M11.67 4.17H15v11.67h-3.33z" fill={color} />
    </> : <Path d="M5.83333 3.75V16.25L15.8333 10L5.83333 3.75Z" fill={color} />}
  </Svg>;
}

// Figma "Icon / Mic off" 77:276.
function MicOffIcon() {
  return <Svg width={28} height={28} viewBox="0 0 28 28" fill="none" accessible={false}>
    <Path d="M14 3.5C15.933 3.5 17.5 5.067 17.5 7V12.8333C17.5 14.7663 15.933 16.3333 14 16.3333C12.067 16.3333 10.5 14.7663 10.5 12.8333V7C10.5 5.067 12.067 3.5 14 3.5Z" strokeWidth={2.2} stroke={c.plum} />
    <Path d="M6.41667 12.8333C6.41667 14.8446 7.21562 16.7734 8.63777 18.1956C10.0599 19.6177 11.9888 20.4167 14 20.4167M14 20.4167C15.7343 20.4167 17.4074 19.8226 18.7471 18.7471M14 20.4167V24.5M18.7471 18.7471C18.961 18.5754 19.1664 18.3914 19.3622 18.1956C20.7844 16.7734 21.5833 14.8446 21.5833 12.8333M18.7471 18.7471L3.5 3.5M18.7471 18.7471L24.5 24.5"
      strokeWidth={2.2} strokeLinecap="round" stroke={c.plum} />
  </Svg>;
}

// The buttons on the pink microphone sheet (Figma 87:1539, 87:1541): plum filled or outlined.
function SheetButton({ label, filled = false, onPress }: { label: string; filled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.sheetButton, filled ? styles.sheetFilled : styles.sheetOutline, pressed && styles.pressed]}>
    <Text style={[styles.sheetLabel, { color: filled ? c.cream : c.plum }]}>{label}</Text>
  </Pressable>;
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 12 } };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night },
  content: { paddingTop: 12, paddingBottom: 24, gap: 12 },
  prompt: { fontFamily: f.bold, fontSize: 20, lineHeight: 30, color: c.cream, writingDirection: 'rtl' },
  activity: { gap: 16, alignItems: 'center' },
  discStack: { alignItems: 'center', gap: 8, paddingTop: 4 },
  disc: { width: 124, height: 124, borderRadius: 62, borderWidth: 5, borderColor: c.cream, alignItems: 'center', justifyContent: 'center', ...shadow },
  rings: { position: 'absolute', top: -32, left: -32 },
  discLabel: { fontFamily: f.bold, fontSize: 18, lineHeight: 24, color: c.cream, textAlign: 'center', writingDirection: 'rtl' },
  chip: { minHeight: 44, borderRadius: 22, borderWidth: 1.5, borderColor: c.cream, paddingHorizontal: 18, justifyContent: 'center' },
  chipLabel: { fontFamily: f.bold, fontSize: 15, lineHeight: 24, color: c.cream, textAlign: 'center', writingDirection: 'rtl' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.stamp },
  statusText: { fontFamily: f.bold, fontSize: 17, lineHeight: 24, color: c.cream, writingDirection: 'rtl' },
  clock: { fontFamily: f.mono, fontSize: 12, lineHeight: 14, letterSpacing: 1.5, color: c.gold, writingDirection: 'ltr' },
  bars: { flexDirection: 'row', alignItems: 'center', direction: 'ltr' },
  instruction: { alignSelf: 'stretch', fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.cream, writingDirection: 'rtl' },
  mine: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: c.cream,
  },
  playMine: { height: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: c.cream, flexDirection: 'row', alignItems: 'center', gap: 6 },
  playMineLabel: { fontFamily: f.bold, fontSize: 15, lineHeight: 24, color: c.night, writingDirection: 'rtl' },
  wave: { flex: 1, overflow: 'hidden' },
  model: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: c.cream,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 11, shadowOffset: { width: 0, height: 12 },
  },
  // Spanish reads left to right and sits next to the play button.
  modelText: { flex: 1, fontFamily: f.poster, fontSize: 46, lineHeight: 50, color: c.night, textAlign: 'left', writingDirection: 'ltr' },
  modelPlay: { width: 116 },
  alert: { alignSelf: 'stretch', backgroundColor: c.pink, borderRadius: 20, paddingTop: 18, paddingBottom: 20, paddingHorizontal: 18, gap: 10 },
  alertTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertTitle: { fontFamily: f.bold, fontSize: 20, lineHeight: 28, color: c.plum, writingDirection: 'rtl' },
  alertBody: { fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.plum, writingDirection: 'rtl' },
  sheetButton: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  sheetFilled: { backgroundColor: c.plum },
  sheetOutline: { borderWidth: 1.5, borderColor: c.plum },
  sheetLabel: { fontFamily: f.bold, fontSize: 16, lineHeight: 24, textAlign: 'center', writingDirection: 'rtl' },
  failure: { alignSelf: 'stretch', fontFamily: f.medium, fontSize: 15, lineHeight: 22, color: c.pink, textAlign: 'center', writingDirection: 'rtl' },
  note: { fontFamily: f.body, fontSize: 14, lineHeight: 26, color: c.cream, opacity: 0.75, textAlign: 'center', writingDirection: 'rtl' },
  footer: { paddingTop: 16, gap: 12 },
  back: { flex: 1 },
  next: { flex: 2 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
