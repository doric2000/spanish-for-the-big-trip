import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import type { AudioSource } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { AttemptResult } from '../../../content/src/progress-types';
import { retro } from '../theme';
import { BADGE, TurnCard, type TurnAvatar, type TurnLine, TurnPlay } from './dialogue-turn';
import { LessonButton, LessonButtonRow, LessonSaveError, LessonSecondaryButton, type SaveState } from './lesson-button';
import { LessonHeader } from './lesson-header';
import { CheckIcon, ContinueSheet, RetryNote, Stamp, SuccessSheet, useRetryFlash } from './lesson-sheet';
import { type LessonResponse, type ScenarioNode, scenarioNodeOf } from './opening-data';
import { usePlayback } from './playback';

// Ending scenario (Figma "Template / Scenario" 89:1838, approved by Dor 2026-10-28):
// one node at a time. The context in Hebrew, Juan's line on the shared turn card, and
// the answers in Spanish only. States Choice, Translation, Nonverbal (no line from Juan),
// Retry, Advance and End, each decided only by the server's reply. A wrong answer lights
// up pink for a moment and the message stays under the answers, which stay tappable. Juan's translation
// comes from the server on a tap, is registered as help and then stays open. At the end
// node it comes with the node, since the scenario is complete. "חזרה" shows in every
// state and only moves the view back.
// Scene first (Figma 144:1080, approved by Dor 2026-10-29): each node opens on its scene,
// a full-width image with the context and Juan's line, and "לענות" shows the answers under
// a narrow strip of the same scene. "חזרה" there returns to the scene. The end node has
// no answers, so it stays on its scene.
const c = retro.colors;
const f = retro.fonts;

type Props = {
  content: { id: string; titleHe: string; characterNameHe: string };
  // The node to show. The parent keeps it, so "חזרה" and a resume return to the same node.
  node: ScenarioNode; avatar: TurnAvatar; audio: AudioSource | null;
  // The node's images; null shows the title as text instead.
  scene: ImageSourcePropType | null; strip: ImageSourcePropType | null;
  header: { code: string; index: number; count: number }; unitShort: string; reviewOnly: boolean; save: SaveState;
  // Resolves with the server's reply, or null when it was not confirmed (the save error says why).
  onAnswer: (response: LessonResponse) => Promise<AttemptResult | null>;
  onShowNode: (node: ScenarioNode) => void; onContinue: () => void; onBack: () => void; onClose: () => void;
};

// A fresh view for each node: its answers, feedback and translation start empty.
export function ScenarioScreen(props: Props) {
  return <NodeView key={props.node.id} {...props} />;
}

type Feedback = { kind: 'retry'; messageHe: string } | { kind: 'advance'; choiceId: string; messageHe: string; next: ScenarioNode };

// Image sizes from the approved frames (390pt wide): the scene 390x380, the end 390x280,
// the strip 350x164 inside the column.
const SCENE_RATIO = 380 / 390;
const END_RATIO = 280 / 390;
const STRIP_RATIO = 164 / 350;

function NodeView({ content, node, avatar, audio, scene, strip, header, unitShort, reviewOnly, save, onAnswer, onShowNode, onContinue, onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const column = Math.min(windowWidth, 600) - 40;
  const gutter = (windowWidth - column) / 2;
  // The card leaves room for Juan's 56pt avatar and a margin, as in the dialogue.
  const card = column - BADGE - 10 - 16;
  const [flashing, flash] = useRetryFlash<string>();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const scroll = useRef<ScrollView>(null);
  const reduceMotion = useReducedMotion();
  const [lastWrong, setLastWrong] = useState<{ id: string; tap: number } | null>(null);
  const [translationHe, setTranslationHe] = useState<string | null>(null);
  const [translated, setTranslated] = useState(false);
  // The scene comes first; the answers follow "לענות".
  const [answering, setAnswering] = useState(false);
  const advanced = feedback?.kind === 'advance';
  // A node seen again after the scenario ended: its answers are locked.
  const locked = reviewOnly && !node.terminal;
  const onScene = node.terminal || !answering;

  async function choose(choiceId: string) {
    if (save.busy || advanced || locked) return;
    const result = await onAnswer({ kind: 'scenario_choice', nodeId: node.id, choiceId });
    if (!result) return;
    const next = scenarioNodeOf(result.revealed);
    if ((result.outcome === 'advanced' || result.outcome === 'scenario_completed') && next) {
      setFeedback({ kind: 'advance', choiceId, messageHe: result.feedbackHe ?? '', next });
    } else if (result.outcome === 'retry') {
      flash(choiceId);
      setLastWrong(current => ({ id: choiceId, tap: (current?.tap ?? 0) + 1 }));
      setFeedback({ kind: 'retry', messageHe: result.feedbackHe ?? '' });
      // The message sits under the answers, which may be below the fold on a small phone.
      requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: !reduceMotion }));
    }
  }
  // Once shown, the translation stays. Before the end it is asked for as help.
  async function translate() {
    if (node.terminal) { setTranslated(true); return; }
    if (save.busy || translated) return;
    const result = await onAnswer({ kind: 'scenario_translation', nodeId: node.id });
    if (result?.revealed && 'translationHe' in result.revealed) {
      setTranslationHe(result.revealed.translationHe);
      setTranslated(true);
    }
  }
  // The server already moved to the next node, so leaving keeps it for the return.
  const next = feedback?.kind === 'advance' ? feedback.next : null;
  const back = () => { if (next) onShowNode(next); onBack(); };

  const ticketState = (choiceId: string): TicketState => {
    if (feedback?.kind === 'advance') return feedback.choiceId === choiceId ? 'right' : 'dimmed';
    return flashing === choiceId ? 'wrong' : 'default';
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  // Asking for the translation needs the scenario to be current on the server; the end
  // node already has it.
  const canTranslate = !translated && (node.terminal ? node.translationHe !== null : !reviewOnly && !advanced);
  const onTranslate = canTranslate ? () => { void translate(); } : null;
  const line: TurnLine | null = node.textEs === null ? null
    : { speaker: 'character', speakerNameHe: content.characterNameHe, textEs: node.textEs, translationHe: translationHe ?? node.translationHe ?? '' };
  const juan = line ? <View>
    {audio ? <PlayableLine key={node.id} source={audio} turn={line} avatar={avatar} width={card} translated={translated}
      onTranslate={onTranslate} />
      : <TurnCard turn={line} avatar={avatar} width={card} translated={translated} playing={false}
        onTranslate={onTranslate}
        play={<TurnPlay label={`השמעה: ${line.textEs}`} playing={false} disabled onPress={() => {}} />} />}
  </View> : null;

  return <View style={styles.root}>
    <StatusBar style="light" />
    <LessonHeader code={header.code} index={header.index} count={header.count} onClose={onClose} topInset={insets.top} />
    <ScrollView ref={scroll} contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
      {onScene && scene ? <SceneImage source={scene} titleHe={content.titleHe} width={windowWidth}
        height={windowWidth * (node.terminal ? END_RATIO : SCENE_RATIO)} gutter={gutter} />
        : !onScene && strip ? <StripImage source={strip} titleHe={content.titleHe} width={column} />
          : <Text accessibilityRole="header" style={styles.title}>{content.titleHe}</Text>}
      {node.terminal ? <>
        {/* End: Juan's last line, what happens in larger type, then the stamp under it. */}
        {juan}
        {node.contextHe ? <Text style={styles.ending}>{node.contextHe}</Text> : null}
        <View style={styles.stampRow}><Stamp code={`${unitShort}·${pad(header.index + 1)}`} style={styles.stamp} /></View>
      </> : !answering ? <>
        {node.contextHe ? <Text style={styles.context}>{node.contextHe}</Text> : null}
        {juan}
      </> : <>
        {node.contextHe ? <Text style={styles.context}>{node.contextHe}</Text> : null}
        {juan}
        {node.promptHe ? <Text style={styles.prompt}>{node.promptHe}</Text> : null}
        <View style={styles.answers} accessibilityRole="radiogroup">
          {node.choices.map(choice => <PhraseTicket key={choice.id} textEs={choice.textEs} state={ticketState(choice.id)}
            shake={lastWrong?.id === choice.id ? lastWrong.tap : 0}
            disabled={save.busy || advanced || locked} onPress={() => { void choose(choice.id); }} />)}
        </View>
        {feedback?.kind === 'retry' ? <RetryNote key={`retry-${lastWrong?.tap ?? 0}`} messageHe={feedback.messageHe} /> : null}
      </>}
      {save.busy ? <ActivityIndicator color={c.gold} /> : null}
    </ScrollView>
    {/* Feedback stays pinned to the bottom while the column scrolls. */}
    <View style={{ paddingHorizontal: advanced || locked ? 0 : gutter }}>
      <LessonSaveError message={save.errorHe} />
      {feedback?.kind === 'advance'
        ? <SuccessSheet messageHe={feedback.messageHe} bottomInset={insets.bottom} onContinue={() => onShowNode(feedback.next)} onBack={back} />
        : locked ? <ContinueSheet bottomInset={insets.bottom} onContinue={onContinue} onBack={onBack} />
          : <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {onScene ? <LessonButtonRow>
              {/* Right to left: back on the right, the main action on the left. */}
              <View style={styles.back}><LessonSecondaryButton label="חזרה" disabled={save.busy} onPress={onBack} /></View>
              <View style={styles.next}>{node.terminal ? <LessonButton label="ממשיכים" onPress={onContinue} />
                : <LessonButton label="לענות" disabled={save.busy} onPress={() => setAnswering(true)} />}</View>
            </LessonButtonRow> : <LessonSecondaryButton label="חזרה" disabled={save.busy} onPress={() => setAnswering(false)} />}
          </View>}
    </View>
  </View>;
}

// The scene edge to edge under the header, with the screen title on a pill at its top.
function SceneImage({ source, titleHe, width, height, gutter }: { source: ImageSourcePropType; titleHe: string; width: number; height: number; gutter: number }) {
  return <View style={{ width, height, marginHorizontal: -gutter, marginTop: -4 }}>
    <Image source={source} style={{ width, height }} contentFit="cover" accessible={false} />
    <TitlePill titleHe={titleHe} />
  </View>;
}

// The same scene, narrow, above the answers (the approved poster: cream frame, round corners).
function StripImage({ source, titleHe, width }: { source: ImageSourcePropType; titleHe: string; width: number }) {
  const height = width * STRIP_RATIO;
  return <View style={[styles.strip, { width, height }]}>
    <Image source={source} style={{ width: width - 12, height: height - 12 }} contentFit="cover" accessible={false} />
    <TitlePill titleHe={titleHe} />
  </View>;
}

function TitlePill({ titleHe }: { titleHe: string }) {
  return <View style={styles.pill}><Text accessibilityRole="header" style={styles.pillText}>{titleHe}</Text></View>;
}

function PlayableLine({ source, ...props }: { source: AudioSource; turn: TurnLine; avatar: TurnAvatar; width: number;
  translated: boolean; onTranslate: (() => void) | null }) {
  const playback = usePlayback(source);
  const { playing, loaded, failure } = playback;
  return <View style={styles.lineStack}>
    <TurnCard {...props} playing={playing}
      play={<TurnPlay label={playing ? `עצירת השמעה: ${props.turn.textEs}` : `השמעה: ${props.turn.textEs}`}
        playing={playing} disabled={!loaded} busy={playback.busy} onPress={playback.toggle} />} />
    {failure ? <View style={styles.lineStack}>
      <View style={styles.alert}><Text accessibilityRole="alert" style={styles.alertText}>{failure}</Text></View>
      <LessonSecondaryButton label="טעינת השמע מחדש" onPress={playback.reload} />
    </View> : null}
  </View>;
}

type TicketState = 'default' | 'wrong' | 'right' | 'dimmed';

// Spanish phrase ticket (Figma "Lesson / Phrase ticket" 78:309, Direction=LTR, approved
// 2026-10-28). It reads left to right: the hole, the perforation, the phrase and, at the
// right end, the mark. A wrong ticket shakes and is pink for a moment, then looks as
// before and stays tappable; after the right one the others dim.
function PhraseTicket({ textEs, state, shake, disabled, onPress }: { textEs: string; state: TicketState; shake: number; disabled: boolean; onPress: () => void }) {
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
    <Pressable accessibilityRole="radio" accessibilityLabel={textEs} accessibilityLanguage="es-MX"
      accessibilityState={{ checked: state === 'right', disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.ticket, ticketBackground[state], pressed && styles.pressed]}>
      <Svg width={12} height={12} accessible={false}><Circle cx={6} cy={6} r={6} fill={c.night} /></Svg>
      <Svg width={2} height={36} accessible={false}><Line x1={1} x2={1} y1={0} y2={36} stroke={c.night} strokeWidth={2} strokeDasharray="3.6 3.6" /></Svg>
      <Text style={[styles.ticketText, { color: ink }]}>{textEs}</Text>
      {state === 'wrong' ? <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
        <Path d="M6 6L12 12M12 12L18 18M12 12L18 6M12 12L6 18" strokeWidth={3} strokeLinecap="round" stroke={c.plum} />
      </Svg> : state === 'right' ? <CheckIcon size={24} color={c.night} /> : null}
    </Pressable>
  </Animated.View>;
}
const ticketBackground = StyleSheet.create({
  default: { backgroundColor: c.cream },
  wrong: { backgroundColor: c.pink },
  right: { backgroundColor: c.gold },
  dimmed: { backgroundColor: c.cream, opacity: 0.45 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night },
  content: { paddingTop: 4, paddingBottom: 24, gap: 16 },
  title: { fontFamily: f.poster, fontSize: 50, lineHeight: 54, color: c.cream, writingDirection: 'rtl' },
  strip: { borderWidth: 6, borderColor: c.cream, borderRadius: 18, overflow: 'hidden' },
  // At the image's start corner (the right in Hebrew), over a dark pill so it reads on any scene.
  pill: { position: 'absolute', top: 8, start: 10, backgroundColor: 'rgba(15,51,51,0.78)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 2 },
  pillText: { fontFamily: f.poster, fontSize: 24, lineHeight: 30, color: c.cream, writingDirection: 'rtl' },
  context: { fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.cream, writingDirection: 'rtl' },
  ending: { fontFamily: f.bold, fontSize: 21, lineHeight: 32, color: c.cream, writingDirection: 'rtl' },
  prompt: { fontFamily: f.bold, fontSize: 17, lineHeight: 24, color: c.cream, writingDirection: 'rtl' },
  // Under the ending text, centered and in the flow, so it never covers Juan's line
  // (Figma End 89:1771, Dor 2026-10-28). The column gap plus 8 makes the approved 24.
  stampRow: { alignItems: 'center', marginTop: 8 },
  stamp: { position: 'relative' },
  lineStack: { gap: 10 },
  alert: { backgroundColor: c.pink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  alertText: { fontFamily: f.body, fontSize: 15, lineHeight: 22, color: c.plum, writingDirection: 'rtl' },
  answers: { gap: 10 },
  // Spanish reads left to right whatever the app direction, so here start is the left:
  // the hole's end has the small radius, the mark's end the large one.
  ticket: {
    direction: 'ltr', minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingStart: 16, paddingEnd: 18, paddingVertical: 14,
    borderTopStartRadius: 12, borderBottomStartRadius: 12, borderTopEndRadius: 26, borderBottomEndRadius: 26,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 8 },
  },
  ticketText: { flex: 1, fontFamily: f.heavy, fontSize: 26, lineHeight: 32, textAlign: 'left', writingDirection: 'ltr' },
  footer: { paddingTop: 12 },
  back: { flex: 1 },
  next: { flex: 2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
