import type { ReactNode } from 'react';
import { ActivityIndicator, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { retro } from '../theme';
import { LearnerBadge, LessonAvatar } from './lesson-avatar';
import type { FaceCrop } from './media';

// One spoken line (Figma "Lesson / Dialogue turn" 86:913), shared by the dialogue and
// Juan's line in the scenario (template 89:1838).
const c = retro.colors;
const f = retro.fonts;
export const BADGE = 56;

export type TurnLine = { speaker: 'character' | 'learner'; speakerNameHe: string; textEs: string; translationHe: string };
export type TurnAvatar = { source: ImageSourcePropType; crop: FaceCrop } | null;
// onTranslate null: the line offers no translation link.
export type TurnProps = { turn: TurnLine; avatar: TurnAvatar; width: number; translated: boolean; onTranslate: (() => void) | null };

// Layout approved by Dor 2026-10-28. Juan's card: cream with a postage stamp, tilted +1°,
// avatar on the right. The learner's: gold, tilted −1.2°, the plane badge on the left.
// The name sits alone on top, play beside the Spanish line, and "הצגת תרגום" at the
// bottom; the translation takes its place, and tapping it hides it again. Playing adds an
// outline and sound bars.
export function TurnCard({ turn, avatar, width, translated, onTranslate, playing, play }: TurnProps & { playing: boolean; play: ReactNode }) {
  const learner = turn.speaker === 'learner';
  const badge = learner
    ? <LearnerBadge size={BADGE} />
    : avatar ? <LessonAvatar {...avatar} size={BADGE} /> : <View style={styles.badgeSpace} />;
  const body = <View style={[styles.card, learner ? styles.learnerCard : styles.characterCard, { width }]}>
    {playing ? <View pointerEvents="none" style={[styles.outline, learner ? styles.learnerOutline : styles.characterOutline,
      { borderColor: learner ? c.cream : c.sunset }]} /> : null}
    <View style={styles.speakerRow}>
      <Text style={[styles.speakerName, learner && styles.learnerName]}>{turn.speakerNameHe}</Text>
      {playing ? <SoundBars color={learner ? c.night : c.sunset} /> : null}
    </View>
    {/* Spanish reads left to right: play first, then the line. */}
    <View style={styles.spanishLine}>
      {play}
      <Text selectable accessibilityLanguage="es-MX" style={styles.spanish}>{turn.textEs}</Text>
    </View>
    {!onTranslate ? null : translated
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
export function TurnPlay({ label, playing, disabled = false, busy = false, onPress }: { label: string; playing: boolean; disabled?: boolean; busy?: boolean; onPress: () => void }) {
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

const RADIUS = 20, SHARP = 6, OUTLINE = 5;
const shadow = { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 13, shadowOffset: { width: 0, height: 14 } };

const styles = StyleSheet.create({
  turn: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  // flex-start is the right edge in RTL, flex-end the left.
  characterTurn: { justifyContent: 'flex-start', transform: [{ rotate: '1deg' }] },
  learnerTurn: { justifyContent: 'flex-end', transform: [{ rotate: '-1.2deg' }] },
  badgeSpace: { width: BADGE },
  card: { paddingTop: 14, paddingBottom: 16, paddingHorizontal: 16, gap: 6, borderRadius: RADIUS, ...shadow },
  // The sharp corner points at the speaker: top right for Juan, top left for the learner.
  characterCard: { backgroundColor: c.cream, borderTopStartRadius: SHARP },
  learnerCard: { backgroundColor: c.gold, borderTopEndRadius: SHARP },
  // Playing (Figma 86:1186): 5pt outside the card, each corner the card's radius plus 5,
  // so the sharp corner by the speaker stays sharp.
  outline: { position: 'absolute', top: -OUTLINE, bottom: -OUTLINE, start: -OUTLINE, end: -OUTLINE, borderWidth: 3, borderRadius: RADIUS + OUTLINE },
  characterOutline: { borderTopStartRadius: SHARP + OUTLINE },
  learnerOutline: { borderTopEndRadius: SHARP + OUTLINE },
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
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
