import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, type ImageSourcePropType, type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { AudioSource } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { retro } from '../theme';
import { LessonAudioButton, LessonButton, LessonButtonRow, LessonSaveError, LessonSecondaryButton, type SaveState } from './lesson-button';
import { LearnerBadge, LessonAvatar } from './lesson-avatar';
import { LessonHeader } from './lesson-header';
import type { FaceCrop } from './media';
import { nextPlayable } from './opening-data';
import { usePlayback } from './playback';

// Dialogue (Figma "Template / Dialogue" 86:1186, approved by Dor 2026-10-26): the whole
// exchange as cards, Juan's on the right with his avatar, the learner's in gold on the
// left. Each line has its own play button and its own translation toggle; "השמעת כל
// השיחה" plays the lines in order and scrolls to the one being heard. Only one line
// plays at a time. A line without its recording shows a disabled play button, and the
// whole-dialogue button skips it.
const c = retro.colors;
const f = retro.fonts;
const BADGE = 56;

export type DialogueContent = {
  id: string; titleHe: string; translationInitiallyVisible: boolean;
  turns: { id: string; speaker: 'character' | 'learner'; speakerNameHe: string; textEs: string; translationHe: string }[];
};
type Turn = DialogueContent['turns'][number];
type Avatar = { source: ImageSourcePropType; crop: FaceCrop } | null;

type Props = {
  content: DialogueContent; avatars: Avatar[]; audio: (AudioSource | null)[];
  header: { code: string; index: number; count: number };
  save: SaveState; onNext: () => void; onBack: () => void; onClose: () => void;
};

export function DialogueScreen({ content, avatars, audio, header, save, onNext, onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const column = Math.min(windowWidth, 600) - 40;
  const gutter = (windowWidth - column) / 2;
  // Figma: the turns use 16pt sides; a card leaves room for the 56pt badge and a margin.
  const card = Math.min(windowWidth, 600) - 32 - BADGE - 10 - 24;
  const [shown, setShown] = useState<readonly string[]>(content.translationInitiallyVisible ? content.turns.map(t => t.id) : []);
  // The line that started last; any other one that is still playing stops.
  const [current, setCurrent] = useState<number | null>(null);
  // The line the whole-dialogue run is on, or null when it is not running.
  const [sequence, setSequence] = useState<number | null>(null);
  // Which lines have a recording does not change while the screen is open.
  const [playable] = useState(() => audio.map(Boolean));
  const first = nextPlayable(playable, -1);

  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  useEffect(() => {
    if (sequence === null) return;
    scroll.current?.scrollTo({ y: Math.max(0, (offsets.current[sequence] ?? 0) - 16), animated: !reduceMotion });
  }, [sequence, reduceMotion]);

  // Stable, so each line's effects run only when what they watch changes.
  const onStart = useCallback((index: number) => {
    setCurrent(index);
    // Tapping another line ends the run.
    setSequence(running => running === index ? running : null);
  }, []);
  const onFinish = useCallback((index: number) => {
    setSequence(running => running === index ? nextPlayable(playable, index) : running);
  }, [playable]);
  const onStop = useCallback(() => setSequence(null), []);
  const toggleAll = () => {
    if (sequence !== null) { setSequence(null); setCurrent(null); return; }
    if (first !== null) { setCurrent(first); setSequence(first); }
  };
  const toggleTranslation = (id: string) =>
    setShown(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  return <View style={styles.root}>
    <StatusBar style="light" />
    <LessonHeader code={header.code} index={header.index} count={header.count} onClose={onClose} topInset={insets.top} />
    <View style={[styles.heading, { paddingHorizontal: gutter }]}>
      <Text accessibilityRole="header" style={styles.title}>{content.titleHe}</Text>
      <Text style={styles.instruction}>הקשיבו לשיחה. אפשר להציג תרגום ולהקשיב שוב.</Text>
    </View>
    <ScrollView ref={scroll} contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.turns, { paddingHorizontal: (windowWidth - Math.min(windowWidth, 600) + 32) / 2 }]}>
      {content.turns.map((turn, i) => {
        const source = audio[i] ?? null;
        const props = { turn, avatar: avatars[i] ?? null, width: card, translated: shown.includes(turn.id),
          onTranslate: () => toggleTranslation(turn.id) };
        return <View key={turn.id} onLayout={(e: LayoutChangeEvent) => { offsets.current[i] = e.nativeEvent.layout.y; }}>
          {source
            ? <PlayableTurn {...props} source={source} index={i} current={current} cued={sequence === i} onStart={onStart} onFinish={onFinish} onStop={onStop} />
            : <TurnCard {...props} playing={false}
              play={<TurnPlay label={`השמעה: ${turn.textEs}`} playing={false} disabled onPress={() => {}} />} />}
        </View>;
      })}
    </ScrollView>
    <View style={[styles.footer, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <LessonSaveError message={save.errorHe} />
      <LessonAudioButton label={sequence !== null ? 'עצירת השמעה' : 'השמעת כל השיחה'} playing={sequence !== null}
        disabled={first === null} onPress={toggleAll} />
      <LessonButtonRow>
        {/* Right to left: back on the right, the main action on the left. */}
        <View style={styles.back}><LessonSecondaryButton label="חזרה" onPress={onBack} /></View>
        <View style={styles.next}><LessonButton label="ממשיכים" busy={save.busy} onPress={onNext} /></View>
      </LessonButtonRow>
    </View>
  </View>;
}

type TurnProps = { turn: Turn; avatar: Avatar; width: number; translated: boolean; onTranslate: () => void };

// cued: the whole-dialogue run reached this line. It starts once the file is loaded;
// a line that cannot load is skipped so the run never stalls.
function PlayableTurn({ source, index, current, cued, onStart, onFinish, onStop, ...props }: TurnProps & {
  source: AudioSource; index: number; current: number | null; cued: boolean;
  onStart: (index: number) => void; onFinish: (index: number) => void; onStop: () => void;
}) {
  const playback = usePlayback(source);
  const { playing, loaded, finished, failure, start, pause } = playback;
  useEffect(() => {
    if (cued && failure) onFinish(index);
    else if (cued && loaded) start();
  }, [cued, loaded, failure, start, onFinish, index]);
  useEffect(() => {
    if (playing) onStart(index);
  }, [playing, onStart, index]);
  useEffect(() => {
    if (current !== index) pause();
  }, [current, index, pause]);
  useEffect(() => {
    if (finished) onFinish(index);
  }, [finished, onFinish, index]);

  return <View style={styles.turnStack}>
    <TurnCard {...props} playing={playing}
      play={<TurnPlay label={playing ? `עצירת השמעה: ${props.turn.textEs}` : `השמעה: ${props.turn.textEs}`}
        playing={playing} disabled={!loaded} busy={playback.busy}
        // Pausing the line the run is on ends the run.
        onPress={() => { if (cued && playing) onStop(); playback.toggle(); }} />} />
    {failure ? <View style={styles.errorStack}>
      <View style={styles.alert}><Text accessibilityRole="alert" style={styles.alertText}>{failure}</Text></View>
      <LessonSecondaryButton label="טעינת השמע מחדש" onPress={playback.reload} />
    </View> : null}
  </View>;
}

// One line (Figma "Lesson / Dialogue turn" 86:913, layout approved by Dor 2026-10-28).
// Juan's card: cream with a postage stamp, tilted +1°, avatar on the right. The
// learner's: gold, tilted −1.2°, the plane badge on the left. The name sits alone on
// top, play beside the Spanish line, and "הצגת תרגום" at the bottom; the translation
// takes its place, and tapping it hides it again. Playing adds an outline and sound bars.
function TurnCard({ turn, avatar, width, translated, onTranslate, playing, play }: TurnProps & { playing: boolean; play: ReactNode }) {
  const learner = turn.speaker === 'learner';
  const badge = learner
    ? <LearnerBadge size={BADGE} />
    : avatar ? <LessonAvatar {...avatar} size={BADGE} /> : <View style={styles.badgeSpace} />;
  const body = <View style={[styles.card, learner ? styles.learnerCard : styles.characterCard, { width }]}>
    {playing ? <View pointerEvents="none" style={[styles.outline, { borderColor: learner ? c.cream : c.sunset }]} /> : null}
    <View style={styles.speakerRow}>
      <Text style={[styles.speakerName, learner && styles.learnerName]}>{turn.speakerNameHe}</Text>
      {playing ? <SoundBars color={learner ? c.night : c.sunset} /> : null}
    </View>
    {/* Spanish reads left to right: play first, then the line. */}
    <View style={styles.spanishLine}>
      {play}
      <Text selectable accessibilityLanguage="es-MX" style={styles.spanish}>{turn.textEs}</Text>
    </View>
    {translated
      ? <Pressable accessibilityRole="button" accessibilityLabel={`הסתרת תרגום: ${turn.translationHe}`} accessibilityState={{ expanded: true }}
        onPress={onTranslate} style={styles.translated}>
        <Svg width="100%" height={2} accessible={false}>
          <Line x1={0} x2="100%" y1={1} y2={1} stroke={c.night} strokeWidth={2} strokeDasharray="5.9 3.93" />
        </Svg>
        <Text style={styles.translation}>{turn.translationHe}</Text>
      </Pressable>
      : <TranslationLink textEs={turn.textEs} onPress={onTranslate} />}
    {learner ? null : <Postage />}
  </View>;
  // In the right-to-left row the first child sits on the right.
  return <View style={[styles.turn, learner ? styles.learnerTurn : styles.characterTurn]}>
    {learner ? <>{body}{badge}</> : <>{badge}{body}</>}
  </View>;
}

// Small sunset disc (Figma "Lesson / Turn play" 114:2195), 36pt with slop to 44pt.
function TurnPlay({ label, playing, disabled = false, busy = false, onPress }: { label: string; playing: boolean; disabled?: boolean; busy?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }}
    disabled={disabled || busy} onPress={onPress} hitSlop={4}
    style={({ pressed }) => [styles.play, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
    {busy ? <ActivityIndicator color={c.plum} />
      // Media icons keep pointing right in a right-to-left layout, as on iOS.
      : <Svg width={20} height={20} viewBox="0 0 20 20" accessible={false}>
        {playing ? <>
          <Rect x={5} y={4.17} width={3.33} height={11.67} rx={0.83} fill={c.plum} />
          <Rect x={11.67} y={4.17} width={3.33} height={11.67} rx={0.83} fill={c.plum} />
        </> : <Path d="M5.83333 3.75V16.25L15.8333 10L5.83333 3.75Z" fill={c.plum} />}
      </Svg>}
  </Pressable>;
}

// Figma "Lesson / Turn translation" 117:2284: a quiet underlined link with the eye icon,
// at the card's start (right) edge. Slop brings the short link to a 44pt target.
function TranslationLink({ textEs, onPress }: { textEs: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`הצגת תרגום: ${textEs}`} accessibilityState={{ expanded: false }}
    onPress={onPress} hitSlop={12} style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}>
    <Text style={styles.linkLabel}>הצגת תרגום</Text>
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" accessible={false}>
      <Path d="M1.66667 8C1.66667 8 4 3.66667 8 3.66667C12 3.66667 14.3333 8 14.3333 8C14.3333 8 12 12.3333 8 12.3333C4 12.3333 1.66667 8 1.66667 8Z" strokeWidth={2.2} stroke={c.night} />
      <Circle cx={8} cy={8} r={2} strokeWidth={2.2} stroke={c.night} />
    </Svg>
  </Pressable>;
}

function SoundBars({ color }: { color: string }) {
  return <View style={styles.bars} accessible={false}>
    {[8, 14, 10].map((h, i) => <View key={i} style={[styles.bar, { height: h, backgroundColor: color }]} />)}
  </View>;
}

// Postage stamp in the card's top-left corner, tilted 6°.
function Postage() {
  return <View pointerEvents="none" style={styles.postage}>
    <Svg width={30} height={36} viewBox="0 0 30 36" fill="none" accessible={false}>
      <Rect x={1} y={1} width={28} height={34} fill={c.gold} />
      <Rect x={1} y={1} width={28} height={34} stroke={c.cream} strokeWidth={2} strokeDasharray="3 2" />
      <Circle cx={15} cy={16} r={7} fill={c.sunset} />
    </Svg>
  </View>;
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 13, shadowOffset: { width: 0, height: 14 } };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night },
  heading: { paddingTop: 4, gap: 4 },
  title: { fontFamily: f.poster, fontSize: 50, lineHeight: 54, color: c.cream, writingDirection: 'rtl' },
  instruction: { fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.cream, writingDirection: 'rtl' },
  turns: { paddingTop: 22, paddingBottom: 24, gap: 30 },
  turnStack: { gap: 10 },
  turn: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  // flex-start is the right edge in RTL, flex-end the left.
  characterTurn: { justifyContent: 'flex-start', transform: [{ rotate: '1deg' }] },
  learnerTurn: { justifyContent: 'flex-end', transform: [{ rotate: '-1.2deg' }] },
  badgeSpace: { width: BADGE },
  card: { paddingTop: 14, paddingBottom: 16, paddingHorizontal: 16, gap: 6, borderRadius: 20, ...shadow },
  // The sharp corner points at the speaker: top right for Juan, top left for the learner.
  characterCard: { backgroundColor: c.cream, borderTopStartRadius: 6 },
  learnerCard: { backgroundColor: c.gold, borderTopEndRadius: 6 },
  outline: { position: 'absolute', top: -5, bottom: -5, start: -5, end: -5, borderWidth: 3, borderRadius: 24 },
  speakerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speakerName: { fontFamily: f.bold, fontSize: 14, lineHeight: 20, color: c.inkMuted, writingDirection: 'rtl' },
  learnerName: { color: c.night },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  bar: { width: 3, borderRadius: 2 },
  // Spanish reads left to right and starts at the card's left edge, after play.
  spanishLine: { direction: 'ltr', alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12 },
  spanish: { flex: 1, fontFamily: f.heavy, fontSize: 27, lineHeight: 34, color: c.night, textAlign: 'left', writingDirection: 'ltr' },
  translated: { gap: 6 },
  translation: { fontFamily: f.body, fontSize: 18, lineHeight: 28, color: c.inkMuted, writingDirection: 'rtl' },
  postage: { position: 'absolute', top: -14, end: 10, transform: [{ rotate: '6deg' }] },
  play: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.sunset, alignItems: 'center', justifyContent: 'center' },
  link: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  linkPressed: { opacity: 0.6 },
  linkLabel: { fontFamily: f.medium, fontSize: 14, lineHeight: 20, color: c.night, textDecorationLine: 'underline', writingDirection: 'rtl' },
  errorStack: { gap: 10 },
  alert: { backgroundColor: c.pink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  alertText: { fontFamily: f.body, fontSize: 15, lineHeight: 22, color: c.plum, writingDirection: 'rtl' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  footer: { paddingTop: 16, gap: 12 },
  back: { flex: 1 },
  next: { flex: 2 },
});
