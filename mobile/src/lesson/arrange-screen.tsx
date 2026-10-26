import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { AttemptResult } from '../../../content/src/progress-types';
import { retro } from '../theme';
import { LessonButton, LessonButtonRow, LessonSaveError, LessonSecondaryButton, type SaveState } from './lesson-button';
import { LessonHeader } from './lesson-header';
import { ContinueSheet, Stamp, SuccessSheet } from './lesson-sheet';
import type { LessonResponse } from './opening-data';
import { Perforation } from './vocabulary-card-screen';

// Arrange (Figma "Template / Arrange" 88:1844, approved by Dor 2026-10-26, card 06.4):
// rebuild a prepared expression from word tiles on a boarding pass. Tap a tile to drop
// it into the next free slot, tap a placed tile to send it back; there is no dragging.
// "בדיקה" sends the order and the server decides: the app never knows the right order.
// A wrong order stays in place in pink and the first change clears it. The hint comes
// from the server, which records it as help. "חזרה" shows in every state.
const c = retro.colors;
const f = retro.fonts;
const FRAME = 6, PASS_PAD = 14, SLOT_GAP = 10, SLOT_MAX = 144;

export type ArrangeContent = { id: string; titleHe: string; promptHe: string; tiles: { id: string; textEs: string }[]; helpId: string | null };

type Props = {
  content: ArrangeContent; header: { code: string; index: number; count: number }; unitShort: string;
  reviewOnly: boolean; save: SaveState;
  // Resolves with the server's reply, or null when it was not confirmed (the save error says why).
  onAnswer: (response: LessonResponse) => Promise<AttemptResult | null>;
  onContinue: () => void; onBack: () => void; onClose: () => void;
};

type Feedback = { kind: 'retry' | 'correct'; messageHe: string };

export function ArrangeScreen({ content, header, unitShort, reviewOnly, save, onAnswer, onContinue, onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const column = Math.min(windowWidth, 600) - 40;
  const gutter = (windowWidth - column) / 2;
  const count = content.tiles.length;
  const inner = column - 2 * FRAME - 2 * PASS_PAD;
  const slotWidth = Math.min(SLOT_MAX, (inner - SLOT_GAP * (count - 1)) / count);
  // slots[i] is the id of the tile in answer slot i, or null while it is empty.
  const [slots, setSlots] = useState<(string | null)[]>(() => content.tiles.map(() => null));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hint, setHint] = useState<{ titleHe: string; bodyHe: string } | null>(null);
  const [wrongTaps, setWrongTaps] = useState(0);
  const solved = feedback?.kind === 'correct';
  // A solved check seen again through "חזרה" is view-only: nothing to arrange.
  const locked = reviewOnly && !solved;
  const editable = !save.busy && !solved && !locked;
  const full = slots.every(id => id !== null);
  const textOf = (tileId: string) => content.tiles.find(t => t.id === tileId)?.textEs ?? '';

  // Any change after a wrong order clears the pink and the message.
  function edit(next: (string | null)[]) {
    setSlots(next);
    if (feedback?.kind === 'retry') setFeedback(null);
  }
  function place(tileId: string) {
    const free = slots.indexOf(null);
    if (!editable || free === -1 || slots.includes(tileId)) return;
    edit(slots.map((id, i) => i === free ? tileId : id));
  }
  function unplace(slot: number) {
    if (!editable || slots[slot] === null) return;
    edit(slots.map((id, i) => i === slot ? null : id));
  }
  async function check() {
    if (!editable || !full) return;
    const result = await onAnswer({ kind: 'arrange', tileIds: slots as string[] });
    if (!result) return;
    if (result.outcome === 'correct' || result.outcome === 'correct_with_help') {
      setFeedback({ kind: 'correct', messageHe: result.feedbackHe ?? '' });
    } else if (result.outcome === 'retry') {
      setFeedback({ kind: 'retry', messageHe: result.feedbackHe ?? '' });
      setWrongTaps(n => n + 1);
    }
  }
  async function showHint() {
    if (!content.helpId || save.busy || locked) return;
    const result = await onAnswer({ kind: 'help', helpId: content.helpId });
    const revealed = result?.revealed;
    if (revealed && 'bodyHe' in revealed && !('type' in revealed)) setHint({ titleHe: revealed.titleHe, bodyHe: revealed.bodyHe });
  }

  const slotState = (id: string | null): TileState => id === null ? 'ghost' : solved ? 'right' : feedback?.kind === 'retry' ? 'wrong' : 'placed';
  const pad = (n: number) => String(n).padStart(2, '0');
  const code = `${unitShort}·${pad(header.index + 1)}`;

  return <View style={styles.root}>
    <StatusBar style="light" />
    <LessonHeader code={header.code} index={header.index} count={header.count} onClose={onClose} topInset={insets.top} />
    <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>{content.titleHe}</Text>
        <Text style={styles.prompt}>{content.promptHe}</Text>
      </View>
      <View style={styles.pass}>
        <View style={styles.answerArea}>
          <Text style={styles.code}>SBT·001 · {code}</Text>
          <Shake count={wrongTaps}>
            <View style={styles.slots}>
              {slots.map((id, i) => <View key={i} style={[styles.slot, { width: slotWidth }, feedback?.kind === 'retry' && styles.slotRetry]}>
                {id === null ? <Text style={styles.slotNumber}>{pad(i + 1)}</Text>
                  : <PlacedTile textEs={textOf(id)} state={slotState(id)} width={slotWidth - 8} disabled={!editable}
                    onPress={() => unplace(i)} />}
              </View>)}
            </View>
          </Shake>
        </View>
        <Perforation width={column} />
        <View style={styles.stub}>
          <Barcode />
          <Text style={styles.stubCode}>Nº {pad(header.index + 1)}/{pad(header.count)}</Text>
        </View>
        {solved ? <Stamp code={code} style={styles.stamp} /> : null}
      </View>
      <View style={styles.tray}>
        {content.tiles.map(tile => <TrayTile key={tile.id} textEs={tile.textEs} ghost={slots.includes(tile.id) || solved}
          disabled={!editable || full} onPress={() => place(tile.id)} />)}
      </View>
      <View style={styles.messages}>
        {hint ? <HintBox titleHe={hint.titleHe} bodyHe={hint.bodyHe} /> : null}
        {feedback?.kind === 'retry' ? <View style={styles.retryBox}>
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.retryText}>{feedback.messageHe}</Text>
        </View> : null}
        {content.helpId && !hint && !solved && !locked ? <Pressable accessibilityRole="button" accessibilityLabel="רמז"
          disabled={save.busy} onPress={() => { void showHint(); }} style={({ pressed }) => [styles.hintPill, pressed && styles.pressed]}>
          <Text style={styles.hintPillLabel}>רמז</Text>
          <TipIcon size={16} color={c.night} />
        </Pressable> : null}
      </View>
    </ScrollView>
    {feedback?.kind === 'correct' ? <SuccessSheet messageHe={feedback.messageHe} bottomInset={insets.bottom} onContinue={onContinue} onBack={onBack} />
      : locked ? <ContinueSheet bottomInset={insets.bottom} onContinue={onContinue} onBack={onBack} />
        : <View style={[styles.footer, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, 20) }]}>
          <LessonSaveError message={save.errorHe} />
          <LessonButtonRow>
            {/* Right to left: back on the right, the check on the left at twice its width. */}
            <View style={styles.back}><LessonSecondaryButton label="חזרה" disabled={save.busy} onPress={onBack} /></View>
            <View style={styles.next}><LessonButton label="בדיקה" busy={save.busy} disabled={!full} onPress={() => { void check(); }} /></View>
          </LessonButtonRow>
        </View>}
  </View>;
}

// A wrong order shakes the answer row; still under reduced motion.
function Shake({ count, children }: { count: number; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);
  useEffect(() => {
    if (!count || reduceMotion) return;
    const step = (x: number) => withTiming(x, { duration: 75 });
    offset.value = withSequence(step(-8), step(8), step(-6), step(6), step(-3), step(0));
  }, [count, reduceMotion, offset]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

type TileState = 'placed' | 'wrong' | 'right' | 'ghost';

// A tile in an answer slot (Figma "Lesson / Word tile" Placed, Wrong, Right). Tapping it
// sends it back to the tray until the order is right.
function PlacedTile({ textEs, state, width, disabled, onPress }: { textEs: string; state: TileState; width: number; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={textEs} accessibilityLanguage="es-MX"
    accessibilityHint="מחזיר את המילה למטה" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.placed, placedBackground[state], { width }, pressed && styles.pressed]}>
    <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.word, state === 'wrong' && { color: c.plum }]}>{textEs}</Text>
  </Pressable>;
}
const placedBackground = StyleSheet.create({
  placed: { backgroundColor: c.cream },
  wrong: { backgroundColor: c.pink },
  right: { backgroundColor: c.gold },
  ghost: {},
});

// Luggage-tag tile in the tray (Figma Word tile Free). Once placed, its place keeps the
// same size as a dashed outline (Ghost), so the other tiles do not move.
function TrayTile({ textEs, ghost, disabled, onPress }: { textEs: string; ghost: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={textEs} accessibilityLanguage="es-MX"
    accessibilityElementsHidden={ghost} importantForAccessibility={ghost ? 'no-hide-descendants' : 'auto'}
    accessibilityState={{ disabled: disabled || ghost }} disabled={disabled || ghost} onPress={onPress}
    style={({ pressed }) => [styles.tag, ghost ? styles.tagGhost : styles.tagFree, pressed && styles.pressed]}>
    <View style={[styles.tagInside, ghost && styles.hidden]}>
      <Svg width={12} height={12} accessible={false}><Circle cx={6} cy={6} r={6} fill={c.night} /></Svg>
      <Svg width={2} height={40} accessible={false}><Line x1={1} x2={1} y1={0} y2={40} stroke={c.night} strokeWidth={2} strokeDasharray="3.6 3.6" /></Svg>
      <Text style={styles.word}>{textEs}</Text>
    </View>
  </Pressable>;
}

// The hint as the server sent it (Figma "Hint box" 88:1594).
function HintBox({ titleHe, bodyHe }: { titleHe: string; bodyHe: string }) {
  return <View style={styles.hintBox} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
    <TipIcon size={22} color={c.rust} />
    <View style={styles.hintText}>
      <Text style={styles.hintTitle}>{titleHe}</Text>
      <Text style={styles.hintBody}>{bodyHe}</Text>
    </View>
  </View>;
}

// Figma "Icon / Tip" 77:263, drawn on a 22pt grid.
function TipIcon({ size, color }: { size: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 22 22" fill="none" accessible={false}>
    <Path d="M15.125 11C15.125 13.2782 13.2782 15.125 11 15.125C8.72183 15.125 6.875 13.2782 6.875 11C6.875 8.72183 8.72183 6.875 11 6.875C13.2782 6.875 15.125 8.72183 15.125 11Z" strokeWidth={size < 20 ? 3 : 2.2} stroke={color} />
    <Path d="M11 2.29167V4.58333M11 17.4167V19.7083M2.29167 11H4.58333M17.4167 11H19.7083M4.85833 4.85833L6.50833 6.50833M15.4917 15.4917L17.1417 17.1417M4.85833 17.1417L6.50833 15.4917M15.4917 6.50833L17.1417 4.85833" strokeWidth={size < 20 ? 3 : 2.2} strokeLinecap="round" stroke={color} />
  </Svg>;
}

const BAR_WIDTHS = [3, 1.5, 4, 1.5, 2.5, 5, 1.5, 3, 1.5, 4, 2, 1.5, 5, 2, 1.5, 3, 4, 1.5, 2.5, 1.5, 5, 2, 3, 1.5, 4, 2, 1.5, 5];
const BAR_GAP = 2.5;
// Each bar starts where the previous one and its gap end.
const BARS = BAR_WIDTHS.map((width, i) => ({ width, x: BAR_WIDTHS.slice(0, i).reduce((sum, w) => sum + w + BAR_GAP, 0) }));

function Barcode() {
  return <Svg width={150} height={22} accessible={false}>
    {BARS.filter(bar => bar.x + bar.width <= 150).map((bar, i) => <Rect key={i} x={bar.x} width={bar.width} height={22} fill={c.night} />)}
  </Svg>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.night },
  content: { paddingTop: 4, paddingBottom: 24, gap: 28 },
  heading: { gap: 6 },
  title: { fontFamily: f.poster, fontSize: 50, lineHeight: 54, color: c.cream, writingDirection: 'rtl' },
  prompt: { fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.cream, writingDirection: 'rtl' },
  pass: { marginTop: 14, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 15, shadowOffset: { width: 0, height: 22 } },
  answerArea: {
    backgroundColor: c.deep, borderColor: c.cream, borderTopWidth: FRAME, borderLeftWidth: FRAME, borderRightWidth: FRAME,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, paddingBottom: 18, paddingHorizontal: PASS_PAD, gap: 14,
    // Codes and Spanish words: the whole area reads left to right.
    direction: 'ltr',
  },
  code: { fontFamily: f.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.5, color: c.gold, writingDirection: 'ltr' },
  // Spanish reads left to right whatever the app direction: slots and tray are LTR.
  slots: { flexDirection: 'row', justifyContent: 'center', gap: SLOT_GAP },
  slot: { height: 64, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: c.cream, alignItems: 'center', justifyContent: 'center' },
  slotRetry: { borderColor: c.pink },
  slotNumber: { fontFamily: f.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.5, color: c.cream, opacity: 0.4 },
  placed: {
    height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 0, shadowOffset: { width: 0, height: 6 },
  },
  word: { fontFamily: f.heavy, fontSize: 25, lineHeight: 32, color: c.night, textAlign: 'center' },
  stub: {
    backgroundColor: c.cream, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingBottom: 10, paddingHorizontal: 18,
    flexDirection: 'row', direction: 'ltr', alignItems: 'center', justifyContent: 'space-between',
  },
  stubCode: { fontFamily: f.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.5, color: c.inkMuted },
  // Figma: over the pass's lower-left corner, 14pt past its edge ("end" is the left in RTL).
  stamp: { top: 114, end: -14 },
  tray: { flexDirection: 'row', direction: 'ltr', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 20 },
  tag: { height: 64, minWidth: 132, borderTopLeftRadius: 26, borderBottomLeftRadius: 26, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  tagFree: { backgroundColor: c.cream, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 8 } },
  tagGhost: { borderWidth: 2, borderStyle: 'dashed', borderColor: c.cream },
  tagInside: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingLeft: 14, paddingRight: 18 },
  hidden: { opacity: 0 },
  messages: { gap: 12, alignItems: 'stretch' },
  hintBox: { backgroundColor: c.cream, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  hintText: { flex: 1, gap: 2 },
  hintTitle: { fontFamily: f.heavy, fontSize: 14, lineHeight: 20, color: c.rust, writingDirection: 'rtl' },
  hintBody: { fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.night, writingDirection: 'rtl' },
  retryBox: { backgroundColor: c.pink, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  retryText: { fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.plum, writingDirection: 'rtl' },
  hintPill: {
    alignSelf: 'center', height: 44, borderRadius: 22, backgroundColor: c.cream, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 6 },
  },
  hintPillLabel: { fontFamily: f.bold, fontSize: 15, lineHeight: 24, color: c.night, writingDirection: 'rtl' },
  footer: { paddingTop: 12 },
  back: { flex: 1 },
  next: { flex: 2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
