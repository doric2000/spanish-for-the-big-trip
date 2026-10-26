import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { AudioSource } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { retro } from '../theme';
import { LessonButton, LessonButtonRow, LessonSaveError, LessonSecondaryButton, type SaveState } from './lesson-button';
import { LessonHeader } from './lesson-header';
import { usePlayback } from './playback';

// Explanation (Figma "Template / Explanation" 119:2638, approved by Dor 2026-10-26):
// the rule on a cream card with a large ¿ mark, then each example as a ticket with the
// Spanish, its meaning, a rising-intonation arrow and its own play button. States
// Default, Playing and Audio error. Only one example plays at a time.
const c = retro.colors;
const f = retro.fonts;

export type ExplanationContent = { id: string; titleHe: string; generalHe: string; examples: { textEs: string; meaningHe: string }[] };

type Props = {
  content: ExplanationContent; audio: (AudioSource | null)[]; header: { code: string; index: number; count: number };
  save: SaveState; onNext: () => void; onBack: () => void; onClose: () => void;
};

export function ExplanationScreen({ content, audio, header, save, onNext, onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const column = Math.min(windowWidth, 600) - 40;
  const gutter = (windowWidth - column) / 2;
  // The example that started last; any other one that is still playing stops.
  const [current, setCurrent] = useState<number | null>(null);

  return <View style={styles.root}>
    <StatusBar style="light" />
    <LessonHeader code={header.code} index={header.index} count={header.count} onClose={onClose} topInset={insets.top} />
    <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
      <Text accessibilityRole="header" style={styles.title}>{content.titleHe}</Text>
      <View style={styles.rule}>
        {/* Right to left: the label on the right, the ¿ mark in the left corner. */}
        <View style={styles.ruleTop}>
          <Text style={styles.ruleLabel}>הכלל</Text>
          <Text accessible={false} importantForAccessibility="no" style={styles.mark}>¿</Text>
        </View>
        <Text style={styles.ruleText}>{content.generalHe}</Text>
      </View>
      <Text style={styles.examplesLabel}>דוגמאות</Text>
      <View style={styles.examples}>
        {content.examples.map((example, i) => {
          const source = audio[i] ?? null;
          return source
            ? <PlayableExample key={`${content.id}-${i}`} example={example} source={source} index={i} current={current} onStart={setCurrent} />
            : <ExampleTicket key={`${content.id}-${i}`} example={example} playing={false}
              control={<PlayButton label={`השמעה: ${example.textEs}`} playing={false} disabled onPress={() => {}} />} />;
        })}
      </View>
    </ScrollView>
    <View style={[styles.footer, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <LessonSaveError message={save.errorHe} />
      <LessonButtonRow>
        {/* Right to left: back on the right, the main action on the left. */}
        <View style={styles.back}><LessonSecondaryButton label="חזרה" onPress={onBack} /></View>
        <View style={styles.next}><LessonButton label="ממשיכים" busy={save.busy} onPress={onNext} /></View>
      </LessonButtonRow>
    </View>
  </View>;
}

type Example = ExplanationContent['examples'][number];

function PlayableExample({ example, source, index, current, onStart }: {
  example: Example; source: AudioSource; index: number; current: number | null; onStart: (index: number) => void;
}) {
  const playback = usePlayback(source);
  const { playing, pause } = playback;
  // onStart and pause are stable: each effect runs only when this example starts, or
  // when another one becomes the current example.
  useEffect(() => {
    if (playing) onStart(index);
  }, [playing, onStart, index]);
  useEffect(() => {
    if (current !== index) pause();
  }, [current, index, pause]);

  return <View style={styles.exampleStack}>
    <ExampleTicket example={example} playing={playback.playing}
      control={<PlayButton label={playback.playing ? `עצירת השמעה: ${example.textEs}` : `השמעה: ${example.textEs}`}
        playing={playback.playing} disabled={!playback.loaded} busy={playback.busy} onPress={playback.toggle} />} />
    {playback.failure ? <View style={styles.errorStack}>
      <View style={styles.alert}><Text accessibilityRole="alert" style={styles.alertText}>{playback.failure}</Text></View>
      <LessonSecondaryButton label="טעינת השמע מחדש" onPress={playback.reload} />
    </View> : null}
  </View>;
}

// A ticket: in the right-to-left row the play button sits on the right, then the
// Spanish under its rising arrow, and the meaning at the left end.
function ExampleTicket({ example, playing, control }: { example: Example; playing: boolean; control: ReactNode }) {
  return <View style={[styles.ticket, playing && styles.ticketPlaying]}>
    {control}
    <View style={styles.spanish}>
      <RisingArrow />
      <Text selectable accessibilityLanguage="es-MX" style={styles.spanishText}>{example.textEs}</Text>
    </View>
    <View style={styles.spacer} />
    <Text style={styles.meaning}>{example.meaningHe}</Text>
  </View>;
}

// Small sunset disc (Figma "Lesson / Turn play" 114:2195).
function PlayButton({ label, playing, disabled = false, busy = false, onPress }: { label: string; playing: boolean; disabled?: boolean; busy?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }}
    disabled={disabled || busy} onPress={onPress} hitSlop={6}
    style={({ pressed }) => [styles.play, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
    {busy ? <ActivityIndicator color={c.plum} />
      // Media icons keep pointing right in a right-to-left layout, as on iOS.
      : <Svg width={18} height={18} viewBox="0 0 20 20" accessible={false}>
        {playing ? <>
          <Rect x={5} y={4.17} width={3.33} height={11.67} rx={0.83} fill={c.plum} />
          <Rect x={11.67} y={4.17} width={3.33} height={11.67} rx={0.83} fill={c.plum} />
        </> : <Path d="M5.83333 3.75V16.25L15.8333 10L5.83333 3.75Z" fill={c.plum} />}
      </Svg>}
  </Pressable>;
}

// The voice rises at the end of the question. Spanish reads left to right, so the
// arrow climbs towards its right end in any app direction.
function RisingArrow() {
  return <Svg width={44} height={16} viewBox="0 0 44 16" fill="none" accessible={false}>
    <Path d="M2 14C14 14 26 11 38 4" stroke={c.sunset} strokeWidth={2.6} strokeLinecap="round" />
    <Path d="M31 3.2L38.6 3.6L35.6 10.4" stroke={c.sunset} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 8 } };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night },
  content: { paddingTop: 4, paddingBottom: 24, gap: 14 },
  title: { fontFamily: f.poster, fontSize: 50, lineHeight: 54, color: c.cream, writingDirection: 'rtl' },
  rule: { backgroundColor: c.cream, borderRadius: 22, paddingTop: 12, paddingBottom: 20, paddingHorizontal: 20, gap: 6, ...shadow },
  ruleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ruleLabel: { fontFamily: f.bold, fontSize: 14, lineHeight: 20, color: c.inkMuted, writingDirection: 'rtl' },
  mark: { fontFamily: f.poster, fontSize: 60, lineHeight: 52, color: c.sunset },
  ruleText: { fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.night, writingDirection: 'rtl' },
  examplesLabel: { fontFamily: f.bold, fontSize: 14, lineHeight: 20, color: c.cream, writingDirection: 'rtl' },
  examples: { gap: 10 },
  exampleStack: { gap: 10 },
  // A transparent border keeps the ticket the same size when it turns sunset while playing.
  ticket: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingStart: 12, paddingEnd: 18, paddingVertical: 10,
    backgroundColor: c.cream, borderWidth: 3, borderColor: 'transparent',
    borderTopStartRadius: 26, borderBottomStartRadius: 26, borderTopEndRadius: 12, borderBottomEndRadius: 12, ...shadow,
  },
  ticketPlaying: { borderColor: c.sunset },
  // flex-start is the right edge in RTL: the arrow sits over the end of the Spanish.
  spanish: { alignItems: 'flex-start', flexShrink: 1 },
  spanishText: { fontFamily: f.heavy, fontSize: 26, lineHeight: 32, color: c.night, writingDirection: 'ltr' },
  spacer: { flex: 1 },
  meaning: { fontFamily: f.bold, fontSize: 21, lineHeight: 28, color: c.inkMuted, writingDirection: 'rtl' },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.sunset, alignItems: 'center', justifyContent: 'center' },
  errorStack: { gap: 10 },
  alert: { backgroundColor: c.pink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  alertText: { fontFamily: f.body, fontSize: 15, lineHeight: 22, color: c.plum, writingDirection: 'rtl' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  footer: { paddingTop: 12 },
  back: { flex: 1 },
  next: { flex: 2 },
});
