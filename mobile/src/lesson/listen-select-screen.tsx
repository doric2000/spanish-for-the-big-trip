import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import type { AudioSource } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import type { AttemptResult } from '../../../content/src/progress-types';
import { retro } from '../theme';
import { LessonSaveError, LessonSecondaryButton, type SaveState } from './lesson-button';
import { LessonAvatar } from './lesson-avatar';
import { LessonHeader } from './lesson-header';
import { CheckIcon, ContinueSheet, RetryNote, Stamp, SuccessSheet, useRetryFlash } from './lesson-sheet';
import type { FaceCrop } from './media';
import type { LessonResponse } from './opening-data';
import { usePlayback } from './playback';

// Listen and select (Figma "Template / Listen select" 84:1014): hear the expression on
// the radio poster, pick its meaning. States Question, Hint, Retry and Correct, each
// decided only by the server's reply; the app never knows the correct answer. A wrong
// answer lights up pink for a moment and the message stays under the answers. No score
// or timer; replay and the written hint never block. A solved check seen again through
// "חזרה" is view-only (approved by Dor, 2026-10-25). "חזרה" shows in every state and only
// moves the view back (Figma Back 114:2197/114:2205, approved by Dor 2026-10-26).
const c = retro.colors;
const f = retro.fonts;
const POSTER_H = 232, FRAME = 6, DISC = 88;

export type ListenSelectContent = {
  id: string; titleHe: string; promptHe: string; choices: { id: string; textHe: string }[];
  allowWrittenHint: boolean; characterNameHe: string | null;
};

type Props = {
  content: ListenSelectContent; avatar: { source: ImageSourcePropType; crop: FaceCrop } | null; audio: AudioSource | null;
  header: { code: string; index: number; count: number }; unitShort: string; reviewOnly: boolean; save: SaveState;
  // Resolves with the server's reply, or null when it was not confirmed (the save error says why).
  onAnswer: (response: LessonResponse) => Promise<AttemptResult | null>;
  onContinue: () => void; onBack: () => void; onClose: () => void;
};

type Feedback = { kind: 'retry'; messageHe: string } | { kind: 'correct'; choiceId: string; messageHe: string };

export function ListenSelectScreen({ content, avatar, audio, header, unitShort, reviewOnly, save, onAnswer, onContinue, onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const column = Math.min(windowWidth, 600) - 40;
  const gutter = (windowWidth - column) / 2;
  const [expressionEs, setExpressionEs] = useState<string | null>(null);
  const [flashing, flash] = useRetryFlash<string>();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const scroll = useRef<ScrollView>(null);
  const reduceMotion = useReducedMotion();
  const [lastWrong, setLastWrong] = useState<{ id: string; tap: number } | null>(null);
  const solved = feedback?.kind === 'correct';
  // A solved check seen again keeps playback; answers and the hint are locked.
  const locked = reviewOnly && !solved;

  async function choose(choiceId: string) {
    if (save.busy || solved || locked) return;
    const result = await onAnswer({ kind: 'choice', choiceId });
    if (!result) return;
    if (result.outcome === 'correct' || result.outcome === 'correct_with_help') {
      setFeedback({ kind: 'correct', choiceId, messageHe: result.feedbackHe ?? '' });
    } else if (result.outcome === 'retry') {
      flash(choiceId);
      setLastWrong(current => ({ id: choiceId, tap: (current?.tap ?? 0) + 1 }));
      setFeedback({ kind: 'retry', messageHe: result.feedbackHe ?? '' });
      // The message sits under the answers, which may be below the fold on a small phone.
      requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: !reduceMotion }));
    }
  }
  async function showHint() {
    if (save.busy || locked) return;
    const result = await onAnswer({ kind: 'written_hint' });
    if (result?.revealed && 'expressionEs' in result.revealed) setExpressionEs(result.revealed.expressionEs);
  }

  const tagState = (choiceId: string): TagState => {
    if (feedback?.kind === 'correct') return feedback.choiceId === choiceId ? 'right' : 'dimmed';
    return flashing === choiceId ? 'wrong' : 'default';
  };
  const pad = (n: number) => String(n).padStart(2, '0');

  return <View style={styles.root}>
    <StatusBar style="light" />
    <LessonHeader code={header.code} index={header.index} count={header.count} onClose={onClose} topInset={insets.top} />
    <ScrollView ref={scroll} contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>{content.titleHe}</Text>
        <Text style={styles.prompt}>{content.promptHe}</Text>
      </View>
      <View>
        <View style={styles.poster}>
          <RaysArt width={column - 2 * FRAME} height={POSTER_H - 2 * FRAME} />
          {content.characterNameHe ? <View style={styles.speaker}>
            {avatar ? <LessonAvatar {...avatar} /> : null}
            <Text style={styles.speakerName}>{content.characterNameHe}</Text>
          </View> : null}
          <Text style={styles.radioCode}>RADIO · {unitShort}</Text>
          <View style={styles.play}>
            {audio ? <Playback key={content.id} source={audio} /> : <Disc label="השמעה" playing={false} disabled onPress={() => {}} />}
          </View>
          <View style={styles.hintArea}>
            {expressionEs ? <FlapBoard text={expressionEs} />
              : content.allowWrittenHint && !locked && !solved ? <Pressable accessibilityRole="button" accessibilityLabel="הצגת הביטוי"
                disabled={save.busy} onPress={() => { void showHint(); }}
                style={({ pressed }) => [styles.hintButton, pressed && styles.pressed]}>
                <Text style={styles.hintLabel}>הצגת הביטוי</Text>
                <EyeIcon />
              </Pressable> : null}
          </View>
        </View>
        {solved ? <Stamp code={`${unitShort}·${pad(header.index + 1)}`} style={styles.stamp} /> : null}
      </View>
      <View style={styles.answers} accessibilityRole="radiogroup">
        {content.choices.map(choice => <AnswerTag key={choice.id} textHe={choice.textHe} state={tagState(choice.id)}
          shake={lastWrong?.id === choice.id ? lastWrong.tap : 0}
          disabled={save.busy || solved || locked} onPress={() => { void choose(choice.id); }} />)}
      </View>
      {feedback?.kind === 'retry' ? <RetryNote key={`retry-${lastWrong?.tap ?? 0}`} messageHe={feedback.messageHe} /> : null}
      {save.busy ? <ActivityIndicator color={c.gold} /> : null}
    </ScrollView>
    {/* Feedback stays pinned to the bottom while the column scrolls. */}
    <View style={[styles.bottom, { paddingHorizontal: !solved && !locked ? gutter : 0 }]}>
      <LessonSaveError message={save.errorHe} />
      {feedback?.kind === 'correct' ? <SuccessSheet messageHe={feedback.messageHe} bottomInset={insets.bottom} onContinue={onContinue} onBack={onBack} />
        : locked ? <ContinueSheet bottomInset={insets.bottom} onContinue={onContinue} onBack={onBack} />
          : <View style={{ paddingTop: 12, paddingBottom: Math.max(insets.bottom, 20) }}>
            <LessonSecondaryButton label="חזרה" disabled={save.busy} onPress={onBack} />
          </View>}
    </View>
  </View>;
}

function Playback({ source }: { source: AudioSource }) {
  const playback = usePlayback(source);
  if (playback.failure) return <Disc label="טעינת השמע מחדש" playing={false} onPress={playback.reload} />;
  return <Disc label={playback.playing ? 'עצירת השמעה' : playback.loaded ? 'השמעה' : 'טוענים את השמע…'}
    playing={playback.playing} disabled={!playback.loaded} busy={playback.busy} onPress={playback.toggle} />;
}

// The sunset play disc with its label underneath.
function Disc({ label, playing, disabled = false, busy = false, onPress }: { label: string; playing: boolean; disabled?: boolean; busy?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }}
    disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.discStack, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
    <View style={styles.disc}>
      {/* Media icons keep pointing right in a right-to-left layout, as on iOS. */}
      <Svg width={34} height={34} viewBox="0 0 20 20" accessible={false}>
        {playing ? <>
          <Rect x={5} y={4.17} width={3.33} height={11.67} rx={0.83} fill={c.plum} />
          <Rect x={11.67} y={4.17} width={3.33} height={11.67} rx={0.83} fill={c.plum} />
        </> : <Path d="M5.83333 3.75V16.25L15.8333 10L5.83333 3.75Z" fill={c.plum} />}
      </Svg>
    </View>
    <Text style={styles.discLabel}>{label}</Text>
  </Pressable>;
}

type TagState = 'default' | 'wrong' | 'right' | 'dimmed';

// Luggage-tag answer (Figma "Lesson / Answer tag" 78:280). A wrong tag shakes and is pink
// for a moment, then looks as before and stays tappable; after the right one the others dim. The small code label is hidden: 1A answers have
// no tag text (approved by Dor, 2026-10-25).
function AnswerTag({ textHe, state, shake, disabled, onPress }: { textHe: string; state: TagState; shake: number; disabled: boolean; onPress: () => void }) {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);
  useEffect(() => {
    if (!shake || reduceMotion) return;
    const step = (x: number) => withTiming(x, { duration: 75 });
    offset.value = withSequence(step(-8), step(8), step(-6), step(6), step(-3), step(0));
  }, [shake, reduceMotion, offset]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const ink = state === 'wrong' ? c.plum : c.night;
  return <Animated.View style={shakeStyle}>
    <Pressable accessibilityRole="radio" accessibilityLabel={textHe}
      accessibilityState={{ checked: state === 'right', disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.tag, tagBackground[state], pressed && styles.pressed]}>
      {/* Right to left: the hole and perforation on the right, the mark on the left. */}
      <Svg width={12} height={12} accessible={false}><Circle cx={6} cy={6} r={6} fill={c.night} /></Svg>
      <Svg width={2} height={36} accessible={false}><Line x1={1} x2={1} y1={0} y2={36} stroke={c.night} strokeWidth={2} strokeDasharray="3.6 3.6" /></Svg>
      <Text style={[styles.tagText, { color: ink }]}>{textHe}</Text>
      {state === 'wrong' ? <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
        <Path d="M6 6L12 12M12 12L18 18M12 12L18 6M12 12L6 18" strokeWidth={3} strokeLinecap="round" stroke={c.plum} />
      </Svg> : state === 'right' ? <CheckIcon size={24} color={c.night} /> : null}
    </Pressable>
  </Animated.View>;
}
const tagBackground = StyleSheet.create({
  default: { backgroundColor: c.cream },
  wrong: { backgroundColor: c.pink },
  right: { backgroundColor: c.gold },
  dimmed: { backgroundColor: c.cream, opacity: 0.45 },
});

// Departure-board letters for the written hint (Figma "Lesson / Flap letter" 78:335).
function FlapBoard({ text }: { text: string }) {
  return <View style={styles.board} accessible accessibilityLabel={text} accessibilityLanguage="es-MX">
    {[...text].map((letter, i) => <View key={i} style={[styles.flap, letter === ' ' && styles.flapEmpty]}>
      <Text style={styles.flapLetter}>{letter}</Text>
      <View style={styles.flapSplit} />
    </View>)}
  </View>;
}

function EyeIcon() {
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" accessible={false}>
    <Path d="M2.5 12C2.5 12 6 5.5 12 5.5C18 5.5 21.5 12 21.5 12C21.5 12 18 18.5 12 18.5C6 18.5 2.5 12 2.5 12Z" strokeWidth={2.2} stroke={c.night} />
    <Circle cx={12} cy={12} r={3} strokeWidth={2.2} stroke={c.night} />
  </Svg>;
}

// Radio poster art (Figma 84:847): sun rays, teal hills and a gold shore, anchored to
// the bottom so a wider phone shows more sky rather than stretched hills.
function RaysArt({ width, height }: { width: number; height: number }) {
  const rays = [
    'M169 96L165 -140H173L169 96Z', 'M169 96L283.536 -110.382L290.464 -106.382L169 96Z',
    'M169 96L371.382 -25.4641L375.382 -18.5359L169 96Z', 'M169 96L405 92V100L169 96Z',
    'M169 96L375.382 210.536L371.382 217.464L169 96Z', 'M169 96L290.464 298.382L283.536 302.382L169 96Z',
    'M169 96L173 332H165L169 96Z', 'M169 96L54.4641 302.382L47.5359 298.382L169 96Z',
    'M169 96L-33.382 217.464L-37.382 210.536L169 96Z', 'M169 96L-67 100V92L169 96Z',
    'M169 96L-37.382 -18.5359L-33.382 -25.4641L169 96Z', 'M169 96L47.5359 -106.382L54.4641 -110.382L169 96Z',
  ];
  return <Svg style={StyleSheet.absoluteFill} width={width} height={height} viewBox="0 0 338 220" preserveAspectRatio="xMidYMax slice" accessible={false}>
    <Defs><ClipPath id="rays"><Rect width={338} height={220} /></ClipPath></Defs>
    <G clipPath="url(#rays)">
      <G opacity={0.14}>{rays.map(d => <Path key={d} d={d} fill={c.cream} />)}</G>
      <Path d="M0 196L40 160L66 178L106 138L140 168L170 146L214 186L244 162L294 196L338 174V220H0V196Z" fill={c.sea} />
      <Path d="M0 206C56 198 110 210 170 204C230 198 286 198 338 206V220H0V206Z" fill={c.gold} />
    </G>
  </Svg>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night },
  content: { paddingTop: 4, paddingBottom: 24, gap: 16 },
  heading: { gap: 4 },
  title: { fontFamily: f.poster, fontSize: 50, lineHeight: 54, color: c.cream, writingDirection: 'rtl' },
  prompt: { fontFamily: f.medium, fontSize: 18, lineHeight: 26, color: c.cream, writingDirection: 'rtl' },
  poster: {
    height: POSTER_H, backgroundColor: c.plum, borderWidth: FRAME, borderColor: c.cream, borderRadius: 22, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 17, shadowOffset: { width: 0, height: 22 },
  },
  // Right to left: the avatar in the top-right corner with the name before it.
  speaker: { position: 'absolute', top: 12, start: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  speakerName: { fontFamily: f.bold, fontSize: 15, lineHeight: 20, color: c.cream, writingDirection: 'rtl' },
  radioCode: { position: 'absolute', top: 16, end: 14, fontFamily: f.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.5, color: c.pink, writingDirection: 'ltr' },
  play: { position: 'absolute', top: 24, start: 0, end: 0, alignItems: 'center' },
  discStack: { alignItems: 'center', gap: 6 },
  disc: {
    width: DISC, height: DISC, borderRadius: DISC / 2, backgroundColor: c.sunset, borderWidth: 4, borderColor: c.cream,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 9, shadowOffset: { width: 0, height: 8 },
  },
  discLabel: { fontFamily: f.bold, fontSize: 16, lineHeight: 24, color: c.cream, textAlign: 'center', writingDirection: 'rtl' },
  hintArea: { position: 'absolute', top: 162, start: 0, end: 0, height: 46, alignItems: 'center', justifyContent: 'center' },
  hintButton: {
    height: 44, borderRadius: 22, backgroundColor: c.cream, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 6 },
  },
  hintLabel: { fontFamily: f.bold, fontSize: 15, lineHeight: 24, color: c.night, writingDirection: 'rtl' },
  // Spanish reads left to right whatever the app direction.
  board: { flexDirection: 'row', direction: 'ltr', gap: 2 },
  flap: {
    width: 24, height: 40, borderRadius: 4, backgroundColor: c.night, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 0, shadowOffset: { width: 0, height: 3 },
  },
  flapEmpty: { opacity: 0.5 },
  flapLetter: { fontFamily: f.heavy, fontSize: 24, lineHeight: 32, color: c.cream, textAlign: 'center' },
  flapSplit: { position: 'absolute', top: 19, start: 0, end: 0, height: 1.5, backgroundColor: c.night },
  // Figma places the stamp about 18pt in from the poster's left edge, over its lower half.
  stamp: { top: 114, end: 18 },
  answers: { gap: 10 },
  tag: {
    minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14, paddingStart: 18, paddingEnd: 16, paddingVertical: 14,
    borderTopStartRadius: 26, borderBottomStartRadius: 26, borderTopEndRadius: 12, borderBottomEndRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 8 },
  },
  tagText: { flex: 1, fontFamily: f.bold, fontSize: 21, lineHeight: 28, writingDirection: 'rtl' },
  bottom: {},
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
