import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { AudioSource } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { retro } from '../theme';
import { BADGE, TurnCard, type TurnAvatar, TurnPlay, type TurnProps } from './dialogue-turn';
import { LessonAudioButton, LessonButton, LessonButtonRow, LessonSaveError, LessonSecondaryButton, type SaveState } from './lesson-button';
import { LessonHeader } from './lesson-header';
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

export type DialogueContent = {
  id: string; titleHe: string; translationInitiallyVisible: boolean;
  turns: { id: string; speaker: 'character' | 'learner'; speakerNameHe: string; textEs: string; translationHe: string }[];
};

type Props = {
  content: DialogueContent; avatars: TurnAvatar[]; audio: (AudioSource | null)[];
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night },
  heading: { paddingTop: 4, gap: 4 },
  title: { fontFamily: f.poster, fontSize: 50, lineHeight: 54, color: c.cream, writingDirection: 'rtl' },
  instruction: { fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.cream, writingDirection: 'rtl' },
  turns: { paddingTop: 22, paddingBottom: 24, gap: 30 },
  turnStack: { gap: 10 },
  errorStack: { gap: 10 },
  alert: { backgroundColor: c.pink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  alertText: { fontFamily: f.body, fontSize: 15, lineHeight: 22, color: c.plum, writingDirection: 'rtl' },
  footer: { paddingTop: 16, gap: 12 },
  back: { flex: 1 },
  next: { flex: 2 },
});
