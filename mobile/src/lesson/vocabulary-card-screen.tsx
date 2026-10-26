import { useEffect } from 'react';
import { type ImageSourcePropType, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import type { AudioSource } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import { retro } from '../theme';
import { LessonAudioButton, LessonButton, LessonButtonRow, LessonOutlineButton, LessonSaveError, LessonSecondaryButton, type SaveState } from './lesson-button';
import { LessonAvatar } from './lesson-avatar';
import { LessonHeader } from './lesson-header';
import type { FaceCrop } from './media';
import { isLongExpression } from './opening-data';
import { usePlayback } from './playback';
import { SunPosterArt } from './sun-poster-art';

// Vocabulary card (Figma "Template / Vocabulary card" 82:1026, approved by Dor
// 2026-10-16): a boarding-pass ticket with the expression on the poster half and the
// meaning and playback on the cream stub. States: Default, Playing, Audio error and
// Long text. The tip and vowel chips come with their help content (not in 1A yet).
const c = retro.colors;
const f = retro.fonts;
// Design space: a 350pt ticket; the poster is 268pt tall with a 6pt cream frame.
const TICKET = 350, POSTER_H = 268, FRAME = 6;
// The heading is the same in every unit (approved by Dor 2026-10-17).
const TITLE_HE = 'המילים שנצטרך';

export type VocabularyContent = { id: string; expressionEs: string; meaningHe: string; characterNameHe: string };

type Props = {
  card: VocabularyContent; avatar: { source: ImageSourcePropType; crop: FaceCrop } | null; audio: AudioSource | null;
  position: { index: number; count: number }; header: { code: string; index: number; count: number };
  nextLabel: string; save: SaveState; onNext: () => void; onBack: () => void; onClose: () => void;
};

export function VocabularyCardScreen({ card, avatar, audio, position, header, nextLabel, save, onNext, onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const column = Math.min(windowWidth, 600) - 40;
  const gutter = (windowWidth - column) / 2;
  const k = column / TICKET;
  const long = isLongExpression(card.expressionEs);
  const pad = (n: number) => String(n).padStart(2, '0');

  // The ticket slides in from the left with a small tilt for each expression (0.55s).
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) enter.value = withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) });
  }, [reduceMotion, enter]);
  const ticketStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * -60 }, { rotate: `${-1 - (1 - enter.value) * 3}deg` }],
  }));

  return <View style={styles.root}>
    <StatusBar style="light" />
    <LessonHeader code={header.code} index={header.index} count={header.count} onClose={onClose} topInset={insets.top} />
    <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.title}>{TITLE_HE}</Text>
        <View style={styles.countPill}><Text style={styles.count}>{position.index + 1} מתוך {position.count}</Text></View>
      </View>
      <Animated.View style={[styles.ticket, ticketStyle]}>
        <View style={[styles.poster, { height: POSTER_H * k }]}>
          <SunPosterArt width={column - 2 * FRAME} />
          <View style={styles.speaker}>
            {avatar ? <LessonAvatar {...avatar} /> : null}
            <Text style={styles.speakerName}>{card.characterNameHe}</Text>
          </View>
          <Text style={styles.cardCode}>Nº {pad(position.index + 1)}/{pad(position.count)}</Text>
          <Text selectable accessibilityLanguage="es-MX" numberOfLines={long ? 2 : 1} adjustsFontSizeToFit
            style={[styles.expression, long ? styles.expressionLong : null, { top: (long ? 74 : 70) * k }]}>
            {card.expressionEs}
          </Text>
        </View>
        <Perforation width={column} />
        <View style={styles.stub}>
          <Text style={styles.meaning}>{card.meaningHe}</Text>
          <View style={styles.audioSlot}>
            {audio ? <Playback key={card.id} source={audio} />
              : <LessonAudioButton label="השמעה" playing={false} disabled onPress={() => {}} />}
          </View>
        </View>
      </Animated.View>
    </ScrollView>
    <View style={[styles.footer, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <LessonSaveError message={save.errorHe} />
      <LessonButtonRow>
        {/* Right to left: back on the right, the main action on the left. */}
        <View style={styles.back}><LessonSecondaryButton label="חזרה" onPress={onBack} /></View>
        <View style={styles.next}><LessonButton label={nextLabel} busy={save.busy} onPress={onNext} /></View>
      </LessonButtonRow>
    </View>
  </View>;
}

// Ticket tear line (Figma 78:338): notches in the screen colour and a dashed line.
export function Perforation({ width }: { width: number }) {
  return <Svg width={width} height={24} accessible={false} style={styles.perforation}>
    <Line x1={20} x2={width - 20} y1={11} y2={11} stroke={c.night} strokeWidth={2} strokeDasharray="6 4" />
    <Circle cx={0} cy={12} r={12} fill={c.night} />
    <Circle cx={width} cy={12} r={12} fill={c.night} />
  </Svg>;
}

// Play and pause on the stub; the shared flow explains a failed load and offers a reload.
function Playback({ source }: { source: AudioSource }) {
  const playback = usePlayback(source);
  if (playback.failure) return <View style={styles.errorStack}>
    <View style={styles.alert}><Text accessibilityRole="alert" style={styles.alertText}>{playback.failure}</Text></View>
    <LessonOutlineButton label="טעינת השמע מחדש" onPress={playback.reload} />
  </View>;
  return <LessonAudioButton label={playback.playing ? 'עצירת השמעה' : playback.loaded ? 'השמעה' : 'טוענים את השמע…'}
    playing={playback.playing} disabled={!playback.loaded} busy={playback.busy} onPress={playback.toggle} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night },
  content: { paddingTop: 4, paddingBottom: 24, gap: 12 },
  titleRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12 },
  // flex: 1 gives the heading a known width to fit. With only flexShrink, iOS measured
  // the auto-fitting text at zero width and drew nothing (Dor's iPhone, 2026-10-17).
  title: { flex: 1, fontFamily: f.poster, fontSize: 50, lineHeight: 54, color: c.cream, writingDirection: 'rtl' },
  countPill: { borderWidth: 1.5, borderColor: c.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  count: { fontFamily: f.bold, fontSize: 14, lineHeight: 20, color: c.gold, writingDirection: 'rtl' },
  ticket: {
    marginTop: 4,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 26 },
  },
  poster: {
    backgroundColor: c.deep, borderColor: c.cream, borderTopWidth: FRAME, borderLeftWidth: FRAME, borderRightWidth: FRAME,
    borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden',
  },
  // Right to left: the avatar sits in the top-right corner with the name before it.
  speaker: { position: 'absolute', top: 14, start: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  speakerName: { fontFamily: f.bold, fontSize: 15, lineHeight: 20, color: c.cream, writingDirection: 'rtl' },
  cardCode: { position: 'absolute', top: 28, end: 14, fontFamily: f.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.5, color: c.gold, writingDirection: 'ltr' },
  expression: {
    position: 'absolute', start: 14, end: 14, fontFamily: f.poster, fontSize: 104, lineHeight: 100, color: c.cream,
    textAlign: 'center', writingDirection: 'ltr',
    textShadowColor: 'rgba(13,59,64,0.5)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0,
  },
  expressionLong: { fontSize: 60, lineHeight: 60 },
  perforation: { backgroundColor: c.cream },
  stub: {
    backgroundColor: c.cream, borderBottomLeftRadius: 26, borderBottomRightRadius: 26,
    paddingTop: 4, paddingBottom: 20, paddingHorizontal: 20, gap: 14, alignItems: 'stretch',
  },
  meaning: { fontFamily: f.heavy, fontSize: 36, lineHeight: 44, color: c.night, textAlign: 'center', writingDirection: 'rtl' },
  audioSlot: { alignSelf: 'stretch' },
  errorStack: { gap: 10 },
  alert: { backgroundColor: c.pink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  alertText: { fontFamily: f.body, fontSize: 15, lineHeight: 22, color: c.plum, writingDirection: 'rtl' },
  footer: { paddingTop: 12 },
  back: { flex: 1 },
  next: { flex: 2 },
});
